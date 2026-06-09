/**
 * Module detection and validation utilities
 * Centralized logic for determining external vs internal modules
 */

import { FixerContext } from '../types';
import { getFileContent } from './imports';
import { findModuleFile } from './paths';

// ============================================================================
// EXTERNAL MODULE DETECTION
// ============================================================================

/**
 * Determine if a module specifier is an external package (npm module)
 * that we should NOT attempt to modify
 */
export function isExternalModule(moduleSpecifier: string): boolean {
    // Local module patterns (relative paths and path aliases)
    if (moduleSpecifier.startsWith('./') || 
        moduleSpecifier.startsWith('../') || 
        moduleSpecifier.startsWith('@/') ||
        moduleSpecifier.startsWith('src/')) {
        return false;
    }
    
    // Check if it looks like a file path (has extension or path segments within src)
    if (moduleSpecifier.includes('/') && 
        (moduleSpecifier.includes('.') || moduleSpecifier.includes('src/'))) {
        return false;
    }
    
    // Everything else is considered an external package
    return true;
}

/**
 * Check if a file path is within the project boundaries and can be modified
 */
export function canModifyFile(filePath: string): boolean {
    // Only allow modification of files in the project directory
    // Exclude node_modules and other external directories
    if (filePath.includes('node_modules/') || 
        filePath.includes('.git/') ||
        filePath.startsWith('/') && !filePath.startsWith('/app/') && !filePath.startsWith('/Users/')) {
        return false;
    }
    
    // Must be a script file we can modify
    const scriptExtensions = ['.ts', '.tsx', '.js', '.jsx'];
    return scriptExtensions.some(ext => filePath.endsWith(ext));
}

// ============================================================================
// MODULE FILE RESOLUTION
// ============================================================================

/**
 * Resolve a module specifier to an actual file path within the project
 * Unified resolution logic used by all fixers
 */
export function resolveModuleFile(
    moduleSpecifier: string,
    fromFilePath: string,
    context: FixerContext
): string | null {
    // Skip external modules - we cannot modify them
    if (isExternalModule(moduleSpecifier)) {
        return null;
    }
    
    // Use existing findModuleFile logic for internal modules
    return findModuleFile(
        moduleSpecifier,
        fromFilePath,
        context.files
    );
}

/**
 * Check if a target file exists and can be modified
 */
export function canModifyTargetFile(
    targetFilePath: string,
    context: FixerContext
): boolean {
    if (!canModifyFile(targetFilePath)) {
        return false;
    }
    
    try {
        const content = getFileContent(
            targetFilePath,
            context.files
        );
        return content !== null;
    } catch {
        return false;
    }
}

// ============================================================================
// VALIDATION HELPERS
// ============================================================================

/**
 * Validate that a module operation is safe and allowed
 */
export function validateModuleOperation(
    moduleSpecifier: string,
    targetFilePath: string | null
): { valid: boolean; reason?: string } {
    // Check if it's an external module we shouldn't touch
    if (isExternalModule(moduleSpecifier)) {
        return {
            valid: false,
            reason: `External package "${moduleSpecifier}" should be handled by package manager`
        };
    }
    
    // Check if target file is within allowed boundaries
    if (targetFilePath && !canModifyFile(targetFilePath)) {
        return {
            valid: false,
            reason: `Target file "${targetFilePath}" is outside project boundaries`
        };
    }
    
    return { valid: true };
}

/**
 * Get module type for logging and error reporting
 */
export function getModuleType(moduleSpecifier: string): 'external' | 'relative' | 'alias' | 'absolute' {
    if (isExternalModule(moduleSpecifier)) {
        return 'external';
    }
    
    if (moduleSpecifier.startsWith('./') || moduleSpecifier.startsWith('../')) {
        return 'relative';
    }
    
    if (moduleSpecifier.startsWith('@/')) {
        return 'alias';
    }
    
    return 'absolute';
}