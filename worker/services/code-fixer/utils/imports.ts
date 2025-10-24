/**
 * Import/export analysis utilities using Babel AST traversal
 * Extracted from working ImportExportAnalyzer to preserve exact functionality
 */

import * as t from '@babel/types';
import { ImportInfo, ExportInfo, ImportUsage, FileMap } from '../types';
import { parseCode, traverseAST } from './ast';
import { createObjectLogger } from '../../../logger';

const logger = createObjectLogger({ name: 'ImportUtils' }, 'ImportUtils');

// ============================================================================
// IMPORT ANALYSIS
// ============================================================================

/**
 * Find import information at a specific line number in the AST
 * Enhanced to support dynamic imports
 */
export function findImportAtLocation(ast: t.File, line: number): ImportInfo | null {
    logger.debug(`Finding import at line ${line}`);
    let foundImport: ImportInfo | null = null;
    const allImports: Array<{ line: number; moduleSpecifier: string; defaultImport: string | undefined; namedImports: string[]; isDynamic?: boolean; }> = [];

    // First check for static imports
    const body = ast.program?.body ?? [];
    for (const node of body) {
        if (t.isImportDeclaration(node)) {
            const moduleSpecifier = t.isStringLiteral(node.source) ? node.source.value : '';
            const defaultImport = node.specifiers.find(s => t.isImportDefaultSpecifier(s))?.local.name;
            const namedImports = node.specifiers
                .filter(s => t.isImportSpecifier(s))
                .map(s => (t.isImportSpecifier(s) && t.isIdentifier(s.imported)) ? s.imported.name : '')
                .filter(Boolean);

            const startLine = node.loc?.start.line ?? 0;
            const endLine = node.loc?.end.line ?? startLine;

            allImports.push({ line: startLine, moduleSpecifier, defaultImport, namedImports });

            if (startLine <= line && endLine >= line) {
                foundImport = {
                    specifier: moduleSpecifier,
                    moduleSpecifier,
                    defaultImport,
                    namedImports,
                    filePath: '',
                };
                break;
            }
        }
    }

    // If no static import found, check for dynamic imports
    if (!foundImport) {
        traverseAST(ast, {
            CallExpression(path) {
                // Check for dynamic import() calls
                if (t.isImport(path.node.callee)) {
                    const arg = path.node.arguments[0];
                    if (t.isStringLiteral(arg)) {
                        const startLine = path.node.loc?.start.line ?? 0;
                        const endLine = path.node.loc?.end.line ?? startLine;
                        
                        if (startLine <= line && endLine >= line) {
                            // Found a dynamic import at the target line
                            foundImport = {
                                specifier: arg.value,
                                moduleSpecifier: arg.value,
                                defaultImport: undefined,
                                namedImports: [],
                                filePath: '',
                            };
                            path.stop();
                        }
                    }
                }
            },
            
            // Handle await import() patterns
            AwaitExpression(path) {
                if (t.isCallExpression(path.node.argument) && t.isImport(path.node.argument.callee)) {
                    const arg = path.node.argument.arguments[0];
                    if (t.isStringLiteral(arg)) {
                        const startLine = path.node.loc?.start.line ?? 0;
                        const endLine = path.node.loc?.end.line ?? startLine;
                        
                        if (startLine <= line && endLine >= line) {
                            foundImport = {
                                specifier: arg.value,
                                moduleSpecifier: arg.value,
                                defaultImport: undefined,
                                namedImports: [],
                                filePath: '',
                            };
                            path.stop();
                        }
                    }
                }
            },
            
            // Handle const module = await import() patterns
            VariableDeclarator(path) {
                if (t.isAwaitExpression(path.node.init) && 
                    t.isCallExpression(path.node.init.argument) && 
                    t.isImport(path.node.init.argument.callee)) {
                    const arg = path.node.init.argument.arguments[0];
                    if (t.isStringLiteral(arg) && t.isIdentifier(path.node.id)) {
                        const startLine = path.node.loc?.start.line ?? 0;
                        const endLine = path.node.loc?.end.line ?? startLine;
                        
                        if (startLine <= line && endLine >= line) {
                            foundImport = {
                                specifier: arg.value,
                                moduleSpecifier: arg.value,
                                defaultImport: path.node.id.name,
                                namedImports: [],
                                filePath: '',
                            };
                            path.stop();
                        }
                    }
                }
            }
        });
    }

    if (foundImport) {
        logger.debug(`Found import at line ${line}: ${JSON.stringify(foundImport)}`);
    } else {
        logger.debug(`No import found at line ${line}. Available imports: ${allImports.map(i => `${i.moduleSpecifier}:${i.line}`).join(', ')}`);
    }

    logger.debug(`All imports found: count=${allImports.length}, first few: ${allImports.slice(0, 5).map(i => `${i.moduleSpecifier}:${i.line}`).join(', ')}${allImports.length > 5 ? ', ...' : ''}`);
    return foundImport;
}

/**
 * Get all imports from a file AST
 */
export function getAllImports(ast: t.File): ImportInfo[] {
    const imports: ImportInfo[] = [];
    
    traverseAST(ast, {
        ImportDeclaration(path) {
            const moduleSpecifier = t.isStringLiteral(path.node.source) ? path.node.source.value : '';
            const defaultImport = path.node.specifiers.find(s => t.isImportDefaultSpecifier(s))?.local.name;
            const namedImports = path.node.specifiers
                .filter(s => t.isImportSpecifier(s))
                .map(s => t.isImportSpecifier(s) && t.isIdentifier(s.imported) ? s.imported.name : '')
                .filter(Boolean);
            
            imports.push({
                specifier: moduleSpecifier,
                moduleSpecifier: moduleSpecifier,
                defaultImport,
                namedImports,
                filePath: '',
            });
        }
    });
    
    return imports;
}

// ============================================================================
// EXPORT ANALYSIS
// ============================================================================

/**
 * Get exports information from a file AST
 * Preserves exact logic from working implementation
 */
export function getFileExports(ast: t.File): ExportInfo {
    logger.debug(`Analyzing exports in file`);
    let defaultExport: string | undefined = undefined;
    const namedExports: string[] = [];
    const reExports: string[] = [];

    traverseAST(ast, {
        ExportNamedDeclaration(path) {
            // Handle re-exports (export * from './module' or export { x } from './module')
            if (path.node.source) {
                // This is a re-export
                if (path.node.specifiers.length === 0) {
                    // export * from './module' - we can't determine specific exports without analyzing the source
                    reExports.push('*');
                } else {
                    // export { specific } from './module'
                    for (const spec of path.node.specifiers) {
                        if (t.isExportSpecifier(spec) && t.isIdentifier(spec.exported)) {
                            namedExports.push(spec.exported.name);
                        }
                    }
                }
            } else if (path.node.specifiers.length > 0) {
                // Handle regular named exports
                for (const spec of path.node.specifiers) {
                    if (t.isExportSpecifier(spec) && t.isIdentifier(spec.exported)) {
                        namedExports.push(spec.exported.name);
                    }
                }
            } else {
                // Handle export const/function/class declarations
                if (t.isVariableDeclaration(path.node.declaration)) {
                    for (const declarator of path.node.declaration.declarations) {
                        if (t.isIdentifier(declarator.id)) {
                            namedExports.push(declarator.id.name);
                        }
                    }
                } else if (t.isFunctionDeclaration(path.node.declaration) && path.node.declaration.id) {
                    namedExports.push(path.node.declaration.id.name);
                } else if (t.isClassDeclaration(path.node.declaration) && path.node.declaration.id) {
                    namedExports.push(path.node.declaration.id.name);
                } else if (t.isTSTypeAliasDeclaration(path.node.declaration) && path.node.declaration.id) {
                    // Handle TypeScript type exports
                    namedExports.push(path.node.declaration.id.name);
                } else if (t.isTSInterfaceDeclaration(path.node.declaration) && path.node.declaration.id) {
                    // Handle TypeScript interface exports
                    namedExports.push(path.node.declaration.id.name);
                }
            }
        },
        
        ExportDefaultDeclaration(path) {
            // Handle default exports
            if (t.isIdentifier(path.node.declaration)) {
                defaultExport = path.node.declaration.name;
            } else if (t.isFunctionDeclaration(path.node.declaration) && path.node.declaration.id) {
                defaultExport = path.node.declaration.id.name;
            } else if (t.isClassDeclaration(path.node.declaration) && path.node.declaration.id) {
                defaultExport = path.node.declaration.id.name;
            } else {
                defaultExport = 'default';
            }
        },
        
        ExportAllDeclaration(path) {
            // Handle export * from './module'
            if (path.node.source) {
                reExports.push('*');
            }
        }
    });

    // If there are wildcard re-exports, we can't know all exports without analyzing the source modules
    // For now, we'll indicate that with a special marker
    if (reExports.includes('*')) {
        // Add a marker to indicate there may be more exports via re-export
        namedExports.push('...re-exported');
    }

    return {
        defaultExport,
        namedExports,
        filePath: '',
    };
}

// ============================================================================
// USAGE ANALYSIS
// ============================================================================

/**
 * Analyze how imported names are used in the source file AST
 * Preserves exact logic from working implementation
 */
export function analyzeImportUsage(ast: t.File, importNames: string[]): ImportUsage[] {
    const usages: ImportUsage[] = [];

    for (const importName of importNames) {
        const usage = analyzeNameUsage(ast, importName);
        if (usage) {
            usages.push(usage);
        }
    }

    return usages;
}

/**
 * Analyze how a specific imported name is used in the AST
 * Preserves exact logic from working implementation
 */
export function analyzeNameUsage(ast: t.File, name: string): ImportUsage | null {
    let usage: ImportUsage | null = null;
    const properties: string[] = [];

    traverseAST(ast, {
        // Check for JSX component usage: <Name prop="value" />
        JSXElement: (path) => {
            if (t.isJSXIdentifier(path.node.openingElement.name) && 
                path.node.openingElement.name.name === name) {
                
                // Extract prop names from JSX attributes
                const propNames = path.node.openingElement.attributes
                    .filter(attr => t.isJSXAttribute(attr) && t.isJSXIdentifier(attr.name))
                    .map(attr => {
                        const jsxAttr = attr as t.JSXAttribute;
                        return t.isJSXIdentifier(jsxAttr.name) ? jsxAttr.name.name : '';
                    })
                    .filter(name => name !== '');
                
                properties.push(...propNames);
                usage = {
                    name,
                    type: 'jsx-component',
                    properties: [...new Set(properties)] // Remove duplicates
                };
            }
        },

        // Check for function call usage: Name(arg1, arg2)
        CallExpression: (path) => {
            if (t.isIdentifier(path.node.callee) && path.node.callee.name === name) {
                // Analyze parameters
                const argTypes = path.node.arguments.map(arg => {
                    if (t.isStringLiteral(arg)) return 'string';
                    if (t.isNumericLiteral(arg)) return 'number';
                    if (t.isBooleanLiteral(arg)) return 'boolean';
                    if (t.isObjectExpression(arg)) return 'object';
                    if (t.isArrayExpression(arg)) return 'array';
                    return 'unknown';
                });

                usage = {
                    name,
                    type: 'function-call',
                    parameters: argTypes
                };
            }
        },

        // Check for object property access: Name.property
        MemberExpression: (path) => {
            if (t.isIdentifier(path.node.object) && path.node.object.name === name) {
                if (t.isIdentifier(path.node.property)) {
                    properties.push(path.node.property.name);
                }
                
                usage = {
                    name,
                    type: 'object-access',
                    properties: [...new Set(properties)] // Remove duplicates
                };
            }
        },

        // Check for simple variable reference: const x = Name;
        Identifier: (path) => {
            if (path.node.name === name && 
                !path.isBindingIdentifier() && 
                !usage) { // Only set as fallback if no specific usage found
                
                usage = {
                    name,
                    type: 'variable-reference'
                };
            }
        }
    });

    return usage;
}

// ============================================================================
// FILE READING WITH AST CACHING
// ============================================================================

/**
 * Get file content from FileMap or fetch it if not available
 */
export function getFileContent(
    filePath: string, 
    files: FileMap, 
): string | null {
    logger.info(`ImportUtils: Getting content for file: ${filePath}`);
    
    const file = files.get(filePath);
    if (file) {
        logger.info(`ImportUtils: Found file in context: ${filePath}`);
        return file.content;
    }

    logger.info(`ImportUtils: File not found in context: ${filePath}`);
    
    return null;
}

/**
 * Get file AST from FileMap with caching, or parse it if needed
 */
export function getFileAST(
    filePath: string, 
    files: FileMap, 
): t.File | null {
    logger.info(`ImportUtils: Getting AST for file: ${filePath}`);
    
    const file = files.get(filePath);
    
    if (file?.ast) {
        logger.info(`ImportUtils: Using cached AST for ${filePath}`);
        return file.ast;
    }
    
    const content = getFileContent(filePath, files);
    if (!content) {
        logger.info(`ImportUtils: No content available for ${filePath}`);
        return null;
    }
    
    logger.info(`ImportUtils: Attempting to parse AST for ${filePath} (${content.length} characters)`);
    logger.info(`ImportUtils: First 200 characters: ${content.substring(0, 200)}`);
    
    try {
        const ast = parseCode(content);
        logger.info(`ImportUtils: Successfully parsed AST for ${filePath}`);
        // Cache AST for future calls
        const existing = files.get(filePath);
        if (existing) {
            existing.ast = ast;
        } else {
            files.set(filePath, { filePath, content, ast });
        }
        return ast;
    } catch (error) {
        logger.warn(`ImportUtils: Failed to parse AST for ${filePath}: ${error instanceof Error ? error.message : 'Unknown error'}`);
        return null;
    }
}

// ============================================================================
// IMPORT PATH UPDATING
// ============================================================================

/**
 * Update import path in AST by modifying the source value
 */
export function updateImportPath(ast: t.File, oldPath: string, newPath: string): t.File {
    const body = ast.program?.body ?? [];
    for (const node of body) {
        if (t.isImportDeclaration(node) && t.isStringLiteral(node.source) && node.source.value === oldPath) {
            node.source.value = newPath;
        }
    }
    return ast;
}

/**
 * Fix import/export mismatches by converting between default and named imports
 * Enhanced to handle complex partial matches while preserving valid imports
 */
export function fixImportExportMismatch(
    ast: t.File, 
    moduleSpecifier: string, 
    exports: ExportInfo
): { fixed: boolean; changes: string[] } {
    let fixed = false;
    const changes: string[] = [];

    traverseAST(ast, {
        ImportDeclaration(path) {
            if (t.isStringLiteral(path.node.source) && path.node.source.value === moduleSpecifier) {
                const defaultImport = path.node.specifiers.find(s => t.isImportDefaultSpecifier(s));
                const namedImports = path.node.specifiers.filter(s => t.isImportSpecifier(s));
                const namespaceImport = path.node.specifiers.find(s => t.isImportNamespaceSpecifier(s));
                
                // Build new specifiers list to preserve valid imports
                const newSpecifiers: Array<t.ImportSpecifier | t.ImportDefaultSpecifier | t.ImportNamespaceSpecifier> = [];
                
                // Handle namespace imports
                if (namespaceImport && t.isImportNamespaceSpecifier(namespaceImport)) {
                    // If module only has default export, convert namespace to default
                    if (exports.defaultExport && exports.namedExports.length === 0) {
                        newSpecifiers.push(t.importDefaultSpecifier(namespaceImport.local));
                        changes.push(`Converted namespace import '* as ${namespaceImport.local.name}' to default import`);
                        fixed = true;
                    } else {
                        // Keep namespace for mixed or named-only exports
                        newSpecifiers.push(namespaceImport);
                    }
                } else {
                    // Handle default import
                    if (defaultImport) {
                        const localName = defaultImport.local.name;
                        if (exports.defaultExport) {
                            // Default export exists, keep it
                            newSpecifiers.push(defaultImport);
                        } else {
                            // No default export, try to convert to named
                            const targetNamed = exports.namedExports.find(n => 
                                n === localName || n.toLowerCase() === localName.toLowerCase()
                            ) || exports.namedExports[0];
                            
                            if (targetNamed) {
                                newSpecifiers.push(
                                    t.importSpecifier(
                                        t.identifier(localName),
                                        t.identifier(targetNamed)
                                    )
                                );
                                changes.push(`Changed default import '${localName}' to named import '${targetNamed}'`);
                                fixed = true;
                            }
                        }
                    }
                    
                    // Handle named imports - preserve valid ones, fix invalid ones
                    const processedNames = new Set<string>();
                    for (const namedImport of namedImports) {
                        if (t.isImportSpecifier(namedImport) && t.isIdentifier(namedImport.imported)) {
                            const namedImportName = namedImport.imported.name;
                            const localAlias = t.isIdentifier(namedImport.local) ? namedImport.local.name : namedImportName;
                            
                            // Avoid duplicate processing
                            if (processedNames.has(namedImportName)) continue;
                            processedNames.add(namedImportName);
                            
                            if (exports.namedExports.includes(namedImportName)) {
                                // Valid named export, keep it
                                newSpecifiers.push(namedImport);
                            } else if (exports.defaultExport === namedImportName) {
                                // This should be a default import
                                if (!newSpecifiers.some(s => t.isImportDefaultSpecifier(s))) {
                                    newSpecifiers.unshift(
                                        t.importDefaultSpecifier(t.identifier(localAlias))
                                    );
                                    changes.push(`Changed named import '${namedImportName}' to default import`);
                                    fixed = true;
                                }
                            } else {
                                // Try case-insensitive match
                                const caseInsensitiveMatch = exports.namedExports.find(n => 
                                    n.toLowerCase() === namedImportName.toLowerCase()
                                );
                                if (caseInsensitiveMatch) {
                                    newSpecifiers.push(
                                        t.importSpecifier(
                                            t.identifier(localAlias),
                                            t.identifier(caseInsensitiveMatch)
                                        )
                                    );
                                    changes.push(`Fixed case mismatch: '${namedImportName}' → '${caseInsensitiveMatch}'`);
                                    fixed = true;
                                } else {
                                    // Import doesn't exist, skip it with warning
                                    changes.push(`Removed invalid import '${namedImportName}' (not found in exports)`);
                                    fixed = true;
                                }
                            }
                        }
                    }
                }
                
                // Update specifiers if we made changes
                if (fixed && newSpecifiers.length > 0) {
                    path.node.specifiers = newSpecifiers as typeof path.node.specifiers;
                }
            }
        }
    });

    return { fixed, changes };
}