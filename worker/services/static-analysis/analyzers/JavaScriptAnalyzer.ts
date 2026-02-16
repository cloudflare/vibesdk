import * as acorn from 'acorn';
import type { LanguageAnalyzer, FileInput, CodeIssue } from '../types';

export class JavaScriptAnalyzer implements LanguageAnalyzer {
	readonly supportedExtensions = ['.js', '.mjs'];

	analyze(file: FileInput): CodeIssue[] {
		const issues: CodeIssue[] = [];

		try {
			acorn.parse(file.content, {
				ecmaVersion: 'latest',
				sourceType: 'module',
				locations: true,
			});
		} catch (error: unknown) {
			if (error instanceof SyntaxError) {
				const acornError = error as SyntaxError & { loc?: { line: number; column: number } };
				issues.push({
					message: acornError.message,
					filePath: file.path,
					line: acornError.loc?.line ?? 1,
					column: acornError.loc?.column ?? 0,
					severity: 'error',
					ruleId: 'JS_SYNTAX_ERROR',
					source: 'acorn',
				});
			} else if (error instanceof Error) {
				issues.push({
					message: error.message,
					filePath: file.path,
					line: 1,
					column: 0,
					severity: 'error',
					ruleId: 'JS_PARSE_ERROR',
					source: 'acorn',
				});
			}
		}

		return issues;
	}
}
