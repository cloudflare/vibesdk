import * as Diff from 'diff';
import { IFileManager } from '../interfaces/IFileManager';
import { IStateManager } from '../interfaces/IStateManager';
import { FileOutputType } from '../../schemas';
import { FileProcessing } from '../../domain/pure/FileProcessing';
import { FileState } from 'worker/agents/core/state';
import { TemplateDetails } from '../../../services/sandbox/sandboxTypes';
import { GitVersionControl } from 'worker/agents/git';

/**
 * Manages file operations for code generation
 * Handles both template and generated files
 */
export class FileManager implements IFileManager {
    constructor(
        private stateManager: IStateManager,
        private getTemplateDetailsFunc: () => TemplateDetails,
        private git: GitVersionControl
    ) {}

    getGeneratedFile(path: string): FileOutputType | null {
        const state = this.stateManager.getState();
        return state.generatedFilesMap[path] || null;
    }

    /**
     * Get all files combining template and generated files
     * Template files are overridden by generated files with same path
     * @returns Array of all files. Only returns important template files, not all!
     */
    getAllRelevantFiles(): FileOutputType[] {
        const state = this.stateManager.getState();
        return FileProcessing.getAllRelevantFiles(this.getTemplateDetailsFunc(), state.generatedFilesMap);
    }

    getAllFiles(): FileOutputType[] {
        const state = this.stateManager.getState();
        return FileProcessing.getAllFiles(this.getTemplateDetailsFunc(), state.generatedFilesMap);
    }

    saveGeneratedFile(file: FileOutputType, commitMessage: string): FileState {
        return this.saveGeneratedFiles([file], commitMessage)[0];
    }

    saveGeneratedFiles(files: FileOutputType[], commitMessage: string): FileState[] {
        const filesMap = { ...this.stateManager.getState().generatedFilesMap };
        const fileStates: FileState[] = [];
        
        for (const file of files) {
            let lastDiff = '';
            const oldFile = filesMap[file.filePath];
            
            // Get comparison base: from generatedFilesMap, template/filesystem, or empty string for new files
            // TODO: fix checking against template files
            const oldFileContents = oldFile?.fileContents ?? (this.getGeneratedFile(file.filePath)?.fileContents || '');
            
            // Generate diff if contents changed
            if (oldFileContents !== file.fileContents) {
                try {
                    lastDiff = Diff.createPatch(file.filePath, oldFileContents, file.fileContents);
                    if (lastDiff) {
                        const isNewFile = oldFileContents === '';
                        console.log(`Generated diff for ${isNewFile ? 'new' : ''} file ${file.filePath}:`, lastDiff);
                    }
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

        try {
            this.git.commit(fileStates, commitMessage);
        } catch (error) {
            console.error(`Failed to commit files:`, error, commitMessage);
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
        return !!this.getGeneratedFile(path)
    }

    getGeneratedFilePaths(): string[] {
        const state = this.stateManager.getState();
        return Object.keys(state.generatedFilesMap);
    }

    getGeneratedFilesMap(): Record<string, FileOutputType> {
        const state = this.stateManager.getState();
        return state.generatedFilesMap;
    }

    getGeneratedFiles(): FileOutputType[] {
        const state = this.stateManager.getState();
        return Object.values(state.generatedFilesMap);
    }

    getTemplateFile(filePath: string) : FileOutputType | null {
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