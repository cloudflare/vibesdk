import type { LanguageAnalyzer, FileInput, CodeIssue } from '../types';

export class CSSAnalyzer implements LanguageAnalyzer {
	readonly supportedExtensions = ['.css'];

	analyze(file: FileInput): CodeIssue[] {
		const issues: CodeIssue[] = [];
		const content = file.content;
		const lines = content.split('\n');

		let braceCount = 0;
		let inString = false;
		let stringChar = '';
		let inComment = false;

		for (let lineNum = 0; lineNum < lines.length; lineNum++) {
			const line = lines[lineNum];

			for (let i = 0; i < line.length; i++) {
				const char = line[i];
				const nextChar = line[i + 1];

				// Handle comments
				if (!inString && !inComment && char === '/' && nextChar === '*') {
					inComment = true;
					i++;
					continue;
				}
				if (inComment && char === '*' && nextChar === '/') {
					inComment = false;
					i++;
					continue;
				}
				if (inComment) continue;

				// Handle strings
				if (!inString && (char === '"' || char === "'")) {
					inString = true;
					stringChar = char;
					continue;
				}
				if (inString && char === stringChar && line[i - 1] !== '\\') {
					inString = false;
					continue;
				}
				if (inString) continue;

				// Count braces
				if (char === '{') braceCount++;
				if (char === '}') braceCount--;

				if (braceCount < 0) {
					issues.push({
						message: 'Unexpected closing brace',
						filePath: file.path,
						line: lineNum + 1,
						column: i,
						severity: 'error',
						ruleId: 'CSS_UNEXPECTED_BRACE',
						source: 'css-analyzer',
					});
					braceCount = 0;
				}
			}
		}

		if (braceCount > 0) {
			issues.push({
				message: `Unclosed brace: ${braceCount} opening brace(s) without matching close`,
				filePath: file.path,
				line: lines.length,
				column: 0,
				severity: 'error',
				ruleId: 'CSS_UNCLOSED_BRACE',
				source: 'css-analyzer',
			});
		}

		if (inComment) {
			issues.push({
				message: 'Unclosed comment',
				filePath: file.path,
				line: lines.length,
				column: 0,
				severity: 'error',
				ruleId: 'CSS_UNCLOSED_COMMENT',
				source: 'css-analyzer',
			});
		}

		if (inString) {
			issues.push({
				message: 'Unclosed string',
				filePath: file.path,
				line: lines.length,
				column: 0,
				severity: 'error',
				ruleId: 'CSS_UNCLOSED_STRING',
				source: 'css-analyzer',
			});
		}

		return issues;
	}
}
