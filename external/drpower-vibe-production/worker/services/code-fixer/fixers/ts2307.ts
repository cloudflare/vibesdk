/**
 * TS2307: Cannot find module fixer
 * Handles missing module imports by either finding existing files or creating stubs
 */

import { CodeIssue } from '../../sandbox/sandboxTypes';
import { FixerContext, FixResult, FixedIssue, ImportInfo } from '../types';
import * as t from '@babel/types';
import { generateCode } from '../utils/ast';
import { findImportAtLocation, getFileAST } from '../utils/imports';
import { findModuleFile, makeRelativeImport, resolveImportToFilePath } from '../utils/paths';
import { generateStubFileContent } from '../utils/stubs';
import { createObjectLogger } from '../../../logger';
import { isExternalModule } from '../utils/modules';
import { createExternalModuleError, handleFixerError } from '../utils/helpers';

const logger = createObjectLogger({ name: 'TS2307Fixer' }, 'TS2307Fixer');

/**
 * Fix TS2307 "Cannot find module" errors
 * Preserves exact logic from working ImportExportFixer.fixModuleNotFound
 */
export async function fixModuleNotFound(
    context: FixerContext,
    issues: CodeIssue[]
): Promise<FixResult> {
    logger.info(`Starting TS2307 fixer with ${issues.length} issues`);
    
    const fixedIssues: FixedIssue[] = [];
    const unfixableIssues = [];
    const modifiedFiles = [];
    const newFiles = [];
    const fetchedFiles = new Set(context.fetchedFiles);

    for (const issue of issues) {
        logger.info(`Processing TS2307 issue: ${issue.message} at ${issue.filePath}:${issue.line}`);
        
        try {
            logger.info(`Getting AST for file: ${issue.filePath}`);
            const ast = await getFileAST(issue.filePath, context.files, context.fileFetcher, fetchedFiles);
            if (!ast) {
                logger.warn(`Failed to get AST for ${issue.filePath}`);
                unfixableIssues.push({
                    issueCode: 'TS2307',
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
            if (!importInfo) {
                logger.warn(`No import found at line ${issue.line} in ${issue.filePath}`);
                unfixableIssues.push({
                    issueCode: 'TS2307',
                    filePath: issue.filePath,
                    line: issue.line,
                    column: issue.column,
                    originalMessage: issue.message,
                    reason: 'No import found at specified location'
                });
                continue;
            }

            logger.info(`Found import: ${importInfo.moduleSpecifier}, default: ${importInfo.defaultImport}, named: [${importInfo.namedImports.join(', ')}]`);

            const moduleSpecifier = importInfo.moduleSpecifier;
            importInfo.filePath = issue.filePath; // Set the file path for usage analysis
            
            // Skip external packages - only handle local modules
            logger.info(`Checking if "${moduleSpecifier}" is external package`);
            if (isExternalModule(moduleSpecifier)) {
                logger.info(`Skipping external package: ${moduleSpecifier}`);
                unfixableIssues.push(createExternalModuleError(issue, moduleSpecifier));
                continue;
            }
            
            logger.info(`Searching for local module file: ${moduleSpecifier}`);
            // Try to find existing file with fuzzy matching
            const foundFile = await findModuleFile(
                moduleSpecifier, 
                issue.filePath, 
                context.files,
                context.fileFetcher,
                fetchedFiles
            );
            logger.info(`Module file search result: ${foundFile || 'NOT FOUND'}`);
            
            if (foundFile) {
                logger.info(`Found existing file, fixing import path from "${moduleSpecifier}" to "${foundFile}"`);
                // File exists, fix the import path
                const relativeImport = makeRelativeImport(issue.filePath, foundFile);
                logger.info(`Generated relative import path: "${relativeImport}"`);
                
                logger.info(`Updating AST for import path change`);
                const updatedAST = updateImportPath(ast, importInfo, relativeImport);
                const generatedCode = generateCode(updatedAST);
                logger.info(`Generated updated code (${generatedCode.code.length} characters)`);
                
                modifiedFiles.push({
                    filePath: issue.filePath,
                    fileContents: generatedCode.code,
                    filePurpose: `Fixed import path in ${issue.filePath}`,
                });
                
                fixedIssues.push({
                    issueCode: 'TS2307',
                    filePath: issue.filePath,
                    line: issue.line,
                    column: issue.column,
                    originalMessage: issue.message,
                    fixApplied: `Updated import path from "${moduleSpecifier}" to "${relativeImport}"`,
                    fixType: 'import_fix',
                });
                logger.info(`Successfully fixed import path for ${issue.filePath}`);
            } else {
                logger.info(`No existing file found, creating stub file for "${moduleSpecifier}"`);
                // File doesn't exist, create stub file
                const targetFilePath = resolveImportToFilePath(moduleSpecifier, issue.filePath);
                logger.info(`Resolved stub file path: "${targetFilePath}"`);
                
                logger.info(`Generating stub content for import: ${importInfo.defaultImport ? 'default: ' + importInfo.defaultImport + ', ' : ''}named: [${importInfo.namedImports.join(', ')}]`);
                const stubContent = await generateStubFileContent(
                    importInfo, 
                    context.files,
                    context.fileFetcher,
                    fetchedFiles
                );
                logger.info(`Generated stub content (${stubContent.length} characters)`);
                
                newFiles.push({
                    filePath: targetFilePath,
                    fileContents: stubContent,
                    filePurpose: `Generated stub file for ${moduleSpecifier}`,
                });
                
                fixedIssues.push({
                    issueCode: 'TS2307',
                    filePath: issue.filePath,
                    line: issue.line,
                    column: issue.column,
                    originalMessage: issue.message,
                    fixApplied: `Created stub file "${targetFilePath}" with required exports`,
                    fixType: 'stub_creation',
                });
                logger.info(`Successfully created stub file: "${targetFilePath}"`);
            }
        } catch (error) {
            logger.error(`Failed to fix TS2307 issue at ${issue.filePath}:${issue.line}: ${error instanceof Error ? error.message : 'Unknown error'}`, error);
            unfixableIssues.push(handleFixerError(issue, error as Error, 'TS2307Fixer'));
        }
    }

    logger.info(`TS2307 fixer completed: ${fixedIssues.length} fixed, ${unfixableIssues.length} unfixable, ${modifiedFiles.length} modified files, ${newFiles.length} new files`);
    
    return {
        fixedIssues,
        unfixableIssues,
        modifiedFiles,
        newFiles
    };
}

/**
 * Update import path in AST by modifying the source value
 * Helper function to modify import statements
 */
function updateImportPath(ast: t.File, importInfo: ImportInfo, newPath: string): t.File {
    const body = ast.program?.body ?? [];
    for (const node of body) {
        if (t.isImportDeclaration(node) && t.isStringLiteral(node.source) && node.source.value === importInfo.specifier) {
            node.source.value = newPath;
        }
    }
    return ast;
}


