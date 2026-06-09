/**
 * Common helper utilities for all fixers
 * Implements DRY principles by centralizing repeated patterns
 */

import * as t from '@babel/types';
import { CodeIssue } from '../../sandbox/sandboxTypes';
import { FixerContext, UnfixableIssue } from '../types';
import { getFileAST, findImportAtLocation } from './imports';
import { resolveModuleFile, validateModuleOperation } from './modules';

// ============================================================================
// COMMON FIXER PATTERNS
// ============================================================================

/**
 * Standard pattern: Get source file AST and import info
 * Used by TS2305, TS2613, TS2614 fixers
 */
export function getSourceFileAndImport(
    issue: CodeIssue,
    context: FixerContext
): {
    sourceAST: t.File;
    importInfo: { moduleSpecifier: string; defaultImport?: string; namedImports: string[]; specifier?: string };
} | null {
    // Get AST for the source file
    const sourceAST = getFileAST(
        issue.filePath,
        context.files,
    );
    
    if (!sourceAST) {
        return null;
    }
    
    // Find the import at the error location
    const importInfo = findImportAtLocation(sourceAST, issue.line);
    if (!importInfo) {
        return null;
    }
    
    return { sourceAST, importInfo };
}

/**
 * Standard pattern: Get target file for a module specifier
 * Used by TS2305, TS2613, TS2614 fixers
 */
export function getTargetFileAndAST(
    moduleSpecifier: string,
    fromFilePath: string,
    context: FixerContext
): {
    targetFilePath: string;
    targetAST: t.File;
} | null {
    // Validate the module operation first
    const validation = validateModuleOperation(moduleSpecifier, null);
    if (!validation.valid) {
        return null;
    }
    
    // Resolve the target file
    const targetFilePath = resolveModuleFile(moduleSpecifier, fromFilePath, context);
    if (!targetFilePath) {
        return null;
    }
    
    // Validate the resolved file path
    const fileValidation = validateModuleOperation(moduleSpecifier, targetFilePath);
    if (!fileValidation.valid) {
        return null;
    }
    
    // Get AST for target file
    const targetAST = getFileAST(
        targetFilePath,
        context.files,
    );
    
    if (!targetAST) {
        return null;
    }
    
    return { targetFilePath, targetAST };
}

/**
 * Combined pattern: Get both source and target files
 * Used by import/export fixers that need both files
 */
export function getSourceAndTargetFiles(
    issue: CodeIssue,
    context: FixerContext
): {
    sourceAST: t.File;
    importInfo: { moduleSpecifier: string; defaultImport?: string; namedImports: string[]; specifier?: string };
    targetFilePath: string;
    targetAST: t.File;
} | null {
    // Get source file and import info
    const sourceResult = getSourceFileAndImport(issue, context);
    if (!sourceResult) {
        return null;
    }
    
    const { sourceAST, importInfo } = sourceResult;
    
    // Get target file and AST
    const targetResult = getTargetFileAndAST(
        importInfo.moduleSpecifier,
        issue.filePath,
        context
    );
    
    if (!targetResult) {
        return null;
    }
    
    const { targetFilePath, targetAST } = targetResult;
    
    return {
        sourceAST,
        importInfo,
        targetFilePath,
        targetAST
    };
}

// ============================================================================
// ERROR HANDLING HELPERS
// ============================================================================

/**
 * Create a standardized unfixable issue with consistent format
 */
export function createUnfixableIssue(
    issue: CodeIssue,
    reason: string
): UnfixableIssue {
    return {
        issueCode: issue.ruleId || 'UNKNOWN',
        filePath: issue.filePath,
        line: issue.line,
        column: issue.column,
        originalMessage: issue.message,
        reason
    };
}

/**
 * Handle common fixer errors with standardized messages
 */
export function handleFixerError(
    issue: CodeIssue,
    error: Error,
    fixerName: string
): UnfixableIssue {
    return createUnfixableIssue(
        issue,
        `${fixerName} failed: ${error.message}`
    );
}

/**
 * Create unfixable issue for source file parsing failures
 */
export function createSourceFileParseError(issue: CodeIssue): UnfixableIssue {
    return createUnfixableIssue(issue, 'Failed to parse source file AST');
}

/**
 * Create unfixable issue for missing import at location
 */
export function createMissingImportError(issue: CodeIssue): UnfixableIssue {
    return createUnfixableIssue(issue, 'No import found at specified location');
}

/**
 * Create unfixable issue for external module operations
 */
export function createExternalModuleError(issue: CodeIssue, moduleSpecifier: string): UnfixableIssue {
    return createUnfixableIssue(
        issue,
        `External package "${moduleSpecifier}" should be handled by package manager`
    );
}

/**
 * Create unfixable issue for target file not found
 */
export function createTargetFileNotFoundError(issue: CodeIssue, moduleSpecifier: string): UnfixableIssue {
    return createUnfixableIssue(
        issue,
        `Target file not found for module: ${moduleSpecifier}`
    );
}

/**
 * Create unfixable issue for target file parsing failures
 */
export function createTargetFileParseError(issue: CodeIssue, targetFilePath: string): UnfixableIssue {
    return createUnfixableIssue(
        issue,
        `Failed to parse target file: ${targetFilePath}`
    );
}

// ============================================================================
// VALIDATION HELPERS
// ============================================================================

/**
 * Validate a fixer operation and return appropriate error if invalid
 */
export function validateFixerOperation(
    issue: CodeIssue,
    moduleSpecifier?: string,
    targetFilePath?: string
): UnfixableIssue | null {
    if (moduleSpecifier) {
        const validation = validateModuleOperation(moduleSpecifier, targetFilePath || null);
        if (!validation.valid) {
            return createUnfixableIssue(issue, validation.reason!);
        }
    }
    
    return null;
}

// ============================================================================
// LOGGING HELPERS
// ============================================================================

/**
 * Create consistent log messages for fixer operations
 */
export function createFixerLogMessages(fixerName: string, issueCount: number) {
    return {
        start: `Starting ${fixerName} with ${issueCount} issues`,
        processing: (issue: CodeIssue) => `Processing ${issue.ruleId} issue: ${issue.message} at ${issue.filePath}:${issue.line}`,
        success: (issue: CodeIssue) => `Successfully fixed ${issue.ruleId} issue for ${issue.filePath}`,
        completed: (fixed: number, unfixable: number, modified: number, newFiles: number) =>
            `${fixerName} completed: ${fixed} fixed, ${unfixable} unfixable, ${modified} modified files, ${newFiles} new files`
    };
}