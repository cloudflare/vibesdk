import { SCOFFormat } from '../output-formats/streaming-formats/scof';
import { FileOutputType } from '../schemas';

export enum CodeSerializerType {
	SIMPLE = 'simple',
	SCOF = 'scof',
}

export type CodeSerializer = (files: FileOutputType[]) => string;

function detectLanguage(filePath: string): string {
    const extension = filePath.split('.').pop() ?? '';
    switch (extension) {
        case 'js':
            return 'javascript';
        case 'ts':
            return 'typescript';
        case 'tsx':
            return 'typescript';
        case 'jsx':
            return 'javascript';
        case 'json':
            return 'json';
        case 'html':
            return 'html';
        case 'css':
            return 'css';
        case 'md':
            return 'markdown';
        case 'sh':
            return 'shell';
        default:
            return '';
    }
}

function simpleSerializer(files: FileOutputType[]): string {
	/*
        # File Name: <file name>
        # File Purpose: <file purpose>
        \`\`\`<language>
        <file content>
        \`\`\`
    */
	return files
		.map((file) => {
			return `# File Name: ${file.filePath}\n# File Purpose: ${file.filePurpose}\n\`\`\`${detectLanguage(file.filePath)}\n${file.fileContents}\n\`\`\`\n`;
		})
		.join('\n\n');
}

function scofSerializer(files: FileOutputType[]): string {
	return new SCOFFormat().serialize(
		files.map((file) => {
			return {
				...file,
				format: 'full_content',
			};
		}),
	);
}

export const CODE_SERIALIZERS: Record<CodeSerializerType, CodeSerializer> = {
	[CodeSerializerType.SIMPLE]: simpleSerializer,
	[CodeSerializerType.SCOF]: scofSerializer,
};
