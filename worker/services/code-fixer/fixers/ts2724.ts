/**
 * TS2724: Incorrect named import fixer
 * Handles cases where a named import doesn't exist but TypeScript suggests alternatives
 * Example: "'@/components/ui/sonner' has no exported member named 'toast'. Did you mean 'Toaster'?"
 */

import { CodeIssue } from '../../sandbox/sandboxTypes';
import { FixerContext, FixResult, FixedIssue, UnfixableIssue, FileObject } from '../types';
import { generateCode } from '../utils/ast';
import { getFileAST, findImportAtLocation, getFileExports } from '../utils/imports';
import { createObjectLogger } from '../../../logger';
import * as t from '@babel/types';
import { resolvePathAlias, findModuleFile } from '../utils/paths';
import {
    createUnfixableIssue,
    createExternalModuleError,
    handleFixerError,
    createFixerLogMessages,
    createSourceFileParseError,
    createMissingImportError
} from '../utils/helpers';
import { isExternalModule } from '../utils/modules';

const logger = createObjectLogger({ name: 'TS2724Fixer' }, 'TS2724Fixer');

/**
 * Fix TS2724 "Incorrect named import" errors
 * Replaces incorrect named imports with the suggested correct ones from TypeScript
 */
export function fixIncorrectNamedImport(
    context: FixerContext,
    issues: CodeIssue[]
): FixResult {
    const logs = createFixerLogMessages('TS2724Fixer', issues.length);
    logger.info(logs.start);
    
    const fixedIssues: FixedIssue[] = [];
    const unfixableIssues: UnfixableIssue[] = [];
    const modifiedFilesMap = new Map<string, FileObject>();
    const newFiles: FileObject[] = [];
    
    // Group issues by file to handle multiple corrections in the same import statement
    const issuesByFile = new Map<string, CodeIssue[]>();
    for (const issue of issues) {
        const fileIssues = issuesByFile.get(issue.filePath) || [];
        fileIssues.push(issue);
        issuesByFile.set(issue.filePath, fileIssues);
    }
    
    // Process each file's issues together
    for (const [filePath, fileIssues] of issuesByFile) {
        try {
            // Get source file AST once
            const sourceAST = getFileAST(
                filePath,
                context.files
            );
            
            if (!sourceAST) {
                logger.error(`Failed to parse source file: ${filePath}`);
                for (const issue of fileIssues) {
                    unfixableIssues.push(createSourceFileParseError(issue));
                }
                continue;
            }
            
            // Group replacements by module specifier and line
            const replacementsByImport = new Map<string, Map<string, string>>();
            const processedIssues: CodeIssue[] = [];
            
            for (const issue of fileIssues) {
                logger.info(logs.processing(issue));
                
                // Parse the error message to extract module, incorrect import, and suggested import
                const parseResult = parseTS2724ErrorMessage(issue.message);
                if (!parseResult) {
                    logger.warn(`Could not parse TS2724 error message: ${issue.message}`);
                    unfixableIssues.push(createUnfixableIssue(issue, 'Could not parse error message to extract import names'));
                    continue;
                }

                const { moduleSpecifier, incorrectImport, suggestedImport } = parseResult;
                
                // Check for external modules - we can't fix imports from external modules
                if (isExternalModule(moduleSpecifier)) {
                    logger.info(`Skipping external module: ${moduleSpecifier}`);
                    unfixableIssues.push(createExternalModuleError(issue, moduleSpecifier));
                    continue;
                }
                
                // Find the import statement at the error location
                const importInfo = findImportAtLocation(sourceAST, issue.line);
                if (!importInfo) {
                    logger.warn(`No import found at line ${issue.line} in ${filePath}`);
                    unfixableIssues.push(createMissingImportError(issue));
                    continue;
                }
                
                // Verify the import matches our expected module and incorrect import name
                if (importInfo.moduleSpecifier !== moduleSpecifier) {
                    logger.warn(`Module specifier mismatch. Expected: ${moduleSpecifier}, Found: ${importInfo.moduleSpecifier}`);
                    unfixableIssues.push(createUnfixableIssue(issue, 'Module specifier does not match error message'));
                    continue;
                }
                
                if (!importInfo.namedImports.includes(incorrectImport)) {
                    logger.warn(`Incorrect import '${incorrectImport}' not found in named imports: ${importInfo.namedImports.join(', ')}`);
                    unfixableIssues.push(createUnfixableIssue(issue, `Named import '${incorrectImport}' not found in import statement`));
                    continue;
                }
                
                // Verify the suggested export actually exists in the target module
                // Resolve the module path
                const resolvedPath = resolvePathAlias(moduleSpecifier);
                const targetFile = findModuleFile(
                    resolvedPath,
                    filePath,
                    context.files
                );
                
                
                if (targetFile) {
                    // Get exports from the target file
                    const targetAST = getFileAST(
                        targetFile,
                        context.files
                    );
                    
                    if (targetAST) {
                        const exports = getFileExports(targetAST);
                        
                        // Check if the suggested export exists
                        if (exports.namedExports.includes(suggestedImport) || 
                            exports.defaultExport === suggestedImport) {
                            // The suggested export exists, accumulate the replacement
                            const key = `${moduleSpecifier}:${issue.line}`;
                            if (!replacementsByImport.has(key)) {
                                replacementsByImport.set(key, new Map());
                            }
                            replacementsByImport.get(key)!.set(incorrectImport, suggestedImport);
                            processedIssues.push(issue);
                        } else {
                            logger.warn(`Suggested export '${suggestedImport}' not found in ${targetFile}`);
                            unfixableIssues.push(createUnfixableIssue(issue, `Suggested export '${suggestedImport}' not found in target module`));
                        }
                    } else {
                        logger.warn(`Could not parse target file: ${targetFile}`);
                        unfixableIssues.push(createUnfixableIssue(issue, 'Could not parse target module file'));
                    }
                } else {
                    logger.warn(`Could not find target module file for: ${moduleSpecifier}`);
                    unfixableIssues.push(createUnfixableIssue(issue, 'Target module file not found'));
                }
            }
            
            // Apply all replacements at once
            if (replacementsByImport.size > 0) {
                const fixedAST = applyMultipleNamedImportReplacements(sourceAST, replacementsByImport);
                if (fixedAST) {
                    // Generate the fixed code
                    const { code: fixedCode } = generateCode(fixedAST);
                    
                    // Store the result
                    modifiedFilesMap.set(filePath, {
                        filePath,
                        fileContents: fixedCode
                    });
                    
                    // Record all fixed issues
                    for (const issue of processedIssues) {
                        const parseResult = parseTS2724ErrorMessage(issue.message);
                        if (parseResult) {
                            fixedIssues.push({
                                issueCode: issue.ruleId || 'TS2724',
                                filePath: issue.filePath,
                                line: issue.line,
                                column: issue.column,
                                originalMessage: issue.message,
                                fixApplied: `Replaced incorrect named import '${parseResult.incorrectImport}' with '${parseResult.suggestedImport}' in module '${parseResult.moduleSpecifier}'`,
                                fixType: 'import_fix'
                            });
                            logger.info(`Successfully fixed TS2724 issue: replaced '${parseResult.incorrectImport}' with '${parseResult.suggestedImport}' in ${issue.filePath}`);
                        }
                    }
                }
            }
            
        } catch (error) {
            logger.error(`Error fixing TS2724 issues in ${filePath}:`, error);
            for (const issue of fileIssues) {
                unfixableIssues.push(handleFixerError(issue, error as Error, 'TS2724Fixer'));
            }
        }
    }
    
    logger.info(logs.completed(fixedIssues.length, unfixableIssues.length, modifiedFilesMap.size, newFiles.length));
    
    return {
        fixedIssues,
        unfixableIssues,
        modifiedFiles: Array.from(modifiedFilesMap.values()),
        newFiles
    };
}

/**
 * Parse TS2724 error message to extract module specifier, incorrect import, and suggested import
 * 
 * Examples:
 * - "'@/components/ui/sonner' has no exported member named 'toast'. Did you mean 'Toaster'?"
 * - "Module './utils' has no exported member 'utilFunction'. Did you mean 'utilityFunction'?"
 * - "'react' has no exported member named 'useCallback'. Did you mean 'useCallBack'?"
 */
export function parseTS2724ErrorMessage(errorMessage: string): {
    moduleSpecifier: string;
    incorrectImport: string;
    suggestedImport: string;
} | null {
    // Pattern 1: Standard format with single quotes around module
    // "'@/components/ui/sonner' has no exported member named 'toast'. Did you mean 'Toaster'?"
    const pattern1 = /^'([^']+)'\s+has no exported member named\s+'([^']+)'\.?\s+Did you mean\s+'([^']+)'\??\s*$/i;
    const match1 = errorMessage.match(pattern1);
    
    if (match1) {
        return {
            moduleSpecifier: match1[1],
            incorrectImport: match1[2],
            suggestedImport: match1[3]
        };
    }
    
    // Pattern 2: Module format
    // "Module './utils' has no exported member 'utilFunction'. Did you mean 'utilityFunction'?"
    const pattern2 = /^Module\s+'([^']+)'\s+has no exported member\s+'([^']+)'\.?\s+Did you mean\s+'([^']+)'\??\s*$/i;
    const match2 = errorMessage.match(pattern2);
    
    if (match2) {
        return {
            moduleSpecifier: match2[1],
            incorrectImport: match2[2],
            suggestedImport: match2[3]
        };
    }
    
    // Pattern 3: Alternative format with "named" keyword
    // "'react' has no exported member named 'useCallback'. Did you mean 'useCallBack'?"
    const pattern3 = /^'([^']+)'\s+has no exported member\s+named\s+'([^']+)'\.?\s+Did you mean\s+'([^']+)'\??\s*$/i;
    const match3 = errorMessage.match(pattern3);
    
    if (match3) {
        return {
            moduleSpecifier: match3[1],
            incorrectImport: match3[2],
            suggestedImport: match3[3]
        };
    }
    
    // Pattern 4: Handle double quotes instead of single quotes
    // '"@/components/ui/sonner" has no exported member named "toast". Did you mean "Toaster"?'
    const pattern4 = /^"([^"]+)"\s+has no exported member named\s+"([^"]+)"\.?\s+Did you mean\s+"([^"]+)"\??\s*$/i;
    const match4 = errorMessage.match(pattern4);
    
    if (match4) {
        return {
            moduleSpecifier: match4[1],
            incorrectImport: match4[2],
            suggestedImport: match4[3]
        };
    }
    
    return null;
}

/**
 * Replace a named import in the AST with a different named import
 */
export function replaceNamedImport(
    ast: t.File,
    moduleSpecifier: string,
    oldImportName: string,
    newImportName: string
): t.File | null {
    let importReplaced = false;
    
    // Create a copy of the AST to avoid mutating the original
    const newAST = t.cloneNode(ast, true, true);
    
    // Traverse the AST to find and replace the import
    t.traverseFast(newAST, (node) => {
        if (t.isImportDeclaration(node) && node.source.value === moduleSpecifier) {
            // Find the specific named import to replace
            node.specifiers = node.specifiers.map(specifier => {
                if (t.isImportSpecifier(specifier)) {
                    // Handle both regular named imports and aliased imports
                    const importedName = t.isIdentifier(specifier.imported) 
                        ? specifier.imported.name 
                        : specifier.imported.value;
                    
                    if (importedName === oldImportName) {
                        // Replace with the new import name
                        const newSpecifier = t.importSpecifier(
                            specifier.local, // Keep the same local name
                            t.identifier(newImportName) // Use the new imported name
                        );
                        importReplaced = true;
                        return newSpecifier;
                    }
                }
                return specifier;
            });
        }
    });
    
    return importReplaced ? newAST : null;
}

/**
 * Apply multiple named import replacements to handle multiple corrections in the same statement
 */
export function applyMultipleNamedImportReplacements(
    ast: t.File,
    replacementsByImport: Map<string, Map<string, string>>
): t.File | null {
    let anyReplaced = false;
    
    // Create a copy of the AST to avoid mutating the original
    const newAST = t.cloneNode(ast, true, true);
    
    // Traverse the AST to find and replace imports
    t.traverseFast(newAST, (node) => {
        if (t.isImportDeclaration(node)) {
            const moduleSpecifier = node.source.value;
            const line = node.loc?.start.line || 1; // Default to 1 if no location
            const key = `${moduleSpecifier}:${line}`;
            
            const replacements = replacementsByImport.get(key);
            if (replacements) {
                // Apply all replacements for this import
                node.specifiers = node.specifiers.map(specifier => {
                    if (t.isImportSpecifier(specifier)) {
                        const importedName = t.isIdentifier(specifier.imported) 
                            ? specifier.imported.name 
                            : specifier.imported.value;
                        
                        const newName = replacements.get(importedName);
                        if (newName) {
                            // Replace with the new import name
                            const newSpecifier = t.importSpecifier(
                                specifier.local, // Keep the same local name
                                t.identifier(newName) // Use the new imported name
                            );
                            anyReplaced = true;
                            return newSpecifier;
                        }
                    }
                    return specifier;
                });
            }
        }
    });
    
    return anyReplaced ? newAST : null;
}
