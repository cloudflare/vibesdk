import { FileGenerationOutputType, FileOutputType, PhaseConceptType } from '../../schemas';
import type { StructuredLogger } from '../../../logger';
import { TemplateDetails } from '../../../services/sandbox/sandboxTypes';
import { applyUnifiedDiff } from '../../output-formats/diff-formats';
import { FileState } from 'worker/agents/core/state';
import { getTemplateFiles, getTemplateImportantFiles } from 'worker/services/sandbox/utils';

/**
 * File processing utilities
 * Handles content cleaning, diff application, and file metadata
 */
export class FileProcessing {
    /**
     * Remove code block markers from file contents
     */
    static cleanFileContents(fileContents: string): string {
        let cleanedContents = fileContents;
        
        if (fileContents.startsWith('```')) {
            // Ignore the first line if it starts with ```
            cleanedContents = fileContents.split('\n').slice(1).join('\n');
        }

        if (cleanedContents.endsWith('```')) {
            // Ignore the last line if it ends with ```
            cleanedContents = cleanedContents.split('\n').slice(0, -1).join('\n');
        }

        return cleanedContents;
    }

    /**
     * Process generated file contents
     * Applies diffs or returns cleaned content
     */
    static processGeneratedFileContents(
        generatedFile: FileGenerationOutputType,
        originalContents: string,
        logger?: Pick<StructuredLogger, 'info' | 'warn' | 'error'>
    ): string {
        const cleanedContents = FileProcessing.cleanFileContents(generatedFile.fileContents);
        
        // File contents can either be raw or in unified diff format
        if (generatedFile.format === 'unified_diff') {
            logger?.info(`Applying unified diff to file: ${generatedFile.filePath}`);
            
            if (originalContents) {
                logger?.info(`Valid file contents found for ${generatedFile.filePath}, applying diff`);
            } else {
                logger?.warn(`No valid file contents found for ${generatedFile.filePath}, but diff was generated`);
            }
            
            logger?.info(`Diff for ${generatedFile.filePath}: `, cleanedContents);
            
            try {
                return applyUnifiedDiff(originalContents, cleanedContents);
            } catch (error) {
                logger?.error(`Error applying diff to file ${generatedFile.filePath}:`, error);
                return originalContents;
            }
        }
        
        logger?.info(`Setting file contents to cleaned contents ${generatedFile.filePath}`);
        return cleanedContents;
    }

    /**
     * Find file purpose from phase or generated files
     */
    static findFilePurpose(
        filePath: string, 
        phase: PhaseConceptType,
        generatedFilesMap: Record<string, FileOutputType>
    ): string {
        // First search in the current phase
        const phaseFile = phase.files.find(file => file.path === filePath);
        if (phaseFile?.purpose) {
            return phaseFile.purpose;
        }
        
        // Then search in previously generated files
        const generatedFile = generatedFilesMap[filePath];
        if (generatedFile) {
            return generatedFile.filePurpose;
        }
        
        return "";
    }

    /**
     * Get all relevant files combining template (important) and generated files
     * Template files are overridden by generated files with same path
     */
    static getAllRelevantFiles(
        templateDetails: TemplateDetails | undefined,
        generatedFilesMap: Record<string, FileState>
    ): FileState[] {
        return this.getAllFiles(templateDetails, generatedFilesMap, true);
    }

    static getAllFiles(
        templateDetails: TemplateDetails | undefined,
        generatedFilesMap: Record<string, FileState>,
        onlyImportantFiles: boolean = false
    ): FileState[] {
        const templateFiles = templateDetails?.allFiles ? (onlyImportantFiles ? getTemplateImportantFiles(templateDetails) : getTemplateFiles(templateDetails)) : [];
        
        // Filter out template files that have been overridden by generated files
        const nonOverriddenTemplateFiles = templateFiles.filter(
            file => !generatedFilesMap[file.filePath]
        );
        
        return [
            ...nonOverriddenTemplateFiles.map(file => ({
                ...file,
                filePurpose: 'Boilerplate template file',
                lastDiff: '',
                lastmodified: Date.now(),
                unmerged: [],
                lasthash: '',
            })),
            ...Object.values(generatedFilesMap)
        ];
    }
}