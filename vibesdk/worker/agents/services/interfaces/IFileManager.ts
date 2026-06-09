import { FileOutputType } from '../../schemas';
import { FileState } from '../../core/state';

/**
 * Interface for file management operations
 * Abstracts file storage and retrieval
 */
export interface IFileManager {
    /**
     * Get a generated file by path
     */
    getGeneratedFile(path: string): FileOutputType | null;

    /**
     * Get all relevant files (template (important) + generated)
     */
    getAllRelevantFiles(): FileOutputType[];

    /**
     * Get all files (template (important) + generated)
     */
    getAllFiles(): FileOutputType[];

    /**
     * Save a generated file
     */
    saveGeneratedFile(file: FileOutputType, commitMessage: string): Promise<FileState>;

    /**
     * Save multiple generated files
     */
    saveGeneratedFiles(files: FileOutputType[], commitMessage: string): Promise<FileState[]>;

    /**
     * Delete files from the file manager
     */
    deleteFiles(filePaths: string[]): void;
    /**
     * Check if file exists (template or generated)
     */
    fileExists(path: string): boolean;

    /**
     * Get all generated file paths
     */
    getGeneratedFilePaths(): string[];
    /**
     * Get generated files map
     */
    getGeneratedFilesMap(): Record<string, FileOutputType>;
    
    /**
     * Get generated files
     */
    getGeneratedFiles(): FileOutputType[];

    /**
     * Sync generatedFilesMap from git HEAD
     */
    syncGeneratedFilesMapFromGit(): Promise<void>;
}