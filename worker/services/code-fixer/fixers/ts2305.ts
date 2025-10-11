/**
 * TS2305: Module has no exported member fixer
 * Handles missing named exports by adding stub exports to the target file
 */

import { CodeIssue } from '../../sandbox/sandboxTypes';
import { FixerContext, FixResult, FixedIssue, UnfixableIssue, FileObject } from '../types';
import { generateCode } from '../utils/ast';
import { getFileExports, analyzeImportUsage } from '../utils/imports';
import { createObjectLogger } from '../../../logger';
import * as t from '@babel/types';
import {
    getSourceAndTargetFiles,
    createUnfixableIssue,
    createExternalModuleError,
    handleFixerError,
    createFixerLogMessages
} from '../utils/helpers';
import { isExternalModule } from '../utils/modules';

const logger = createObjectLogger({ name: 'TS2305Fixer' }, 'TS2305Fixer');

/**
 * Fix TS2305 "Module has no exported member" errors
 * Adds missing exports as stubs to the target file
 */
export async function fixMissingExportedMember(
    context: FixerContext,
    issues: CodeIssue[]
): Promise<FixResult> {
    const logs = createFixerLogMessages('TS2305Fixer', issues.length);
    logger.info(logs.start);
    
    const fixedIssues: FixedIssue[] = [];
    const unfixableIssues: UnfixableIssue[] = [];
    const modifiedFiles: FileObject[] = [];
    const newFiles: FileObject[] = [];

    for (const issue of issues) {
        logger.info(logs.processing(issue));
        
        try {
            // Check for external modules first
            const moduleSpecifier = extractModuleSpecifierFromMessage(issue.message);
            if (moduleSpecifier && isExternalModule(moduleSpecifier)) {
                logger.info(`Skipping external module: ${moduleSpecifier}`);
                unfixableIssues.push(createExternalModuleError(issue, moduleSpecifier));
                continue;
            }
            
            // Get source and target files using DRY helper
            const filesResult = await getSourceAndTargetFiles(issue, context);
            if (!filesResult) {
                logger.warn(`Failed to get source and target files for ${issue.filePath}`);
                unfixableIssues.push(createUnfixableIssue(
                    issue, 
                    'Could not resolve source file, import location, or target file'
                ));
                continue;
            }
            
            const { sourceAST, importInfo, targetFilePath, targetAST } = filesResult;
            logger.info(`Found import: ${importInfo.moduleSpecifier}, named: [${importInfo.namedImports.join(', ')}]`);
            logger.info(`Found target file: ${targetFilePath}`);

            // Extract the missing export name from the error message
            const missingExportName = extractMissingExportName(issue.message, importInfo.namedImports);
            if (!missingExportName) {
                logger.warn(`Could not extract missing export name from message: ${issue.message}`);
                unfixableIssues.push(createUnfixableIssue(
                    issue,
                    'Could not determine missing export name'
                ));
                continue;
            }

            logger.info(`Missing export name: ${missingExportName}`);

            // Check if the export already exists (might be a false positive)
            const existingExports = getFileExports(targetAST);
            
            // Check for existing named export
            if (existingExports.namedExports.includes(missingExportName)) {
                logger.info(`Named export ${missingExportName} already exists in ${targetFilePath}, marking as unfixable`);
                unfixableIssues.push(createUnfixableIssue(
                    issue,
                    `Named export ${missingExportName} already exists in target file`
                ));
                continue;
            }
            
            // Check for existing default export with same name
            if (existingExports.defaultExport && existingExports.defaultExport === missingExportName) {
                logger.info(`Default export ${missingExportName} already exists in ${targetFilePath}, marking as unfixable`);
                unfixableIssues.push(createUnfixableIssue(
                    issue,
                    `Default export ${missingExportName} already exists in target file`
                ));
                continue;
            }

            // Analyze how the missing export is used to generate appropriate stub
            logger.info(`Analyzing usage of ${missingExportName} in source file`);
            const usageAnalysis = analyzeImportUsage(sourceAST, [missingExportName]);
            const exportUsage = usageAnalysis.find(usage => usage.name === missingExportName);

            logger.info(`Usage analysis result: ${exportUsage ? exportUsage.type : 'generic'}`);

            // Add the missing export to target file
            const modifiedTargetAST = addExportToFile(targetAST, missingExportName, exportUsage ? {
                name: exportUsage.name,
                type: exportUsage.type,
                properties: exportUsage.properties as string[] | undefined,
                parameters: (exportUsage.parameters as unknown[])?.map(p => String(p)) || undefined
            } : undefined);
            const generatedCode = generateCode(modifiedTargetAST);
            
            modifiedFiles.push({
                filePath: targetFilePath,
                fileContents: generatedCode.code,
            });
            
            fixedIssues.push({
                issueCode: 'TS2305',
                filePath: issue.filePath,
                line: issue.line,
                column: issue.column,
                originalMessage: issue.message,
                fixApplied: `Added stub export '${missingExportName}' to ${targetFilePath}`,
                fixType: 'export_fix',
            });
            logger.info(logs.success(issue));
            
        } catch (error) {
            logger.error(`Failed to fix TS2305 issue at ${issue.filePath}:${issue.line}: ${error instanceof Error ? error.message : 'Unknown error'}`, error);
            unfixableIssues.push(handleFixerError(issue, error as Error, 'TS2305Fixer'));
        }
    }

    logger.info(logs.completed(fixedIssues.length, unfixableIssues.length, modifiedFiles.length, newFiles.length));
    
    return {
        fixedIssues,
        unfixableIssues,
        modifiedFiles,
        newFiles
    };
}

/**
 * Extract the module specifier from the TypeScript error message
 * Example: "Module './button' has no exported member 'Button'" -> './button'
 */
function extractModuleSpecifierFromMessage(errorMessage: string): string | null {
    const match = errorMessage.match(/Module ["']([^"']+)["'] has no exported member/);
    return match ? match[1] : null;
}

/**
 * Extract the missing export name from the TypeScript error message
 * Example: "Module './button' has no exported member 'Button'" -> 'Button'
 */
function extractMissingExportName(errorMessage: string, namedImports: string[]): string | null {
    // Try to match the standard TS2305 error message pattern
    const match = errorMessage.match(/has no exported member ["']([^"']+)["']/);
    if (match && match[1]) {
        return match[1];
    }
    
    // Fallback: if we can't parse the message, assume it's the first named import
    // This handles cases where the error message format might be different
    if (namedImports.length > 0) {
        return namedImports[0];
    }
    
    return null;
}

/**
 * Add a missing export to the target file AST based on usage analysis
 */
function addExportToFile(
    ast: t.File, 
    exportName: string, 
    usageAnalysis?: { name: string; type: string; properties?: string[]; parameters?: string[] }
): t.File {
    let exportDeclaration: t.Statement;
    
    // Add stub comment to generated exports  
    const stubComment = `This is a **STUB** export for '${exportName}', please implement it properly`;
    
    if (usageAnalysis) {
        switch (usageAnalysis.type) {
            case 'jsx-component':
                // Generate React component export
                exportDeclaration = createComponentExport(exportName, usageAnalysis.properties || [], stubComment);
                break;
                
            case 'function-call':
                // Generate function export
                exportDeclaration = createFunctionExport(exportName, usageAnalysis.parameters || [], stubComment);
                break;
                
            case 'object-access':
                // Generate object export with properties
                exportDeclaration = createObjectExport(exportName, usageAnalysis.properties || [], stubComment);
                break;
                
            default:
                // Generate generic variable export
                exportDeclaration = createVariableExport(exportName, stubComment);
        }
    } else {
        // No usage analysis available, create generic export
        exportDeclaration = createVariableExport(exportName, stubComment);
    }
    
    // Add the export to the end of the file
    ast.program.body.push(exportDeclaration);
    
    return ast;
}

/**
 * Create a React component export
 */
function createComponentExport(exportName: string, props: string[], stubComment: string): t.Statement {
    // Create props parameter with TypeScript annotation
    const propsParam = props.length > 0 ? 
        t.objectPattern(
            props.map(prop => 
                t.objectProperty(t.identifier(prop), t.identifier(prop))
            )
        ) : 
        t.identifier('props');

    // Add type annotation for props
    if (t.isObjectPattern(propsParam)) {
        const propsType = t.tsTypeLiteral(
            props.map(prop => {
                const signature = t.tsPropertySignature(
                    t.identifier(prop),
                    t.tsTypeAnnotation(t.tsStringKeyword())
                );
                signature.optional = true;
                return signature;
            })
        );
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
                [t.jsxText(`${stubComment} - Component: ${exportName}`)],
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
        t.variableDeclarator(t.identifier(exportName), componentFunction)
    ]);

    return t.exportNamedDeclaration(componentDeclaration);
}

/**
 * Create a function export
 */
function createFunctionExport(exportName: string, parameters: string[], stubComment: string): t.Statement {
    const params = parameters.map((_, index) => t.identifier(`arg${index}`));
    
    const functionBody = t.blockStatement([
        // Add stub comment as comment inside function
        t.expressionStatement(
            t.callExpression(
                t.memberExpression(t.identifier('console'), t.identifier('warn')),
                [t.stringLiteral(stubComment)]
            )
        ),
        t.returnStatement(t.nullLiteral())
    ]);

    const functionDeclaration = t.functionDeclaration(
        t.identifier(exportName),
        params,
        functionBody
    );

    return t.exportNamedDeclaration(functionDeclaration);
}

/**
 * Create an object export with properties
 */
function createObjectExport(exportName: string, properties: string[], stubComment: string): t.Statement {
    const objectProperties = properties.map(prop => 
        t.objectProperty(
            t.identifier(prop),
            t.arrowFunctionExpression([], t.blockStatement([
                t.returnStatement(t.nullLiteral())
            ]))
        )
    );

    const objectExpression = t.objectExpression(objectProperties);
    
    // Add stub comment property
    objectProperties.unshift(
        t.objectProperty(
            t.identifier('_stubComment'),
            t.stringLiteral(stubComment)
        )
    );
    
    return t.exportNamedDeclaration(
        t.variableDeclaration('const', [
            t.variableDeclarator(t.identifier(exportName), objectExpression)
        ])
    );
}

/**
 * Create a generic variable export
 */
function createVariableExport(exportName: string, stubComment: string): t.Statement {
    const value = t.objectExpression([
        t.objectProperty(
            t.identifier('_stubComment'),
            t.stringLiteral(stubComment)
        ),
        t.objectProperty(
            t.identifier('_stubFor'),
            t.stringLiteral(exportName)
        )
    ]);
    
    const declaration = t.variableDeclaration('const', [
        t.variableDeclarator(t.identifier(exportName), value)
    ]);

    return t.exportNamedDeclaration(declaration);
}

