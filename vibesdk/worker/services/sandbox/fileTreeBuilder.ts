import type { FileTreeNode } from './sandboxTypes';

export class FileTreeBuilder {
    /**
     * Default directories to exclude from file trees
     */
    static readonly DEFAULT_EXCLUDED_DIRS = [
        '.github',
        'node_modules',
        '.git',
        'dist',
        '.wrangler',
        '.vscode',
        '.next',
        '.cache',
        '.idea',
        '.DS_Store',
        'build',
        'out',
        'coverage'
    ];

    /**
     * Default file patterns to exclude from file trees
     */
    static readonly DEFAULT_EXCLUDED_FILES = [
        '*.jpg',
        '*.jpeg',
        '*.png',
        '*.gif',
        '*.svg',
        '*.ico',
        '*.webp',
        '*.bmp',
        '*.pdf',
        '*.zip',
        '*.tar',
        '*.gz'
    ];

    /**
     * Build a hierarchical file tree from a flat list of file paths
     * @param filePaths - Array of file paths (e.g., ['src/App.tsx', 'package.json'])
     * @param options - Optional configuration
     * @returns Root node of the file tree
     */
    static buildFromPaths(
        filePaths: string[],
        options?: {
            excludeDirs?: string[];
            excludeFiles?: string[];
            rootPath?: string;
        }
    ): FileTreeNode {
        // Input validation
        if (!Array.isArray(filePaths)) {
            throw new TypeError('filePaths must be an array');
        }

        // Handle empty input
        if (filePaths.length === 0) {
            return {
                path: options?.rootPath || '',
                type: 'directory',
                children: []
            };
        }

        const excludeDirs = new Set(options?.excludeDirs || this.DEFAULT_EXCLUDED_DIRS);
        const excludeFilePatterns = options?.excludeFiles || this.DEFAULT_EXCLUDED_FILES;
        const rootPath = options?.rootPath || '';

        // Convert patterns to regex with proper escaping
        const fileExcludeRegexes = excludeFilePatterns.map(pattern => {
            const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
            return new RegExp('^' + escaped + '$');
        });

        // Normalize and filter paths based on exclusions
        const normalizedPaths = filePaths
            .map(path => path.startsWith('./') ? path.substring(2) : path)
            .filter(path => path.length > 0); // Remove empty paths

        const filteredPaths = normalizedPaths.filter(normalizedPath => {
            const parts = normalizedPath.split('/');

            // Check if any part is an excluded directory
            if (parts.some(part => excludeDirs.has(part))) {
                return false;
            }

            // Check if filename matches excluded patterns
            const filename = parts[parts.length - 1];
            if (filename && fileExcludeRegexes.some(regex => regex.test(filename))) {
                return false;
            }

            return true;
        });

        // Handle case where all paths were filtered out
        if (filteredPaths.length === 0) {
            return {
                path: rootPath,
                type: 'directory',
                children: []
            };
        }

        // Track which paths are files (original filtered paths)
        const fileSet = new Set(filteredPaths);

        // Collect all unique paths including parent directories
        const allPaths = new Set<string>();
        filteredPaths.forEach(filePath => {
            const parts = filePath.split('/').filter(p => p.length > 0);
            
            // Add the file itself
            allPaths.add(filePath);
            
            // Add all parent directories
            for (let i = 1; i < parts.length; i++) {
                const dirPath = parts.slice(0, i).join('/');
                allPaths.add(dirPath);
            }
        });

        // Use the consolidated internal method
        return this.buildFromPathsWithTypes(Array.from(allPaths), fileSet, rootPath);
    }

    /**
     * Build a file tree from TemplateFile objects
     * @param files - Array of template files with filePath and fileContents
     * @param options - Optional configuration
     * @returns Root node of the file tree
     */
    static buildFromTemplateFiles<T extends { filePath: string }>(
        files: T[],
        options?: {
            excludeDirs?: string[];
            excludeFiles?: string[];
            rootPath?: string;
        }
    ): FileTreeNode {
        const filePaths = files.map(f => f.filePath);
        return this.buildFromPaths(filePaths, options);
    }

    /**
     * Generate find command exclusions for sandbox execution
     * Used when building file trees from sandbox filesystem
     */
    static generateFindExclusions(options?: {
        excludeDirs?: string[];
        excludeFiles?: string[];
    }): {
        dirExclusions: string;
        fileExclusions: string;
    } {
        const excludeDirs = options?.excludeDirs || this.DEFAULT_EXCLUDED_DIRS;
        const excludeFiles = options?.excludeFiles || this.DEFAULT_EXCLUDED_FILES;

        const dirExclusions = excludeDirs.map(dir => `-name "${dir}"`).join(' -o ');
        const fileExclusions = excludeFiles.map(ext => `-not -name "${ext}"`).join(' ');

        return {
            dirExclusions,
            fileExclusions
        };
    }

    /**
     * Parse sandbox find command output and build tree
     * Delegates to buildFromPathsWithTypes after parsing
     * @param findOutput - Raw output from sandbox find command
     * @returns Root node of the file tree, or undefined if parsing fails
     */
    static buildFromFindOutput(findOutput: string): FileTreeNode | undefined {
        // Validate input
        if (!findOutput || typeof findOutput !== 'string') {
            console.error('Invalid find output: must be a non-empty string');
            return undefined;
        }

        try {
            const sections = findOutput.split('===DIRS===');
            if (sections.length < 2) {
                console.error('Invalid find output format: missing ===DIRS=== separator');
                return undefined;
            }

            const fileSection = sections[0].replace('===FILES===', '').trim();
            const dirSection = sections[1].trim();
            
            const files = fileSection
                .split('\n')
                .filter(line => line.trim().length > 0 && line.trim() !== '.')
                .map(f => f.startsWith('./') ? f.substring(2) : f)
                .filter(f => f.length > 0);
            
            const dirs = dirSection
                .split('\n')
                .filter(line => line.trim().length > 0 && line.trim() !== '.')
                .map(d => d.startsWith('./') ? d.substring(2) : d)
                .filter(d => d.length > 0);
            
            // Combine all paths (files are explicitly marked)
            const allPaths = [...files, ...dirs].filter(path => path.length > 0);
            
            // Handle empty output
            if (allPaths.length === 0) {
                return {
                    path: '',
                    type: 'directory',
                    children: []
                };
            }
            
            // Use the consolidated internal method with explicit file marking
            return this.buildFromPathsWithTypes(allPaths, new Set(files), '');
        } catch (error) {
            console.error('Failed to parse find output:', error instanceof Error ? error.message : error);
            return undefined;
        }
    }

    /**
     * Internal method: Build tree from paths with explicit file/dir marking
     * This is the single source of truth for tree construction
     * @param paths - All paths (files and directories)
     * @param filePaths - Set of paths that are files (not directories)
     * @param rootPath - Path for the root node (default: '')
     * @returns Root node of the file tree
     */
    private static buildFromPathsWithTypes(
        paths: string[],
        filePaths: Set<string>,
        rootPath: string = ''
    ): FileTreeNode {
        // Create root node
        const root: FileTreeNode = {
            path: rootPath,
            type: 'directory',
            children: []
        };

        // Handle empty paths
        if (paths.length === 0) {
            return root;
        }

        // Sort paths for consistent tree building (copy to avoid mutation)
        const sortedPaths = [...paths].sort();

        // Build tree structure
        sortedPaths.forEach(filePath => {
            // Skip empty paths
            if (!filePath) {
                return;
            }

            const parts = filePath.split('/').filter(part => part.length > 0);
            
            // Skip if no valid parts
            if (parts.length === 0) {
                return;
            }

            let current = root;

            parts.forEach((_, index) => {
                const pathSoFar = parts.slice(0, index + 1).join('/');
                const isFile = filePaths.has(pathSoFar);
                
                // Find existing child or create new one
                let child = current.children?.find(c => c.path === pathSoFar);
                
                if (!child) {
                    child = {
                        path: pathSoFar,
                        type: isFile ? 'file' : 'directory',
                        children: isFile ? undefined : []
                    };
                    
                    // Ensure children array exists
                    if (!current.children) {
                        current.children = [];
                    }
                    
                    current.children.push(child);
                }
                
                // Navigate to child if it's a directory
                if (!isFile && child.children) {
                    current = child;
                }
            });
        });

        return root;
    }
}
