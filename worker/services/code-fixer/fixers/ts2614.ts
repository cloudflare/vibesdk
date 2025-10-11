/**
 * TS2614: Module has no exported member (import/export mismatch) fixer
 * Handles cases where imports use wrong syntax (named vs default)
 */

import { CodeIssue } from '../../sandbox/sandboxTypes';
import { FixerContext, FixResult, FixedIssue, UnfixableIssue, FileObject } from '../types';
import { generateCode, traverseAST } from '../utils/ast';
import { findImportAtLocation, getFileAST, getFileExports } from '../utils/imports';
import { findModuleFile } from '../utils/paths';
import { createObjectLogger } from '../../../logger';
import * as t from '@babel/types';
import { handleFixerError } from '../utils/helpers';

const logger = createObjectLogger({ name: 'TS2614Fixer' }, 'TS2614Fixer');

/**
 * Fix TS2614 "Module has no exported member" errors (import/export mismatch)
 * Corrects import statements to match actual export types
 */
export async function fixImportExportTypeMismatch(
    context: FixerContext,
    issues: CodeIssue[]
): Promise<FixResult> {
    logger.info(`Starting TS2614 fixer with ${issues.length} issues`);
    
    const fixedIssues: FixedIssue[] = [];
    const unfixableIssues: UnfixableIssue[] = [];
    const modifiedFiles: FileObject[] = [];
    const newFiles: FileObject[] = [];
    const fetchedFiles = new Set(context.fetchedFiles);

    for (const issue of issues) {
        logger.info(`Processing TS2614 issue: ${issue.message} at ${issue.filePath}:${issue.line}`);
        
        try {
            // Get AST for the file with the import issue
            logger.info(`Getting AST for source file: ${issue.filePath}`);
            const sourceAST = await getFileAST(issue.filePath, context.files, context.fileFetcher, fetchedFiles);
            if (!sourceAST) {
                logger.warn(`Failed to get AST for ${issue.filePath}`);
                unfixableIssues.push({
                    issueCode: 'TS2614',
                    filePath: issue.filePath,
                    line: issue.line,
                    column: issue.column,
                    originalMessage: issue.message,
                    reason: 'Failed to parse source file AST'
                });
                continue;
            }

            // Find the import at the error location
            logger.info(`Finding import at line ${issue.line} in ${issue.filePath}`);
            const importInfo = findImportAtLocation(sourceAST, issue.line);
            if (!importInfo) {
                logger.warn(`No import found at line ${issue.line} in ${issue.filePath}`);
                unfixableIssues.push({
                    issueCode: 'TS2614',
                    filePath: issue.filePath,
                    line: issue.line,
                    column: issue.column,
                    originalMessage: issue.message,
                    reason: 'No import found at specified location'
                });
                continue;
            }
            
            logger.info(`Found import: ${importInfo.moduleSpecifier}, default: ${importInfo.defaultImport}, named: [${importInfo.namedImports.join(', ')}]`);

            // Find the target file
            logger.info(`Searching for target file: ${importInfo.moduleSpecifier}`);
            const targetFile = await findModuleFile(
                importInfo.moduleSpecifier, 
                issue.filePath, 
                context.files,
                context.fileFetcher,
                fetchedFiles
            );
            
            if (!targetFile) {
                logger.warn(`Target file not found for module: ${importInfo.moduleSpecifier}`);
                unfixableIssues.push({
                    issueCode: 'TS2614',
                    filePath: issue.filePath,
                    line: issue.line,
                    column: issue.column,
                    originalMessage: issue.message,
                    reason: `Target file not found for module: ${importInfo.moduleSpecifier}`
                });
                continue;
            }
            logger.info(`Found target file: ${targetFile}`);

            // Get AST for target file to analyze actual exports
            logger.info(`Getting AST for target file: ${targetFile}`);
            const targetAST = await getFileAST(targetFile, context.files, context.fileFetcher, fetchedFiles);
            if (!targetAST) {
                logger.warn(`Failed to parse target file: ${targetFile}`);
                unfixableIssues.push({
                    issueCode: 'TS2614',
                    filePath: issue.filePath,
                    line: issue.line,
                    column: issue.column,
                    originalMessage: issue.message,
                    reason: `Failed to parse target file: ${targetFile}`
                });
                continue;
            }

            // Analyze target file's exports
            logger.info(`Analyzing exports in target file: ${targetFile}`);
            const targetExports = getFileExports(targetAST);
            logger.info(`Found exports - defaultExport: ${targetExports.defaultExport || 'none'}, named: [${targetExports.namedExports.join(', ')}]`);

            // Determine the mismatch type and fix it
            const mismatchAnalysis = analyzeMismatch(importInfo, targetExports);
            if (!mismatchAnalysis) {
                logger.warn(`Could not determine mismatch type for ${importInfo.moduleSpecifier}`);
                unfixableIssues.push({
                    issueCode: 'TS2614',
                    filePath: issue.filePath,
                    line: issue.line,
                    column: issue.column,
                    originalMessage: issue.message,
                    reason: 'Could not determine import/export mismatch type'
                });
                continue;
            }

            logger.info(`Mismatch analysis: ${mismatchAnalysis.type} - ${mismatchAnalysis.description}`);

            // Apply the fix to the import statement
            const fixedAST = fixImportStatement(sourceAST, importInfo, mismatchAnalysis);
            const generatedCode = generateCode(fixedAST);
            
            modifiedFiles.push({
                filePath: issue.filePath,
                fileContents: generatedCode.code,
            });
            
            fixedIssues.push({
                issueCode: 'TS2614',
                filePath: issue.filePath,
                line: issue.line,
                column: issue.column,
                originalMessage: issue.message,
                fixApplied: mismatchAnalysis.description,
                fixType: 'import_fix',
            });
            logger.info(`Successfully fixed import/export mismatch in ${issue.filePath}`);
            
        } catch (error) {
            logger.error(`Failed to fix TS2614 issue at ${issue.filePath}:${issue.line}: ${error instanceof Error ? error.message : 'Unknown error'}`, error);
            unfixableIssues.push(handleFixerError(issue, error as Error, 'TS2614Fixer'));
        }
    }

    logger.info(`TS2614 fixer completed: ${fixedIssues.length} fixed, ${unfixableIssues.length} unfixable, ${modifiedFiles.length} modified files, ${newFiles.length} new files`);
    
    return {
        fixedIssues,
        unfixableIssues,
        modifiedFiles,
        newFiles
    };
}

interface MismatchAnalysis {
    type: 'named-to-default' | 'default-to-named' | 'partial-match' | 'complex-partial' | 'default-to-named-typo';
    description: string;
    targetName?: string;
    sourceNames?: string[];
    additionalData?: {
        defaultConversions?: string[];
        typoCorrections?: Array<{ invalid: string; correct: string } | null>;
    };
}

/**
 * Calculate Levenshtein distance between two strings
 * Used for detecting typos in import names
 */
function levenshteinDistance(str1: string, str2: string): number {
    const matrix: number[][] = [];
    
    for (let i = 0; i <= str2.length; i++) {
        matrix[i] = [i];
    }
    
    for (let j = 0; j <= str1.length; j++) {
        matrix[0][j] = j;
    }
    
    for (let i = 1; i <= str2.length; i++) {
        for (let j = 1; j <= str1.length; j++) {
            if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
                matrix[i][j] = matrix[i - 1][j - 1];
            } else {
                matrix[i][j] = Math.min(
                    matrix[i - 1][j - 1] + 1, // substitution
                    matrix[i][j - 1] + 1,     // insertion
                    matrix[i - 1][j] + 1      // deletion
                );
            }
        }
    }
    
    return matrix[str2.length][str1.length];
}

/**
 * Analyze import/export mismatch and determine fix strategy
 * Enhanced to handle complex partial matches
 */
function analyzeMismatch(importInfo: { defaultImport?: string; namedImports: string[] }, targetExports: { defaultExport?: string; namedExports: string[] }): MismatchAnalysis | null {
    
    // Case 1: Trying to import something as named when it's actually default export
    if (importInfo.namedImports.length > 0 && !importInfo.defaultImport && targetExports.defaultExport) {
        // Check if any named import matches the default export name
        const matchingNamedImport = importInfo.namedImports.find(name => 
            name === targetExports.defaultExport || 
            name.toLowerCase() === targetExports.defaultExport?.toLowerCase()
        );
        
        if (matchingNamedImport) {
            return {
                type: 'named-to-default',
                description: `Changed import from named '${matchingNamedImport}' to default import`,
                targetName: matchingNamedImport
            };
        }
    }
    
    // Case 2: Trying to import as default when it's actually a named export
    if (importInfo.defaultImport && !targetExports.defaultExport && targetExports.namedExports.length > 0) {
        // Check if the default import name matches any named export
        const matchingNamedExport = targetExports.namedExports.find(name => 
            name === importInfo.defaultImport || 
            name.toLowerCase() === importInfo.defaultImport?.toLowerCase()
        );
        
        if (matchingNamedExport) {
            return {
                type: 'default-to-named',
                description: `Changed import from default '${importInfo.defaultImport}' to named import '${matchingNamedExport}'`,
                targetName: matchingNamedExport
            };
        }
    }
    
    // Case 3: Mixed imports - some correct, some need conversion
    if (importInfo.namedImports.length > 0) {
        const validNamedImports = importInfo.namedImports.filter(name => 
            targetExports.namedExports.includes(name)
        );
        const invalidNamedImports = importInfo.namedImports.filter(name => 
            !targetExports.namedExports.includes(name)
        );
        
        // Check if any invalid named imports match the default export
        const needsDefaultConversion = invalidNamedImports.filter(name =>
            targetExports.defaultExport && (
                name === targetExports.defaultExport || 
                name.toLowerCase() === targetExports.defaultExport?.toLowerCase()
            )
        );
        
        // Check if any invalid named imports have similar names in exports (typos)
        const possibleTypos = invalidNamedImports.map(invalidName => {
            const similar = targetExports.namedExports.find(exportName => {
                const distance = levenshteinDistance(invalidName.toLowerCase(), exportName.toLowerCase());
                return distance <= 2; // Allow up to 2 character differences
            });
            return similar ? { invalid: invalidName, correct: similar } : null;
        }).filter(Boolean);
        
        if (needsDefaultConversion.length > 0 || validNamedImports.length > 0 || possibleTypos.length > 0) {
            return {
                type: 'complex-partial',
                description: `Complex import fix: ${needsDefaultConversion.length} to default, ${validNamedImports.length} valid named, ${possibleTypos.length} typo fixes`,
                targetName: needsDefaultConversion[0], // Primary default conversion
                sourceNames: validNamedImports,
                additionalData: {
                    defaultConversions: needsDefaultConversion,
                    typoCorrections: possibleTypos
                }
            };
        }
    }
    
    // Case 4: Check if default import matches a named export (opposite of case 1)
    if (importInfo.defaultImport && targetExports.namedExports.length > 0) {
        const matchingNamedExport = targetExports.namedExports.find(name =>
            name === importInfo.defaultImport ||
            name.toLowerCase() === importInfo.defaultImport?.toLowerCase()
        );
        
        if (matchingNamedExport) {
            return {
                type: 'default-to-named',
                description: `Changed import from default '${importInfo.defaultImport}' to named import '${matchingNamedExport}'`,
                targetName: matchingNamedExport
            };
        }
        
        // Check if default import name is close to any named export (typo)
        const similarNamed = targetExports.namedExports.find(name => {
            const distance = levenshteinDistance(importInfo.defaultImport!.toLowerCase(), name.toLowerCase());
            return distance <= 2;
        });
        
        if (similarNamed) {
            return {
                type: 'default-to-named-typo',
                description: `Changed default import '${importInfo.defaultImport}' to named import '${similarNamed}' (possible typo)`,
                targetName: similarNamed
            };
        }
    }
    
    return null;
}

/**
 * Fix the import statement based on mismatch analysis
 */
function fixImportStatement(
    ast: t.File, 
    importInfo: { moduleSpecifier: string; defaultImport?: string; namedImports: string[] },
    mismatchAnalysis: MismatchAnalysis
): t.File {
    
    traverseAST(ast, {
        ImportDeclaration(path) {
            if (t.isStringLiteral(path.node.source) && path.node.source.value === importInfo.moduleSpecifier) {
                
                switch (mismatchAnalysis.type) {
                    case 'named-to-default':
                        // Convert named import to default import
                        if (mismatchAnalysis.targetName) {
                            // Find the original specifier to preserve local alias if any
                            const orig = path.node.specifiers.find(s => 
                                t.isImportSpecifier(s) && 
                                t.isIdentifier(s.imported) && 
                                s.imported.name === mismatchAnalysis.targetName
                            ) as t.ImportSpecifier | undefined;
                            const localName = orig && t.isIdentifier(orig.local) ? orig.local.name : mismatchAnalysis.targetName;
                            path.node.specifiers = [
                                t.importDefaultSpecifier(t.identifier(localName))
                            ];
                        }
                        break;
                        
                    case 'default-to-named':
                        // Convert default import to named import
                        if (mismatchAnalysis.targetName && importInfo.defaultImport) {
                            path.node.specifiers = [
                                t.importSpecifier(
                                    t.identifier(importInfo.defaultImport),
                                    t.identifier(mismatchAnalysis.targetName)
                                )
                            ];
                        }
                        break;
                        
                    case 'partial-match':
                    case 'complex-partial':
                        // Handle complex partial matches with multiple conversions
                        if (mismatchAnalysis.additionalData) {
                            const newSpecifiers: (t.ImportDefaultSpecifier | t.ImportSpecifier)[] = [];
                            const specifiers = path.node.specifiers;
                            
                            // Add default import for names that need conversion to default
                            const defaultConversions = mismatchAnalysis.additionalData.defaultConversions || [];
                            if (defaultConversions.length > 0) {
                                const firstDefault = defaultConversions[0];
                                const defaultSpec = specifiers.find(s => 
                                    t.isImportSpecifier(s) && 
                                    t.isIdentifier(s.imported) && 
                                    s.imported.name === firstDefault
                                ) as t.ImportSpecifier | undefined;
                                const defaultLocal = defaultSpec && t.isIdentifier(defaultSpec.local) ? defaultSpec.local.name : firstDefault;
                                newSpecifiers.push(t.importDefaultSpecifier(t.identifier(defaultLocal)));
                            }
                            
                            // Keep valid named imports
                            if (mismatchAnalysis.sourceNames) {
                                for (const validName of mismatchAnalysis.sourceNames) {
                                    const orig = specifiers.find(s => 
                                        t.isImportSpecifier(s) && 
                                        t.isIdentifier(s.imported) && 
                                        s.imported.name === validName
                                    ) as t.ImportSpecifier | undefined;
                                    const local = orig && t.isIdentifier(orig.local) ? orig.local.name : validName;
                                    newSpecifiers.push(
                                        t.importSpecifier(t.identifier(local), t.identifier(validName))
                                    );
                                }
                            }
                            
                            // Fix typos in named imports
                            const typoCorrections = mismatchAnalysis.additionalData.typoCorrections || [];
                            for (const correction of typoCorrections) {
                                if (correction) {
                                    const orig = specifiers.find(s => 
                                        t.isImportSpecifier(s) && 
                                        t.isIdentifier(s.imported) && 
                                        s.imported.name === correction.invalid
                                    ) as t.ImportSpecifier | undefined;
                                    const local = orig && t.isIdentifier(orig.local) ? orig.local.name : correction.correct;
                                    newSpecifiers.push(
                                        t.importSpecifier(t.identifier(local), t.identifier(correction.correct))
                                    );
                                }
                            }
                            
                            path.node.specifiers = newSpecifiers;
                        } else if (mismatchAnalysis.targetName && mismatchAnalysis.sourceNames) {
                            // Fallback to simple partial match handling
                            const newSpecifiers: (t.ImportDefaultSpecifier | t.ImportSpecifier)[] = [];
                            const specifiers = path.node.specifiers;

                            // Add default import for the converted name
                            const invalidSpec = specifiers.find(s => 
                                t.isImportSpecifier(s) && 
                                t.isIdentifier(s.imported) && 
                                s.imported.name === mismatchAnalysis.targetName
                            ) as t.ImportSpecifier | undefined;
                            const defaultLocal = invalidSpec && t.isIdentifier(invalidSpec.local) ? invalidSpec.local.name : mismatchAnalysis.targetName;
                            newSpecifiers.push(t.importDefaultSpecifier(t.identifier(defaultLocal)));

                            // Keep valid named imports
                            for (const validName of mismatchAnalysis.sourceNames) {
                                const orig = specifiers.find(s => 
                                    t.isImportSpecifier(s) && 
                                    t.isIdentifier(s.imported) && 
                                    s.imported.name === validName
                                ) as t.ImportSpecifier | undefined;
                                const local = orig && t.isIdentifier(orig.local) ? orig.local.name : validName;
                                newSpecifiers.push(
                                    t.importSpecifier(t.identifier(local), t.identifier(validName))
                                );
                            }
                            
                            path.node.specifiers = newSpecifiers;
                        }
                        break;
                    
                    case 'default-to-named-typo':
                        // Convert default import to named import with typo correction
                        if (mismatchAnalysis.targetName && importInfo.defaultImport) {
                            path.node.specifiers = [
                                t.importSpecifier(
                                    t.identifier(importInfo.defaultImport),
                                    t.identifier(mismatchAnalysis.targetName)
                                )
                            ];
                        }
                        break;
                }
            }
        }
    });
    
    return ast;
}

