import * as Diff from 'diff';
import { IFileManager } from '../interfaces/IFileManager';
import { IStateManager } from '../interfaces/IStateManager';
import { FileOutputType } from '../../schemas';
import { FileProcessing } from '../../domain/pure/FileProcessing';
import { BaseProjectState, FileState } from 'worker/agents/core/state';
import { TemplateDetails } from '../../../services/sandbox/sandboxTypes';
import { GitVersionControl } from 'worker/agents/git';
import { isFileModifiable } from '../../../services/sandbox/utils';

/**
 * Manages file operations for code generation
 * Handles both template and generated files
 */
export class FileManager implements IFileManager {
    constructor(
        private stateManager: IStateManager<BaseProjectState>,
        private getTemplateDetailsFunc: () => TemplateDetails,
        private git: GitVersionControl
    ) {
        // Register callback with git to auto-sync after operations
        this.git.setOnFilesChangedCallback(() => {
            this.syncGeneratedFilesMapFromGit();
        });
    }

    /**
     * Sync generatedFilesMap from git HEAD
     * TODO: Remove in the future by making git fs the single source of truth
     */
    async syncGeneratedFilesMapFromGit(): Promise<void> {
        console.log('[FileManager] Auto-syncing generatedFilesMap from git HEAD');
        
        try {
            // Get all files from HEAD commit
            const gitFiles = await this.git.getAllFilesFromHead();
            
            // Get old map to preserve purposes
            const oldMap = this.stateManager.getState().generatedFilesMap;
            
            // Build new map, preserving existing purposes
            const newMap: Record<string, FileState> = {};
            
            for (const file of gitFiles) {
                const existing = oldMap[file.filePath];
                
                newMap[file.filePath] = {
                    filePath: file.filePath,
                    fileContents: file.fileContents,
                    filePurpose: existing?.filePurpose || 'Generated file',
                    lastDiff: ''
                };
            }
            
            // Update state
            this.stateManager.setState({
                ...this.stateManager.getState(),
                generatedFilesMap: newMap
            });
            
            console.log('[FileManager] Sync complete', {
                filesCount: Object.keys(newMap).length,
                preservedPurposes: Object.values(newMap).filter(f => oldMap[f.filePath]?.filePurpose).length
            });
        } catch (error) {
            console.error('[FileManager] Failed to sync from git:', error);
            // Don't throw - keep existing state as fallback
        }
    }

    getGeneratedFile(path: string): FileState | null {
        const state = this.stateManager.getState();
        return state.generatedFilesMap[path] || null;
    }

    /**
     * Get all files combining template and generated files
     * Template files are overridden by generated files with same path
     * @returns Array of all files. Only returns important template files, not all!
     */
    getAllRelevantFiles(): FileState[] {
        const state = this.stateManager.getState();
        return FileProcessing.getAllRelevantFiles(this.getTemplateDetailsFunc(), state.generatedFilesMap);
    }

    getAllFiles(): FileState[] {
        const state = this.stateManager.getState();
        return FileProcessing.getAllFiles(this.getTemplateDetailsFunc(), state.generatedFilesMap);
    }

    async saveGeneratedFile(file: FileOutputType, commitMessage?: string, overwrite: boolean = false): Promise<FileState> {
        const results = await this.saveGeneratedFiles([file], commitMessage, overwrite);
        return results[0];
    }

    /**
     * Record file changes to state (synchronous).
     * Updates generatedFilesMap and computes diffs, but does NOT touch git.
     * Use commitFiles() to persist recorded files to git.
     */
    recordFileChanges(files: FileOutputType[], overwrite: boolean = false): FileState[] {
        const templateDetails = this.getTemplateDetailsFunc();
        const dontTouchFiles = templateDetails?.dontTouchFiles || new Set<string>();

        const filesMap = { ...this.stateManager.getState().generatedFilesMap };
        const fileStates: FileState[] = [];

        for (const file of files) {
            if (!isFileModifiable(file.filePath, dontTouchFiles).allowed && !overwrite) {
                console.warn(`[FileManager] Skipping protected file ${file.filePath}`);
                continue;
            }
            let lastDiff = '';
            const oldFile = filesMap[file.filePath];
            
            // Get comparison base: from generatedFilesMap, template/filesystem, or empty string for new files
            const oldFileContents = oldFile?.fileContents ?? (this.getFile(file.filePath)?.fileContents || '');
            
            // Generate diff if contents changed
            if (oldFileContents !== file.fileContents) {
                try {
                    lastDiff = Diff.createPatch(file.filePath, oldFileContents, file.fileContents);
                } catch (error) {
                    console.error(`Failed to generate diff for file ${file.filePath}:`, error);
                }
            }
            
            const fileState = {
                ...file,
                lasthash: '',
                lastmodified: Date.now(),
                unmerged: [],
                lastDiff
            }
            filesMap[file.filePath] = fileState;
            fileStates.push(fileState);
        }
        
        this.stateManager.setState({
            ...this.stateManager.getState(),
            generatedFilesMap: filesMap
        });

        return fileStates;
    }

    /**
     * Save and optionally commit files to git.
     * - With files: records them to state, then commits if commitMessage provided
     * - With empty array + commitMessage: commits ALL pending changes from state
     */
    async saveGeneratedFiles(files: FileOutputType[], commitMessage?: string, overwrite: boolean = false): Promise<FileState[]> {
        // Empty array + commit message = commit all pending changes
        const fileStates = files.length === 0
            ? Object.values(this.stateManager.getState().generatedFilesMap)
            : this.recordFileChanges(files, overwrite);

        try {
            if (commitMessage) {
                const unescapedMessage = commitMessage.replace(/\\n/g, '\n').replace(/\\t/g, '\t');
                console.log(`[FileManager] Committing ${fileStates.length} files:`, unescapedMessage);
                await this.git.commit(fileStates, unescapedMessage);
                console.log(`[FileManager] Commit successful`);
            } else if (fileStates.length > 0 && fileStates.some(f => f.lastDiff !== '')) {
                console.log(`[FileManager] Staging ${fileStates.length} files`);
                await this.git.stage(fileStates);
                console.log(`[FileManager] Stage successful`);
            }
        } catch (error) {
            console.error(`[FileManager] Failed to commit files:`, error, commitMessage);
        }
        return fileStates;
    }

    deleteFiles(filePaths: string[]): void {
        const newFilesMap = { ...this.stateManager.getState().generatedFilesMap };
        
        for (const filePath of filePaths) {
            delete newFilesMap[filePath];
        }
        
        this.stateManager.setState({
            ...this.stateManager.getState(),
            generatedFilesMap: newFilesMap
        });
    }

    fileExists(path: string): boolean {
        return !!this.getFile(path)
    }

    getGeneratedFilePaths(): string[] {
        const state = this.stateManager.getState();
        return Object.keys(state.generatedFilesMap);
    }

    getGeneratedFilesMap(): Record<string, FileState> {
        const state = this.stateManager.getState();
        return state.generatedFilesMap;
    }

    getGeneratedFiles(): FileState[] {
        const state = this.stateManager.getState();
        return Object.values(state.generatedFilesMap);
    }

    getTemplateFile(filePath: string) : FileOutputType | null {
        try {
            const templateDetails = this.getTemplateDetailsFunc();
            const fileContents = templateDetails.allFiles[filePath];
            if (!fileContents) {
                return null;
            }
            return {
                filePath,
                fileContents,
                filePurpose: 'Bootstrapped template file',
            }
        } catch (error) {
            console.error(`[FileManager] Failed to get template file:`, error, filePath);
            return null;
        }
    }

    getFile(filePath: string) : FileOutputType | null {
        // First search generated files
        const generatedFile = this.getGeneratedFile(filePath);
        if (generatedFile) {
            return generatedFile;
        }
        // Then search template files
        return this.getTemplateFile(filePath);
    }
}