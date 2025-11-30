import { TemplateDetails, TemplateFile } from "./sandboxTypes";

export function getTemplateImportantFiles(templateDetails: TemplateDetails, filterRedacted: boolean = true): TemplateFile[] {
    const { importantFiles, allFiles, redactedFiles } = templateDetails;

    const redactedSet = new Set(redactedFiles);
    const importantSet = new Set(importantFiles);

    const result: TemplateFile[] = [];

    for (const [filePath, fileContents] of Object.entries(allFiles)) {
        const isExactMatch = importantSet.has(filePath);
        const isMatch = isExactMatch || importantFiles.some(pattern => filePath.startsWith(pattern));

        if (isMatch) {
            const isRedacted = filterRedacted && redactedSet.has(filePath);
            const contents = isRedacted ? 'REDACTED' : fileContents;
            if (contents) {
                result.push({ filePath, fileContents: contents });
            }
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

export function isFileModifiable(filePath: string, dontTouchFiles: string[]): { allowed: boolean; reason?: string } {
    const normalized = filePath.replace(/^\/+/, '');

    for (const pattern of dontTouchFiles) {
        if (normalized === pattern || normalized.startsWith(pattern)) {
            return { allowed: false, reason: `File is protected: ${pattern}` };
        }
    }

    return { allowed: true };
}