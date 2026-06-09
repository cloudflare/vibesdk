/**
 * TS2613: Module is not a module fixer
 * Handles import/export mismatches by converting between default and named imports
 */

import { CodeIssue } from '../../sandbox/sandboxTypes';
import { FixerContext, FixResult, FixedIssue, UnfixableIssue, FileObject } from '../types';
import { generateCode } from '../utils/ast';
import { findImportAtLocation, getFileAST, getFileExports, fixImportExportMismatch } from '../utils/imports';
import * as t from '@babel/types';
import { traverseAST } from '../utils/ast';
import { findModuleFile } from '../utils/paths';
import { createObjectLogger } from '../../../logger';
import { handleFixerError } from '../utils/helpers';

const logger = createObjectLogger({ name: 'TS2613Fixer' }, 'TS2613Fixer');

/**
 * Fix TS2613 "Module is not a module" errors
 * Preserves exact logic from working ImportExportFixer.fixModuleIsNotModule
 */
export function fixModuleIsNotModule(
    context: FixerContext,
    issues: CodeIssue[]
): FixResult {
    logger.info(`Starting TS2613 fixer with ${issues.length} issues`);
    
    const fixedIssues: FixedIssue[] = [];
    const unfixableIssues: UnfixableIssue[] = [];
    const modifiedFiles: FileObject[] = [];
    const newFiles: FileObject[] = [];

    for (const issue of issues) {
        logger.info(`Processing TS2613 issue: ${issue.message} at ${issue.filePath}:${issue.line}`);
        
        try {
            logger.info(`Getting AST for file: ${issue.filePath}`);
            const ast = getFileAST(issue.filePath, context.files);
            if (!ast) {
                logger.warn(`Failed to get AST for ${issue.filePath}`);
                unfixableIssues.push({
                    issueCode: 'TS2613',
                    filePath: issue.filePath,
                    line: issue.line,
                    column: issue.column,
                    originalMessage: issue.message,
                    reason: 'Failed to parse file AST'
                });
                continue;
            }

            logger.info(`Finding import at line ${issue.line} in ${issue.filePath}`);
            const importInfo = findImportAtLocation(ast, issue.line);
            const namespaceImport = findNamespaceImportAtLocation(ast, issue.line);
            
            if (!importInfo && !namespaceImport) {
                logger.warn(`No import found at line ${issue.line} in ${issue.filePath}`);
                unfixableIssues.push({
                    issueCode: 'TS2613',
                    filePath: issue.filePath,
                    line: issue.line,
                    column: issue.column,
                    originalMessage: issue.message,
                    reason: 'No import found at specified location'
                });
                continue;
            }
            
            logger.info(`Found import: ${importInfo ? importInfo.moduleSpecifier : namespaceImport?.moduleSpecifier || 'unknown'}, default: ${importInfo ? importInfo.defaultImport : 'none'}, named: [${importInfo ? importInfo.namedImports.join(', ') : 'none'}]`);

            const moduleSpecifier = importInfo ? importInfo.moduleSpecifier : (namespaceImport?.moduleSpecifier || '');
            logger.info(`Searching for target file: ${moduleSpecifier}`);
            const targetFile = findModuleFile(
                moduleSpecifier, 
                issue.filePath, 
                context.files
            );
            
            if (!targetFile) {
                logger.warn(`Target file not found for module: ${moduleSpecifier}`);
                unfixableIssues.push({
                    issueCode: 'TS2613',
                    filePath: issue.filePath,
                    line: issue.line,
                    column: issue.column,
                    originalMessage: issue.message,
                    reason: `Target file not found for module: ${moduleSpecifier}`
                });
                continue;
            }
            logger.info(`Found target file: ${targetFile}`);

            logger.info(`Getting AST for target file: ${targetFile}`);
            const targetAST = getFileAST(targetFile, context.files);
            logger.info(`getFileAST result for ${targetFile}: ${!!targetAST}`);
            if (!targetAST) {
                logger.warn(`Failed to parse target file: ${targetFile}`);
                unfixableIssues.push({
                    issueCode: 'TS2613',
                    filePath: issue.filePath,
                    line: issue.line,
                    column: issue.column,
                    originalMessage: issue.message,
                    reason: `Failed to parse target file: ${targetFile}`
                });
                continue;
            }

            logger.info(`Analyzing exports in target file: ${targetFile}`);
            const exports = getFileExports(targetAST);
            exports.filePath = targetFile;
            logger.info(`Found exports - defaultExport: ${exports.defaultExport || 'none'}, named: [${exports.namedExports.join(', ')}]`);

            // Fix import/export mismatches using AST manipulation
            logger.info(`Attempting to fix import/export mismatch for "${moduleSpecifier}"`);
            let fixed = false;
            let changes: string[] = [];
            
            if (namespaceImport) {
                // Namespace import to default conversion
                const result = fixNamespaceImportMismatch(
                    ast,
                    namespaceImport,
                    exports
                );
                fixed = result.fixed;
                changes = result.changes;
            } else if (importInfo) {
                // Regular import fix
                const result = fixImportExportMismatch(
                    ast,
                    moduleSpecifier,
                    exports
                );
                fixed = result.fixed;
                changes = result.changes;
            }
            logger.info(`Mismatch fix result: fixed=${fixed}, changes: [${changes.join(', ')}]`);

            if (fixed) {
                logger.info(`Generating updated code for ${issue.filePath}`);
                const generatedCode = generateCode(ast);
                logger.info(`Generated updated code (${generatedCode.code.length} characters)`);
                
                modifiedFiles.push({
                    filePath: issue.filePath,
                    fileContents: generatedCode.code,
                });
                
                fixedIssues.push({
                    issueCode: 'TS2613',
                    filePath: issue.filePath,
                    line: issue.line,
                    column: issue.column,
                    originalMessage: issue.message,
                    fixApplied: changes.join('. '),
                    fixType: 'export_fix',
                });
                logger.info(`Successfully fixed TS2613 issue for ${issue.filePath}`);
            } else {
                logger.warn(`No suitable fix found for import/export mismatch in ${issue.filePath}`);
                unfixableIssues.push({
                    issueCode: 'TS2613',
                    filePath: issue.filePath,
                    line: issue.line,
                    column: issue.column,
                    originalMessage: issue.message,
                    reason: 'No suitable fix found for import/export mismatch'
                });
            }
        } catch (error) {
            logger.error(`Failed to fix TS2613 issue at ${issue.filePath}:${issue.line}: ${error instanceof Error ? error.message : 'Unknown error'}`, error);
            unfixableIssues.push(handleFixerError(issue, error as Error, 'TS2613Fixer'));
        }
    }

    logger.info(`TS2613 fixer completed: ${fixedIssues.length} fixed, ${unfixableIssues.length} unfixable, ${modifiedFiles.length} modified files, ${newFiles.length} new files`);
    
    return {
        fixedIssues,
        unfixableIssues,
        modifiedFiles,
        newFiles
    };
}

/**
 * Find namespace import at a specific line
 */
function findNamespaceImportAtLocation(ast: t.File, line: number): { namespace: string; moduleSpecifier: string } | null {
    let result: { namespace: string; moduleSpecifier: string } | null = null;
    
    const body = ast.program?.body ?? [];
    for (const node of body) {
        if (t.isImportDeclaration(node)) {
            const startLine = node.loc?.start.line ?? 0;
            const endLine = node.loc?.end.line ?? startLine;
            
            if (startLine <= line && endLine >= line) {
                // Check for namespace import (* as name)
                const namespaceSpecifier = node.specifiers.find(s => t.isImportNamespaceSpecifier(s));
                if (namespaceSpecifier && t.isImportNamespaceSpecifier(namespaceSpecifier)) {
                    result = {
                        namespace: namespaceSpecifier.local.name,
                        moduleSpecifier: t.isStringLiteral(node.source) ? node.source.value : ''
                    };
                    break;
                }
            }
        }
    }
    
    return result;
}

/**
 * Fix namespace import mismatches
 * Converts namespace imports to appropriate default or named imports
 */
function fixNamespaceImportMismatch(
    ast: t.File,
    namespaceImport: { namespace: string; moduleSpecifier: string },
    targetExports: { defaultExport?: string; namedExports: string[]; filePath: string }
): { fixed: boolean; changes: string[] } {
    let fixed = false;
    const changes: string[] = [];
    
    traverseAST(ast, {
        ImportDeclaration(path) {
            if (t.isStringLiteral(path.node.source) && path.node.source.value === namespaceImport.moduleSpecifier) {
                const hasNamespace = path.node.specifiers.some(s => t.isImportNamespaceSpecifier(s));
                
                if (hasNamespace) {
                    // Determine what to convert to
                    if (targetExports.defaultExport && targetExports.namedExports.length === 0) {
                        // Only default export - convert to default import
                        path.node.specifiers = [
                            t.importDefaultSpecifier(t.identifier(namespaceImport.namespace))
                        ];
                        changes.push(`Converted namespace import to default import for "${namespaceImport.namespace}"`);
                        fixed = true;
                    } else if (targetExports.defaultExport && targetExports.namedExports.length > 0) {
                        // Mixed exports - keep as namespace but warn
                        changes.push(`Module has mixed exports (default and named). Consider using specific imports.`);
                        // Optionally convert to: import defaultExport, * as namespace from '...'
                        // But this depends on usage patterns
                    } else if (targetExports.namedExports.length > 0) {
                        // Only named exports - could convert to specific imports if usage is known
                        // For now, keep as namespace but warn
                        changes.push(`Module has named exports. Consider importing specific exports instead of namespace.`);
                    }
                }
            }
        }
    });
    
    return { fixed, changes };
}

