/**
 * AST utility functions for parsing and generating code using Babel
 * Extracted from the working BabelASTProcessor to maintain exact functionality
 */

import { parse, ParserOptions } from '@babel/parser';
import traverse, { Visitor } from '@babel/traverse';
import generate from '@babel/generator';
import * as t from '@babel/types';
import { ParseOptions, GenerateOptions } from '../types';
import { createObjectLogger } from '../../../logger';

const logger = createObjectLogger({ name: 'ASTUtils' }, 'ASTUtils');

// ============================================================================
// PARSER CONFIGURATION
// ============================================================================

/**
 * Get the standard parser options that work with TypeScript/JSX
 * Preserves exact configuration from working BabelASTProcessor
 */
export function getDefaultParseOptions(): ParserOptions {
    return {
        sourceType: 'module',
        ranges: true,
        attachComment: false,
        allowImportExportEverywhere: true,
        allowReturnOutsideFunction: true,
        plugins: [
            'typescript',
            'jsx',
            'decorators-legacy',
            'classProperties',
            'objectRestSpread',
            'functionBind',
            'exportDefaultFrom',
            'exportNamespaceFrom',
            'dynamicImport',
            'nullishCoalescingOperator',
            'optionalChaining',
            'importMeta'
        ],
    };
}

/**
 * Merge custom options with defaults
 */
export function mergeParseOptions(custom?: ParseOptions): ParserOptions {
    const defaults = getDefaultParseOptions();
    if (!custom) return defaults;
    
    return {
        ...defaults,
        ...custom,
        plugins: custom.plugins ? custom.plugins as ParserOptions['plugins'] : defaults.plugins
    };
}

// ============================================================================
// CORE AST FUNCTIONS
// ============================================================================

/**
 * Parse code string to Babel AST
 * Includes fallback to JavaScript parsing if TypeScript parsing fails
 */
export function parseCode(code: string, options?: ParseOptions): t.File {
    const parseOptions = mergeParseOptions(options);
    
    try {
        logger.debug(`Parsing code (${code.length} characters) with TypeScript plugins`);
        const ast = parse(code, parseOptions);
        logger.debug(`Successfully parsed code to AST`);
        return ast;
    } catch (error) {
        logger.warn(`TypeScript parsing failed, falling back to JavaScript parsing: ${error instanceof Error ? error.message : 'Unknown error'}`);
        // Fallback to JavaScript parsing - match old implementation behavior
        const jsOptions = { ...parseOptions };
        jsOptions.plugins = jsOptions.plugins?.filter(p => p !== 'typescript');
        // Don't wrap in try-catch - let it throw the original Babel error if it fails
        // This matches the old implementation's behavior
        const ast = parse(code, jsOptions);
        logger.debug(`Successfully parsed code to AST using JavaScript fallback`);
        return ast;
    }
}

/**
 * Traverse AST with visitor pattern
 * Direct wrapper around Babel traverse
 */
export function traverseAST(ast: t.Node, visitor: Visitor): void {
    try {
        logger.debug(`Starting AST traversal`);
        // First try with full scope building
        (traverse as unknown as (node: t.Node, opts: Visitor) => void)(ast, visitor);
        logger.debug(`AST traversal completed successfully`);
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const shouldRetryNoScope = message.includes("reading 'get'") || message.includes('Scope') || message.includes('setScope');
        if (shouldRetryNoScope) {
            logger.warn(`AST traversal failed with scope error, retrying with noScope: true`);
            try {
                (traverse as unknown as (node: t.Node, opts: Visitor & { noScope?: boolean }) => void)(
                    ast,
                    { ...(visitor as object), noScope: true } as Visitor & { noScope?: boolean }
                );
                logger.debug(`AST traversal with noScope completed successfully`);
                return;
            } catch (e2) {
                logger.error(`AST traversal (noScope) failed`, e2);
                throw new Error(`Failed to traverse AST: ${e2 instanceof Error ? e2.message : 'Unknown error'}`);
            }
        }
        logger.error(`AST traversal failed`, error);
        throw new Error(`Failed to traverse AST: ${message}`);
    }
}

/**
 * Generate code from AST
 * Uses settings optimized for readable output
 */
export function generateCode(ast: t.Node, options?: GenerateOptions): { code: string } {
    const generateOptions = {
        retainLines: true,
        compact: false,
        concise: false,
        ...options
    };
    
    try {
        logger.debug(`Generating code from AST`);
        const result = generate(ast, generateOptions);
        logger.debug(`Successfully generated code (${result.code.length} characters)`);
        return result;
    } catch (error) {
        logger.error(`Code generation failed`, error);
        throw new Error(`Failed to generate code from AST: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
}

// ============================================================================
// FILE TYPE DETECTION
// ============================================================================

/**
 * Check if a file path represents a script file (TypeScript/JavaScript)
 */
export function isScriptFile(filePath: string): boolean {
    return /\.(ts|tsx|js|jsx)$/.test(filePath);
}

/**
 * Determine if code contains JSX based on usage analysis
 */
export function shouldUseJSXExtension(usageAnalysis: Array<{ type: string }>): boolean {
    return usageAnalysis.some(usage => usage.type === 'jsx-component');
}

/**
 * Get appropriate file extension based on usage
 */
export function getAppropriateExtension(usageAnalysis: Array<{ type: string }>): string {
    return shouldUseJSXExtension(usageAnalysis) ? '.tsx' : '.ts';
}

// ============================================================================
// AST NODE UTILITIES
// ============================================================================

/**
 * Create a React import declaration for JSX files
 */
export function createReactImport(): t.ImportDeclaration {
    return t.importDeclaration(
        [t.importDefaultSpecifier(t.identifier('React'))],
        t.stringLiteral('react')
    );
}

/**
 * Create an export statement from a variable declaration
 */
export function createNamedExport(declaration: t.VariableDeclaration): t.ExportNamedDeclaration {
    return t.exportNamedDeclaration(declaration);
}

/**
 * Create a default export from an identifier
 */
export function createDefaultExport(identifier: t.Identifier): t.ExportDefaultDeclaration {
    return t.exportDefaultDeclaration(identifier);
}

/**
 * Create a file AST with given statements
 */
export function createFileAST(statements: t.Statement[]): t.File {
    return t.file(
        t.program(statements, [], 'module'),
        [],
        []
    );
}

// ============================================================================
// AST VALIDATION
// ============================================================================

/**
 * Validate that an AST node is a valid File node
 */
export function isValidFileAST(ast: t.Node): ast is t.File {
    return t.isFile(ast);
}

/**
 * Validate that generated code is syntactically correct
 */
export function validateGeneratedCode(code: string): boolean {
    try {
        parseCode(code);
        return true;
    } catch {
        return false;
    }
}