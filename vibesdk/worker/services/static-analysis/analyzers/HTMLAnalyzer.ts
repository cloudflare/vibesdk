import { Parser } from 'htmlparser2';
import type { LanguageAnalyzer, FileInput, CodeIssue } from '../types';

export class HTMLAnalyzer implements LanguageAnalyzer {
	readonly supportedExtensions = ['.html', '.htm'];

	analyze(file: FileInput): CodeIssue[] {
		const issues: CodeIssue[] = [];
		const tagStack: Array<{ name: string; line: number }> = [];
		let currentLine = 1;

		const selfClosingTags = new Set([
			'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input',
			'link', 'meta', 'param', 'source', 'track', 'wbr',
		]);

		const parser = new Parser(
			{
				onopentag: (name: string, _attribs: Record<string, string>) => {
					if (!selfClosingTags.has(name.toLowerCase())) {
						tagStack.push({ name: name.toLowerCase(), line: currentLine });
					}
				},
				onclosetag: (name: string) => {
					const lowerName = name.toLowerCase();
					if (selfClosingTags.has(lowerName)) return;

					if (tagStack.length === 0) {
						issues.push({
							message: `Unexpected closing tag </${name}>`,
							filePath: file.path,
							line: currentLine,
							column: 0,
							severity: 'error',
							ruleId: 'HTML_UNEXPECTED_CLOSE',
							source: 'htmlparser2',
						});
						return;
					}

					const lastTag = tagStack[tagStack.length - 1];
					if (lastTag.name !== lowerName) {
						issues.push({
							message: `Mismatched closing tag: expected </${lastTag.name}>, found </${name}>`,
							filePath: file.path,
							line: currentLine,
							column: 0,
							severity: 'error',
							ruleId: 'HTML_TAG_MISMATCH',
							source: 'htmlparser2',
						});
					} else {
						tagStack.pop();
					}
				},
				ontext: (text: string) => {
					currentLine += (text.match(/\n/g) || []).length;
				},
			},
			{
				lowerCaseTags: false,
				lowerCaseAttributeNames: false,
			}
		);

		try {
			parser.write(file.content);
			parser.end();
		} catch (error) {
			if (error instanceof Error) {
				issues.push({
					message: error.message,
					filePath: file.path,
					line: 1,
					column: 0,
					severity: 'error',
					ruleId: 'HTML_PARSE_ERROR',
					source: 'htmlparser2',
				});
			}
		}

		// Check for unclosed tags
		for (const tag of tagStack) {
			issues.push({
				message: `Unclosed tag <${tag.name}>`,
				filePath: file.path,
				line: tag.line,
				column: 0,
				severity: 'error',
				ruleId: 'HTML_UNCLOSED_TAG',
				source: 'htmlparser2',
			});
		}

		return issues;
	}
}
