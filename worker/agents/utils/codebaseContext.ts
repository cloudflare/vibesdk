import { FileOutputType } from "../schemas";

export function getCodebaseContext(allFiles: FileOutputType[]): FileOutputType[]  {
    // For now, just return all files except readme.md and .bootstrap.js
    allFiles = allFiles.filter(file => {
        const lowerPath = file.filePath.toLowerCase();
        return !lowerPath.endsWith('readme.md') && 
               !lowerPath.endsWith('.bootstrap.js');
    });
    // allFiles = allFiles.map(file => {
    //     // Redact wrangler.jsonc, tsconfig.json, and package.json
    //     const lowerPath = file.filePath.toLowerCase();
    //     if (lowerPath.endsWith('wrangler.jsonc') || 
    //         lowerPath.endsWith('tsconfig.json') || 
    //         lowerPath.endsWith('package.json')) {
    //         file.fileContents = '[REDACTED: configuration file]';
    //     }
    //     return file;
    // });
    return allFiles;
}