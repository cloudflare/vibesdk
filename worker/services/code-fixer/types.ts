/**
 * Type definitions for the deterministic code fixer
 * All interfaces and types used across the functional code fixing system
 */

import * as t from '@babel/types';
import { CodeIssue } from '../sandbox/sandboxTypes';

// ============================================================================
// CORE RESULT TYPES
// ============================================================================

export interface FileObject {
    filePath: string;
    fileContents: string;
}

/**
 * Represents a TypeScript issue that was successfully fixed
 */
export interface FixedIssue {
    /** TypeScript error code (e.g., 'TS2307') */
    issueCode: string;
    /** File path where the issue was located */
    filePath: string;
    /** Line number of the issue */
    line: number;
    /** Column number of the issue (optional) */
    column?: number;
    /** Original error message from TypeScript */
    originalMessage: string;
    /** Description of the fix that was applied */
    fixApplied: string;
    /** Type of fix that was applied */
    fixType: 'import_fix' | 'export_fix' | 'stub_creation' | 'declaration_fix';
}

/**
 * Represents a TypeScript issue that could not be fixed automatically
 */
export interface UnfixableIssue {
    /** TypeScript error code (e.g., 'TS2307') */
    issueCode: string;
    /** File path where the issue was located */
    filePath: string;
    /** Line number of the issue */
    line: number;
    /** Column number of the issue (optional) */
    column?: number;
    /** Original error message from TypeScript */
    originalMessage: string;
    /** Reason why the issue could not be fixed */
    reason: string;
}

/**
 * Result of running the deterministic code fixer
 */
export interface CodeFixResult {
    /** Issues that were successfully fixed */
    fixedIssues: FixedIssue[];
    /** Issues that could not be fixed automatically */
    unfixableIssues: UnfixableIssue[];
    /** Files that were modified with fixes applied */
    modifiedFiles: FileObject[];
    /** New files that were created (e.g., stubs) */
    newFiles?: FileObject[];
}

// ============================================================================
// FILE AND AST MANAGEMENT
// ============================================================================

/**
 * File fetcher callback type for dynamically loading files not in the initial set
 */
export type FileFetcher = (filePath: string) => Promise<FileObject | null>;

/**
 * Represents a file in the project with its content and cached AST
 */
export interface ProjectFile {
    filePath: string;
    content: string;
    ast?: t.File;
}

/**
 * Map of file paths to project files (mutable for caching fetched files)
 */
export type FileMap = Map<string, ProjectFile>;

/**
 * Context passed to all fixer functions containing necessary data
 */
export interface FixerContext {
    /** Map of all files in the project (mutable for caching fetched files) */
    files: FileMap;
    /** Optional callback to fetch additional files */
    readonly fileFetcher?: FileFetcher;
    /** Cache of fetched files to prevent duplicate requests */
    readonly fetchedFiles: ReadonlySet<string>;
}

// ============================================================================
// IMPORT/EXPORT ANALYSIS
// ============================================================================

/**
 * Information about an import statement
 */
export interface ImportInfo {
    /** The import specifier (e.g., './test', '@/components/ui/button') */
    specifier: string;
    /** Same as specifier for compatibility */
    moduleSpecifier: string;
    /** Default import name if present */
    defaultImport?: string;
    /** Array of named import names */
    namedImports: string[];
    /** File path where this import is located */
    filePath: string;
}

/**
 * Information about exports in a file
 */
export interface ExportInfo {
    /** Default export name if present */
    defaultExport?: string;
    /** Array of named export names */
    namedExports: string[];
    /** File path of the file containing these exports */
    filePath: string;
}

/**
 * Analysis of how an imported name is used in the code
 */
export interface ImportUsage {
    /** The imported name */
    name: string;
    /** Type of usage detected */
    type: 'jsx-component' | 'function-call' | 'object-access' | 'variable-reference';
    /** Properties accessed (for jsx-component: prop names, for object-access: accessed properties) */
    properties?: string[];
    /** Parameters passed (for function-call: parameter types/patterns) */
    parameters?: unknown[];
    /** Inferred return type from usage context */
    returnType?: string;
}

// ============================================================================
// FIXER FUNCTION TYPES
// ============================================================================

/**
 * Result from an individual fixer function
 */
export interface FixResult {
    /** Issues that were successfully fixed */
    fixedIssues: FixedIssue[];
    /** Issues that could not be fixed */
    unfixableIssues: UnfixableIssue[];
    /** Files that were modified */
    modifiedFiles: FileObject[];
    /** New files that were created */
    newFiles: FileObject[];
}

/**
 * Function signature for individual issue fixers
 */
export type FixerFunction = (
    context: FixerContext,
    issues: CodeIssue[]
) => Promise<FixResult>;

/**
 * Registry of fixer functions by issue code
 */
export type FixerRegistry = ReadonlyMap<string, FixerFunction>;

// ============================================================================
// UTILITY TYPES
// ============================================================================

/**
 * Options for AST parsing
 */
export interface ParseOptions {
    sourceType?: 'module' | 'script';
    allowImportExportEverywhere?: boolean;
    allowReturnOutsideFunction?: boolean;
    ranges?: boolean;
    plugins?: string[];
}

/**
 * Options for code generation
 */
export interface GenerateOptions {
    retainLines?: boolean;
    compact?: boolean;
    concise?: boolean;
}

/**
 * Path resolution context
 */
export interface PathContext {
    /** Current file path */
    currentFile: string;
    /** Import specifier to resolve */
    importSpecifier: string;
    /** Available files in the project */
    availableFiles: string[];
}