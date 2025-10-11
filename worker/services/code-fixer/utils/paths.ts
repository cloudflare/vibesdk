/**
 * Path resolution utilities for import specifiers
 * Extracted from working ImportExportAnalyzer to preserve exact functionality
 */

import { FileMap, FileFetcher } from '../types';
import { isScriptFile } from './ast';
import { getFileContent } from './imports';

// ============================================================================
// PATH ALIAS RESOLUTION
// ============================================================================

/**
 * Resolve path aliases like @/components/ui/button to src/components/ui/button
 * Preserves exact logic from working implementation
 */
export function resolvePathAlias(importSpecifier: string): string {
    if (importSpecifier.startsWith('@/')) {
        // Convert @/components/ui/button to src/components/ui/button
        return importSpecifier.replace('@/', 'src/');
    }
    return importSpecifier;
}

// ============================================================================
// RELATIVE PATH RESOLUTION
// ============================================================================

/**
 * Resolve relative import paths to absolute paths within the project
 * Preserves exact logic from working implementation
 */
export async function resolveImportPath(
    importSpecifier: string, 
    currentFilePath: string,
    files: FileMap,
    fileFetcher?: FileFetcher,
    fetchedFiles?: Set<string>
): Promise<string> {
    if (importSpecifier.startsWith('./') || importSpecifier.startsWith('../')) {
        // Relative import - resolve relative to current file directory
        const currentDirParts = currentFilePath.split('/').slice(0, -1);
        const importParts = importSpecifier.split('/');
        
        // Combine current directory with import path parts
        const combinedParts = [...currentDirParts, ...importParts];
        const normalizedParts: string[] = [];
        
        // Normalize path (handle ../ and ./)
        for (const part of combinedParts) {
            if (part === '..') {
                normalizedParts.pop();
            } else if (part !== '.' && part !== '') {
                normalizedParts.push(part);
            }
        }
        
        const resolvedPath = normalizedParts.join('/');
        
        // Try common extensions
        for (const ext of ['.ts', '.tsx', '.js', '.jsx']) {
            if (!resolvedPath.endsWith(ext)) {
                const withExt = resolvedPath + ext;
                try {
                    const fileContent = await getFileContent(withExt, files, fileFetcher, fetchedFiles);
                    if (fileContent) return withExt;
                } catch {
                    // File doesn't exist or can't be fetched, try next extension
                }
            }
        }
        
        return resolvedPath;
    } else {
        // Absolute import - return as is for now
        return importSpecifier;
    }
}

// ============================================================================
// MODULE FILE FINDING
// ============================================================================

/**
 * Find a module file using fuzzy matching and file fetching
 * Preserves exact logic from working ImportExportAnalyzer.findModuleFile
 */
export async function findModuleFile(
    importSpecifier: string, 
    currentFilePath: string,
    files: FileMap,
    fileFetcher?: FileFetcher,
    fetchedFiles?: Set<string>
): Promise<string | null> {
    // Handle path aliases like @/components/ui/button
    const resolvedSpecifier = resolvePathAlias(importSpecifier);
    
    // Try exact match first (relative/absolute paths)
    const exactMatch = await resolveImportPath(resolvedSpecifier, currentFilePath, files, fileFetcher, fetchedFiles);
    if (exactMatch) {
        // Check if file exists in files Map after potential fetching
        const allFiles = Array.from(files.keys());
        if (allFiles.some(file => file === exactMatch)) {
            return exactMatch;
        }
    }

    // Get current files list for fallback logic
    const allFiles = Array.from(files.keys());

    // Try direct path matching for aliases
    for (const file of allFiles) {
        if (file === resolvedSpecifier || 
            file === resolvedSpecifier + '.ts' ||
            file === resolvedSpecifier + '.tsx' ||
            file === resolvedSpecifier + '.js' ||
            file === resolvedSpecifier + '.jsx') {
            return file;
        }
    }

    // Try to fetch the file with common extensions
    const extensionsToTry = ['.tsx', '.ts', '.jsx', '.js'];
    for (const ext of extensionsToTry) {
        const candidatePath = resolvedSpecifier + ext;
        
        try {
            // Try to get file content (this will trigger fetching if available)
            const content = await getFileContent(candidatePath, files, fileFetcher, fetchedFiles);
            if (content) {
                return candidatePath;
            }
        } catch {
            // Failed to fetch, continue to next extension
        }
    }

    // Fuzzy matching: look for files with similar names
    const searchTerm = resolvedSpecifier.replace(/^\.\/|^\.\.\/|^\//, '').replace(/\.(ts|tsx|js|jsx)$/, '');
    
    for (const file of allFiles) {
        const fileName = file.split('/').pop()?.replace(/\.(ts|tsx|js|jsx)$/, '') || '';
        
        // Check if filename matches or contains the search term
        if (fileName === searchTerm || fileName.includes(searchTerm) || searchTerm.includes(fileName)) {
            return file;
        }
    }

    return null;
}

// ============================================================================
// RELATIVE IMPORT CREATION
// ============================================================================

/**
 * Create a relative import path from one file to another
 * Preserves exact logic from working implementation
 */
export function makeRelativeImport(fromFile: string, toFile: string): string {
    const fromParts = fromFile.split('/').slice(0, -1);  // Remove filename
    const toParts = toFile.split('/').slice(0, -1);      // Remove filename
    const toFileName = toFile.split('/').pop()?.replace(/\.(ts|tsx|js|jsx)$/, '') || '';

    // Find common prefix
    let commonLength = 0;
    while (commonLength < fromParts.length && 
           commonLength < toParts.length && 
           fromParts[commonLength] === toParts[commonLength]) {
        commonLength++;
    }

    // Build relative path
    const upLevels = fromParts.length - commonLength;
    const downPath = toParts.slice(commonLength);

    let relativePath = '';
    if (upLevels > 0) {
        relativePath = '../'.repeat(upLevels);
    } else {
        relativePath = './';
    }

    if (downPath.length > 0) {
        relativePath += downPath.join('/') + '/';
    }

    relativePath += toFileName;

    return relativePath;
}

// ============================================================================
// IMPORT TO FILE PATH RESOLUTION
// ============================================================================

/**
 * Resolve an import specifier to a target file path for stub creation
 * Preserves exact logic from working implementation
 */
export function resolveImportToFilePath(importSpecifier: string, currentFilePath: string): string {
    if (importSpecifier.startsWith('./') || importSpecifier.startsWith('../')) {
        const currentDir = currentFilePath.split('/').slice(0, -1).join('/');
        
        // Resolve the path manually
        const pathParts = currentDir.split('/').concat(importSpecifier.split('/'));
        const normalizedParts: string[] = [];
        
        for (const part of pathParts) {
            if (part === '..') {
                normalizedParts.pop();
            } else if (part !== '.' && part !== '') {
                normalizedParts.push(part);
            }
        }
        
        const resolvedPath = normalizedParts.join('/');
        
        // Add appropriate extension if not present
        if (!resolvedPath.match(/\.(ts|tsx|js|jsx)$/)) {
            return resolvedPath + '.tsx'; // Default to .tsx for React components
        }
        return resolvedPath;
    } else if (importSpecifier.startsWith('@/')) {
        // Handle path aliases - convert @/ to src/
        const withoutAlias = importSpecifier.replace('@/', 'src/');
        if (!withoutAlias.match(/\.(ts|tsx|js|jsx)$/)) {
            return withoutAlias + '.tsx';
        }
        return withoutAlias;
    } else {
        // For other absolute imports, create in src directory by default
        const fileName = importSpecifier.split('/').pop() || 'index';
        return `src/${fileName}.tsx`;
    }
}

// ============================================================================
// PATH VALIDATION
// ============================================================================

/**
 * Check if a path is a valid script file path
 */
export function isValidScriptPath(filePath: string): boolean {
    return isScriptFile(filePath);
}

/**
 * Normalize a file path by removing redundant parts
 */
export function normalizePath(filePath: string): string {
    const parts = filePath.split('/').filter(part => part !== '');
    const normalized: string[] = [];
    
    for (const part of parts) {
        if (part === '..') {
            normalized.pop();
        } else if (part !== '.') {
            normalized.push(part);
        }
    }
    
    return normalized.join('/');
}

/**
 * Get the directory part of a file path
 */
export function getDirectory(filePath: string): string {
    return filePath.split('/').slice(0, -1).join('/');
}

/**
 * Get the filename part of a file path (without extension)
 */
export function getFilename(filePath: string): string {
    return filePath.split('/').pop()?.replace(/\.(ts|tsx|js|jsx)$/, '') || '';
}

/**
 * Get the file extension
 */
export function getExtension(filePath: string): string {
    const match = filePath.match(/\.(ts|tsx|js|jsx)$/);
    return match ? match[1] : '';
}