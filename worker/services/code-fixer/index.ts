/**
 * Main functional entry point for the deterministic code fixer
 * Stateless, functional approach to fixing TypeScript compilation issues
 */

import { FileObject } from './types';
import { CodeIssue } from '../sandbox/sandboxTypes';
import { 
    CodeFixResult, 
    FixerContext, 
    FileMap, 
    ProjectFile,
    FixerRegistry
} from './types';
import { isScriptFile } from './utils/ast';
import { canModifyFile } from './utils/modules';

// Import all fixers
import { fixModuleNotFound } from './fixers/ts2307';
import { fixModuleIsNotModule } from './fixers/ts2613';
import { fixUndefinedName } from './fixers/ts2304';
import { fixMissingExportedMember } from './fixers/ts2305';
import { fixImportExportTypeMismatch } from './fixers/ts2614';
import { fixIncorrectNamedImport } from './fixers/ts2724';


// ============================================================================
// MAIN ENTRY POINT
// ============================================================================

/**
 * Fix TypeScript compilation issues across the entire project
 * Properly accumulates multiple fixes to the same file
 * 
 * @param allFiles - Initial files to work with
 * @param issues - TypeScript compilation issues to fix
 * @returns Promise containing fix results with modified/new files
 */
export function fixProjectIssues(
    allFiles: FileObject[],
    issues: CodeIssue[]
): CodeFixResult {
    try {
        // Build file map (mutable for caching fetched files)
        const fileMap = createFileMap(allFiles);
        
        // Create fixer context with mutable fetchedFiles set
        const fetchedFiles = new Set<string>();
        const context: FixerContext = {
            files: fileMap,
            fetchedFiles
        };
        
        // Get fixer registry
        const fixerRegistry = createFixerRegistry();
        
        // Separate fixable and unfixable issues
        const { fixableIssues, unfixableIssues } = separateIssues(issues, fixerRegistry);
        
        // Sort issues for optimal fix order
        const sortedIssues = sortFixOrder(fixableIssues);
        
        // Apply fixes sequentially, updating context after each
        const results = applyFixesSequentially(
            context, 
            sortedIssues, 
            fixerRegistry
        );
        
        // Add pre-separated unfixable issues
        const finalResult = addUnfixableIssues(results, unfixableIssues);
        
        return finalResult;
        
    } catch (error) {
        // If there's a global error, mark all issues as unfixable
        return {
            fixedIssues: [],
            unfixableIssues: issues.map(issue => ({
                issueCode: issue.ruleId || 'UNKNOWN',
                filePath: issue.filePath,
                line: issue.line,
                column: issue.column,
                originalMessage: issue.message,
                reason: `Global fixer error: ${error instanceof Error ? error.message : 'Unknown error'}`
            })),
            modifiedFiles: []
        };
    }
}

// ============================================================================
// FILE MAP CREATION
// ============================================================================

/**
 * Create file map from input files (mutable for caching fetched files)
 */
function createFileMap(files: FileObject[]): FileMap {
    const fileMap = new Map<string, ProjectFile>();
    
    for (const file of files) {
        // Only include script files
        if (isScriptFile(file.filePath)) {
            fileMap.set(file.filePath, {
                filePath: file.filePath,
                content: file.fileContents,
                ast: undefined // Lazy-loaded
            });
        }
    }
    
    return fileMap;
}

// ============================================================================
// FIXER REGISTRY
// ============================================================================

/**
 * Create registry of all available fixers
 */
function createFixerRegistry(): FixerRegistry {
    const registry = new Map();
    
    // Register fixers with their detection functions
    registry.set('TS2307', fixModuleNotFound);
    registry.set('TS2613', fixModuleIsNotModule);
    registry.set('TS2304', fixUndefinedName);
    registry.set('TS2305', fixMissingExportedMember);
    registry.set('TS2614', fixImportExportTypeMismatch);
    registry.set('TS2724', fixIncorrectNamedImport);
    
    return registry;
}


// ============================================================================
// ISSUE GROUPING
// ============================================================================

/**
 * Separate issues into fixable and unfixable based on available fixers
 */
function separateIssues(
    issues: CodeIssue[],
    fixerRegistry: FixerRegistry
): { fixableIssues: CodeIssue[]; unfixableIssues: CodeIssue[] } {
    const fixableIssues: CodeIssue[] = [];
    const unfixableIssues: CodeIssue[] = [];
    
    for (const issue of issues) {
        if (issue.ruleId && fixerRegistry.has(issue.ruleId)) {
            fixableIssues.push(issue);
        } else {
            unfixableIssues.push(issue);
        }
    }
    
    return { fixableIssues, unfixableIssues };
}


// ============================================================================
// FIX APPLICATION
// ============================================================================

/**
 * Sort issues for optimal fix order
 */
function sortFixOrder(issues: CodeIssue[]): CodeIssue[] {
    // Priority order:
    // 1. TS2307 - Module not found (creates files)
    // 2. TS2305 - Missing exports (adds to existing files)
    // 3. TS2613/TS2614 - Import/export mismatches
    // 4. TS2724 - Incorrect named imports
    // 5. TS2304 - Undefined names (adds declarations)
    
    const priorityMap: Record<string, number> = {
        'TS2307': 1,
        'TS2305': 2,
        'TS2613': 3,
        'TS2614': 3,
        'TS2724': 4,
        'TS2304': 5,
    };
    
    return issues.sort((a, b) => {
        const aPriority = priorityMap[a.ruleId || ''] || 99;
        const bPriority = priorityMap[b.ruleId || ''] || 99;
        
        if (aPriority !== bPriority) {
            return aPriority - bPriority;
        }
        
        // Within same priority, sort by file then line
        if (a.filePath !== b.filePath) {
            return a.filePath.localeCompare(b.filePath);
        }
        
        return a.line - b.line;
    });
}

/**
 * Apply fixes sequentially, updating context after each fix
 */
function applyFixesSequentially(
    context: FixerContext,
    sortedIssues: CodeIssue[],
    fixerRegistry: FixerRegistry
): CodeFixResult {
    const fixedIssues: any[] = [];
    const unfixableIssues: any[] = [];
    const modifiedFiles = new Map<string, FileObject>();
    const newFiles = new Map<string, FileObject>();
    
    // Group issues by fixer type to batch them
    const issuesByFixer = new Map<string, CodeIssue[]>();
    for (const issue of sortedIssues) {
        const type = issue.ruleId || 'UNKNOWN';
        const issues = issuesByFixer.get(type) || [];
        issues.push(issue);
        issuesByFixer.set(type, issues);
    }
    
    // Apply each fixer in priority order
    const fixerTypes = Array.from(issuesByFixer.keys()).sort((a, b) => {
        const priorityMap: Record<string, number> = {
            'TS2307': 1,
            'TS2305': 2,
            'TS2613': 3,
            'TS2614': 3,
            'TS2724': 4,
            'TS2304': 5,
        };
        return (priorityMap[a] || 99) - (priorityMap[b] || 99);
    });
    
    for (const fixerType of fixerTypes) {
        const issues = issuesByFixer.get(fixerType) || [];
        const fixer = fixerRegistry.get(fixerType);
        
        if (!fixer) {
            unfixableIssues.push(...issues.map(issue => ({
                issueCode: issue.ruleId || 'UNKNOWN',
                filePath: issue.filePath,
                line: issue.line,
                column: issue.column,
                originalMessage: issue.message,
                reason: 'No fixer available'
            })));
            continue;
        }
        
        try {
            // Apply fixer
            const result = fixer(context, issues);
            
            // Collect results
            fixedIssues.push(...result.fixedIssues);
            unfixableIssues.push(...result.unfixableIssues);
            
            // Update files - these override previous versions
            for (const file of result.modifiedFiles) {
                if (canModifyFile(file.filePath)) {
                    modifiedFiles.set(file.filePath, file);
                    // Update context for next fixer
                    context.files.set(file.filePath, {
                        filePath: file.filePath,
                        content: file.fileContents,
                        ast: undefined
                    });
                }
            }
            
            for (const file of result.newFiles || []) {
                if (canModifyFile(file.filePath)) {
                    newFiles.set(file.filePath, file);
                    // Add to context for next fixer
                    context.files.set(file.filePath, {
                        filePath: file.filePath,
                        content: file.fileContents,
                        ast: undefined
                    });
                }
            }
        } catch (error) {
            unfixableIssues.push(...issues.map(issue => ({
                issueCode: issue.ruleId || 'UNKNOWN',
                filePath: issue.filePath,
                line: issue.line,
                column: issue.column,
                originalMessage: issue.message,
                reason: `Fixer failed: ${error instanceof Error ? error.message : 'Unknown error'}`
            })));
        }
    }
    
    return {
        fixedIssues,
        unfixableIssues,
        modifiedFiles: Array.from(modifiedFiles.values()),
        newFiles: Array.from(newFiles.values())
    };
}

// ============================================================================
// RESULT MERGING
// ============================================================================

/**
 * Add pre-separated unfixable issues to results
 */
function addUnfixableIssues(
    results: CodeFixResult,
    preSeparatedUnfixableIssues: CodeIssue[]
): CodeFixResult {
    // Convert pre-separated unfixable issues to proper format
    const noFixerAvailableIssues = preSeparatedUnfixableIssues.map(issue => {
        let reason = 'No fixer available for this issue type';
        
        if (!canModifyFile(issue.filePath)) {
            reason += ' (file outside project boundaries)';
        }
        
        return {
            issueCode: issue.ruleId || 'UNKNOWN',
            filePath: issue.filePath,
            line: issue.line,
            column: issue.column,
            originalMessage: issue.message,
            reason
        };
    });
    
    return {
        ...results,
        unfixableIssues: [...results.unfixableIssues, ...noFixerAvailableIssues]
    };
}

// ============================================================================
// CONVENIENCE EXPORTS
// ============================================================================

// Re-export types for easy importing
export type {
    CodeFixResult,
    FixedIssue,
    UnfixableIssue,
    FileObject,
    FixerContext,
    FileMap,
    ProjectFile
} from './types';

// Re-export utility functions that might be useful
export { isScriptFile } from './utils/ast';
export { resolvePathAlias, makeRelativeImport } from './utils/paths';
export { analyzeImportUsage } from './utils/imports';
export { generateStubFileContent } from './utils/stubs';