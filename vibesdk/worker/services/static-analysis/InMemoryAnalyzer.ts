import type { IStaticAnalyzer, LanguageAnalyzer, CrossFileValidator, FileInput, StaticAnalysisResponse, CodeIssue } from './types';
import { JavaScriptAnalyzer } from './analyzers/JavaScriptAnalyzer';
import { HTMLAnalyzer } from './analyzers/HTMLAnalyzer';
import { CSSAnalyzer } from './analyzers/CSSAnalyzer';
import { HTMLCSSCrossValidator } from './validators/HTMLCSSCrossValidator';

export class InMemoryAnalyzer implements IStaticAnalyzer {
	private analyzers: LanguageAnalyzer[];
	private crossValidators: CrossFileValidator[];

	constructor() {
		this.analyzers = [
			new JavaScriptAnalyzer(),
			new HTMLAnalyzer(),
			new CSSAnalyzer(),
		];
		this.crossValidators = [
			new HTMLCSSCrossValidator(),
		];
	}

	async analyze(files: FileInput[]): Promise<StaticAnalysisResponse> {
		const allIssues: CodeIssue[] = [];

		// Single-file analysis
		for (const file of files) {
			const analyzer = this.getAnalyzerForFile(file.path);
			if (analyzer) {
				const issues = analyzer.analyze(file);
				allIssues.push(...issues);
			}
		}

		// Cross-file validation
		for (const validator of this.crossValidators) {
			const issues = validator.validate(files);
			allIssues.push(...issues);
		}

		return this.buildResponse(allIssues);
	}

	private getAnalyzerForFile(filePath: string): LanguageAnalyzer | null {
		const ext = this.getExtension(filePath);
		for (const analyzer of this.analyzers) {
			if (analyzer.supportedExtensions.includes(ext)) {
				return analyzer;
			}
		}
		return null;
	}

	private getExtension(filePath: string): string {
		const lastDot = filePath.lastIndexOf('.');
		if (lastDot === -1) return '';
		return filePath.slice(lastDot).toLowerCase();
	}

	private buildResponse(issues: CodeIssue[]): StaticAnalysisResponse {
		const errorCount = issues.filter((i) => i.severity === 'error').length;
		const warningCount = issues.filter((i) => i.severity === 'warning').length;
		const infoCount = issues.filter((i) => i.severity === 'info').length;

		return {
			success: true,
			lint: {
				issues,
				summary: {
					errorCount,
					warningCount,
					infoCount,
				},
			},
			typecheck: {
				issues: [],
				summary: {
					errorCount: 0,
					warningCount: 0,
					infoCount: 0,
				},
			},
		};
	}
}
