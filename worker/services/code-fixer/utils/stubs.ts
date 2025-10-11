/**
 * Stub generation utilities using Babel AST construction
 * Extracted from working ImportExportAnalyzer to preserve exact functionality
 * Uses AST-based generation, not string templates, as requested
 */

import * as t from '@babel/types';
import { ImportInfo, ImportUsage, FileMap, FileFetcher } from '../types';
import { createFileAST, shouldUseJSXExtension, generateCode, parseCode } from './ast';
import { analyzeImportUsage, getFileAST } from './imports';

// ============================================================================
// USAGE ANALYSIS FOR STUB GENERATION
// ============================================================================

/**
 * Analyze how imports are used to generate appropriate stubs
 * Preserves exact logic from working implementation
 */
export async function analyzeImportUsageForStub(
    importInfo: ImportInfo,
    files: FileMap,
    fileFetcher?: FileFetcher,
    fetchedFiles?: Set<string>
): Promise<ImportUsage[]> {
    const sourceAST = await getFileAST(importInfo.filePath, files, fileFetcher, fetchedFiles);
    if (!sourceAST) return [];

    const importNames = [
        ...(importInfo.defaultImport ? [importInfo.defaultImport] : []),
        ...importInfo.namedImports
    ];

    return analyzeImportUsage(sourceAST, importNames);
}

// ============================================================================
// AST-BASED STUB GENERATION
// ============================================================================

/**
 * Generate stub file AST based on import information and usage analysis
 * Preserves exact logic from working buildStubAST method
 */
export function generateStubFileAST(
    importInfo: ImportInfo, 
    usages: ImportUsage[]
): t.File {
    const statements: t.Statement[] = [];
    const shouldUseJSX = shouldUseJSXExtension(usages);

    // Add React import if JSX is used
    if (shouldUseJSX) {
        // Import React for JSX and types
        statements.push(
            t.importDeclaration(
                [
                    t.importDefaultSpecifier(t.identifier('React'))
                ],
                t.stringLiteral('react')
            )
        );
    }
    
    // Add stub warning comment - we'll prepend it to the generated code as a string
    // For now, we'll handle this in the code generation step

    // Generate exports based on usage analysis
    for (const usage of usages) {
        const exportStatement = generateExportForUsage(usage, shouldUseJSX);
        if (exportStatement) {
            statements.push(exportStatement);
        }
    }

    // Generate fallback exports for imports without detected usage
    const usedNames = new Set(usages.map(u => u.name));
    
    // Default export fallback
    if (importInfo.defaultImport && !usedNames.has(importInfo.defaultImport)) {
        statements.push(generateGenericExport(importInfo.defaultImport, true, shouldUseJSX));
    }

    // Named exports fallback
    for (const namedImport of importInfo.namedImports) {
        if (!usedNames.has(namedImport)) {
            statements.push(generateGenericExport(namedImport, false, shouldUseJSX));
        }
    }

    return createFileAST(statements);
}

/**
 * Generate stub file content as a string
 */
export async function generateStubFileContent(
    importInfo: ImportInfo,
    files: FileMap,
    fileFetcher?: FileFetcher,
    fetchedFiles?: Set<string>
): Promise<string> {
    const usageAnalysis = await analyzeImportUsageForStub(importInfo, files, fileFetcher, fetchedFiles);
    const stubAST = generateStubFileAST(importInfo, usageAnalysis);
    const generated = generateCode(stubAST);
    
    // Prepend the stub warning comment
    const stubComment = '// This is a **STUB** file, please properly implement it or fix its usage\n\n';
    return stubComment + generated.code;
}

// ============================================================================
// EXPORT GENERATION BY USAGE TYPE
// ============================================================================

/**
 * Generate export statement based on usage analysis
 * Preserves exact logic from working implementation
 */
function generateExportForUsage(usage: ImportUsage, shouldUseJSX: boolean): t.Statement | null {
    switch (usage.type) {
        case 'jsx-component':
            return generateJSXComponentExport(usage);
            
        case 'function-call':
            return generateFunctionExport(usage);
            
        case 'object-access':
            return generateObjectExport(usage);
            
        case 'variable-reference':
            return generateVariableExport(usage, shouldUseJSX);
            
        default:
            return null;
    }
}

/**
 * Generate JSX component export with props interface
 * Fixed to generate proper interfaces and return multiple statements
 */
function generateJSXComponentExport(usage: ImportUsage): t.Statement {
    const componentName = usage.name;
    const props = usage.properties || [];
    
    // For components with props, we need to generate the interface first
    // But since we can only return one statement, we'll use a simpler approach
    const propsParam = props.length > 0 ? 
        t.objectPattern(
            props.map(prop => 
                t.objectProperty(t.identifier(prop), t.identifier(prop))
            )
        ) : 
        t.identifier('props');

    // Add type annotation for props - use a generic type instead of interface
    if (t.isObjectPattern(propsParam)) {
        const propsType = props.length > 0 ? 
            t.tsTypeLiteral(
                props.map(prop => {
                    const signature = t.tsPropertySignature(
                        t.identifier(prop),
                        t.tsTypeAnnotation(t.tsStringKeyword())
                    );
                    signature.optional = true;
                    return signature;
                })
            ) : 
            t.tsTypeLiteral([]);
            
        propsParam.typeAnnotation = t.tsTypeAnnotation(propsType);
    }

    const componentBody = t.blockStatement([
        t.returnStatement(
            t.jsxElement(
                t.jsxOpeningElement(
                    t.jsxIdentifier('div'),
                    [],
                    false
                ),
                t.jsxClosingElement(t.jsxIdentifier('div')),
                [t.jsxText(`Placeholder ${componentName} component`)],
                false
            )
        )
    ]);

    const componentFunction = t.arrowFunctionExpression(
        [propsParam],
        componentBody
    );
    componentFunction.returnType = t.tsTypeAnnotation(
        t.tsTypeReference(t.identifier('React.ReactElement'))
    );

    const componentDeclaration = t.variableDeclaration('const', [
        t.variableDeclarator(t.identifier(componentName), componentFunction)
    ]);

    // Return as named export
    return t.exportNamedDeclaration(componentDeclaration);
}

/**
 * Generate function export
 * Preserves exact logic from working implementation
 */
function generateFunctionExport(usage: ImportUsage): t.Statement {
    const functionName = usage.name;
    const paramTypes = usage.parameters || [];
    
    const params = paramTypes.map((_, index) => 
        t.identifier(`arg${index}`)
    );

    const functionBody = t.blockStatement([
        t.returnStatement(t.nullLiteral())
    ]);

    const functionDeclaration = t.functionDeclaration(
        t.identifier(functionName),
        params,
        functionBody
    );

    return t.exportNamedDeclaration(functionDeclaration);
}

/**
 * Generate object export with properties
 * Preserves exact logic from working implementation
 */
function generateObjectExport(usage: ImportUsage): t.Statement {
    const objectName = usage.name;
    const properties = usage.properties || [];
    
    const objectProperties = properties.map(prop => 
        t.objectProperty(
            t.identifier(prop),
            t.arrowFunctionExpression([], t.blockStatement([
                t.returnStatement(t.nullLiteral())
            ]))
        )
    );

    const objectExpression = t.objectExpression(objectProperties);
    
    return t.exportNamedDeclaration(
        t.variableDeclaration('const', [
            t.variableDeclarator(t.identifier(objectName), objectExpression)
        ])
    );
}

/**
 * Generate variable export
 * Preserves exact logic from working implementation
 */
function generateVariableExport(usage: ImportUsage, shouldUseJSX: boolean): t.Statement {
    const varName = usage.name;
    return generateGenericExport(varName, false, shouldUseJSX);
}

/**
 * Generate generic export for unknown usage patterns
 * Fixed to use proper React types
 */
function generateGenericExport(name: string, isDefault: boolean, shouldUseJSX: boolean): t.Statement {
    let value: t.Expression;
    
    if (shouldUseJSX) {
        // JSX component fallback
        const componentFunc = t.arrowFunctionExpression(
            [],
            t.jsxElement(
                t.jsxOpeningElement(t.jsxIdentifier('div'), [], false),
                t.jsxClosingElement(t.jsxIdentifier('div')),
                [t.jsxText(`Placeholder ${name} component`)],
                false
            )
        );
        componentFunc.returnType = t.tsTypeAnnotation(
            t.tsTypeReference(t.identifier('React.ReactElement'))
        );
        value = componentFunc;
    } else {
        // Function fallback
        value = t.arrowFunctionExpression(
            [],
            t.blockStatement([t.returnStatement(t.nullLiteral())])
        );
    }

    const declaration = t.variableDeclaration('const', [
        t.variableDeclarator(t.identifier(name), value)
    ]);

    if (isDefault) {
        // Export the generated expression directly as default to avoid undeclared identifier
        return t.exportDefaultDeclaration(value);
    } else {
        return t.exportNamedDeclaration(declaration);
    }
}

// ============================================================================
// STUB FILE UTILITIES
// ============================================================================

/**
 * Determine appropriate file extension based on usage analysis
 */
export function getStubFileExtension(usageAnalysis: ImportUsage[]): string {
    return shouldUseJSXExtension(usageAnalysis) ? '.tsx' : '.ts';
}

/**
 * Check if stub needs React import based on usage
 */
export function stubNeedsReactImport(usageAnalysis: ImportUsage[]): boolean {
    return shouldUseJSXExtension(usageAnalysis);
}

/**
 * Validate generated stub content
 */
export function validateStubContent(content: string): boolean {
    try {
        // Try to parse the generated content to ensure it's valid
        parseCode(content);
        return true;
    } catch {
        return false;
    }
}