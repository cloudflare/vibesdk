import { TemplateDetails, TemplateFile } from "./sandboxTypes";

export function getTemplateImportantFiles(templateDetails: TemplateDetails, filterRedacted: boolean = true): TemplateFile[] {
    const { importantFiles, allFiles, redactedFiles } = templateDetails;

    const result: TemplateFile[] = [];
    for (const [filePath, fileContents] of Object.entries(allFiles)) {
        let isImportant = false;
        for (const pattern of importantFiles) {
            if (filePath === pattern || filePath.startsWith(pattern)) {
                isImportant = true;
                break;
            }
        }

        if (isImportant) {
            const contents = filterRedacted && redactedFiles.has(filePath) ? 'REDACTED' : fileContents;
            if (contents) result.push({ filePath, fileContents: contents });
        }
    }

    return result;
}

export function getTemplateFiles(templateDetails: TemplateDetails): TemplateFile[] {
    return Object.entries(templateDetails.allFiles).map(([filePath, fileContents]) => ({
        filePath,
        fileContents,
    }));
}

export function isFileModifiable(filePath: string, dontTouchFiles: Set<string>): { allowed: boolean; reason?: string } {
    const normalized = filePath.replace(/^\/+/, '');

    for (const pattern of dontTouchFiles) {
        if (normalized === pattern || normalized.startsWith(pattern)) {
            return { allowed: false, reason: `File is protected: ${pattern}` };
        }
    }

    return { allowed: true };
}