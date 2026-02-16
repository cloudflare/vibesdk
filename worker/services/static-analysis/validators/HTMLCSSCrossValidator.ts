import { Parser } from 'htmlparser2';
import type { CrossFileValidator, FileInput, CodeIssue } from '../types';

interface CSSUsage {
	name: string;
	type: 'class' | 'id';
	filePath: string;
	line: number;
}

const DYNAMIC_CLASS_PATTERNS = [
	/^{{.*}}$/,
	/^<%.*%>$/,
	/^\$\{.*\}$/,
	/^\[.*\]$/,
	/^:.*$/,
	/^v-/,
	/^ng-/,
	/^x-/,
];

const UTILITY_FRAMEWORK_PATTERNS = [
	/^-?[mpwh][trblxy]?-/,
	/^(flex|grid|block|inline|hidden|visible|absolute|relative|fixed|sticky)/,
	/^(text|bg|border|rounded|shadow|opacity|z)-/,
	/^(sm|md|lg|xl|2xl):/,
	/^(hover|focus|active|disabled|dark):/,
	/^(justify|items|content|self)-/,
	/^(gap|space)-/,
	/^(font|leading|tracking)-/,
	/^(overflow|cursor|pointer|transition|duration|ease)-/,
];

function isLikelyDynamicOrFrameworkClass(className: string): boolean {
	for (const pattern of DYNAMIC_CLASS_PATTERNS) {
		if (pattern.test(className)) return true;
	}
	for (const pattern of UTILITY_FRAMEWORK_PATTERNS) {
		if (pattern.test(className)) return true;
	}
	return false;
}

export class HTMLCSSCrossValidator implements CrossFileValidator {
	validate(files: FileInput[]): CodeIssue[] {
		const definedClasses = new Set<string>();
		const definedIds = new Set<string>();
		const usedSelectors: CSSUsage[] = [];

		// Extract CSS definitions from .css files and inline <style> tags
		for (const file of files) {
			if (file.path.endsWith('.css')) {
				this.extractCSSDefinitions(file.content, definedClasses, definedIds);
			}
			if (file.path.endsWith('.html') || file.path.endsWith('.htm')) {
				this.extractInlineStyles(file.content, definedClasses, definedIds);
			}
		}

		// Extract CSS usage from HTML files
		for (const file of files) {
			if (file.path.endsWith('.html') || file.path.endsWith('.htm')) {
				const usage = this.extractHTMLUsage(file);
				usedSelectors.push(...usage);
			}
		}

		// Find undefined selectors
		const issues: CodeIssue[] = [];
		for (const usage of usedSelectors) {
			if (usage.type === 'class' && !definedClasses.has(usage.name)) {
				if (isLikelyDynamicOrFrameworkClass(usage.name)) continue;
				issues.push({
					message: `CSS class "${usage.name}" is used but not defined in any CSS file`,
					filePath: usage.filePath,
					line: usage.line,
					column: 0,
					severity: 'warning',
					ruleId: 'CSS_CLASS_UNDEFINED',
					source: 'html-css-validator',
				});
			}
			if (usage.type === 'id' && !definedIds.has(usage.name)) {
				issues.push({
					message: `CSS ID "${usage.name}" is used but not defined in any CSS file`,
					filePath: usage.filePath,
					line: usage.line,
					column: 0,
					severity: 'warning',
					ruleId: 'CSS_ID_UNDEFINED',
					source: 'html-css-validator',
				});
			}
		}

		return issues;
	}

	private extractCSSDefinitions(
		content: string,
		classes: Set<string>,
		ids: Set<string>
	): void {
		// Strip comments
		let cleaned = content.replace(/\/\*[\s\S]*?\*\//g, '');

		// Strip url(...) values to avoid matching dots in URLs
		cleaned = cleaned.replace(/url\s*\([^)]*\)/gi, '');

		// Extract only selector portions (text before each {)
		const selectorBlocks: string[] = [];
		let depth = 0;
		let currentSelector = '';

		for (let i = 0; i < cleaned.length; i++) {
			const char = cleaned[i];
			if (char === '{') {
				if (depth === 0) {
					selectorBlocks.push(currentSelector);
					currentSelector = '';
				}
				depth++;
			} else if (char === '}') {
				depth--;
			} else if (depth === 0) {
				currentSelector += char;
			}
		}

		// Parse selectors from the extracted selector blocks
		const selectorText = selectorBlocks.join(' ');

		// Match class selectors: .classname (must start with letter, underscore, or hyphen)
		const classRegex = /\.([a-zA-Z_][a-zA-Z0-9_-]*)/g;
		let match;
		while ((match = classRegex.exec(selectorText)) !== null) {
			classes.add(match[1]);
		}

		// Match ID selectors: #idname (must start with letter or underscore, not digit)
		const idRegex = /#([a-zA-Z_][a-zA-Z0-9_-]*)/g;
		while ((match = idRegex.exec(selectorText)) !== null) {
			ids.add(match[1]);
		}
	}

	private extractInlineStyles(
		htmlContent: string,
		classes: Set<string>,
		ids: Set<string>
	): void {
		// Extract content from <style> tags
		const styleRegex = /<style[^>]*>([\s\S]*?)<\/style>/gi;
		let match;
		while ((match = styleRegex.exec(htmlContent)) !== null) {
			this.extractCSSDefinitions(match[1], classes, ids);
		}
	}

	private extractHTMLUsage(file: FileInput): CSSUsage[] {
		const usage: CSSUsage[] = [];
		let currentLine = 1;

		const parser = new Parser(
			{
				onopentag: (_name: string, attribs: Record<string, string>) => {
					// Extract class usage
					if (attribs.class) {
						const classNames = attribs.class.split(/\s+/).filter(Boolean);
						for (const className of classNames) {
							usage.push({
								name: className,
								type: 'class',
								filePath: file.path,
								line: currentLine,
							});
						}
					}

					// Extract id usage
					if (attribs.id) {
						usage.push({
							name: attribs.id,
							type: 'id',
							filePath: file.path,
							line: currentLine,
						});
					}
				},
				ontext: (text: string) => {
					currentLine += (text.match(/\n/g) || []).length;
				},
			},
			{
				lowerCaseTags: false,
				lowerCaseAttributeNames: true,
			}
		);

		try {
			parser.write(file.content);
			parser.end();
		} catch {
			// Ignore parse errors - HTMLAnalyzer will catch them
		}

		return usage;
	}
}
