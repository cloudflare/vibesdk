import type { FileType } from '@/api-types';

export interface ValidationResult {
	valid: boolean;
	errors: ValidationError[];
	warnings: string[];
}

export interface ValidationError {
	type: 'missing_file' | 'invalid_structure' | 'compilation_failed' | 'missing_exports';
	severity: 'error' | 'warning';
	message: string;
	file?: string;
}

const REQUIRED_LIBRARY_FILES = ['theme-config.js', 'slides-library.jsx'];

const REQUIRED_EXPORTS = {
	'theme-config.js': ['THEME', 'cn'],
	'slides-library.jsx': ['TitleSlide', 'ContentSlide'],
};

export function validateRequiredFiles(files: FileType[]): ValidationError[] {
	const errors: ValidationError[] = [];
	const fileNames = new Set(
		files.map((f) => f.filePath.split('/').pop()).filter((n): n is string => n !== undefined),
	);

	for (const requiredFile of REQUIRED_LIBRARY_FILES) {
		if (!fileNames.has(requiredFile)) {
			errors.push({
				type: 'missing_file',
				severity: 'error',
				message: `Required library file not found: ${requiredFile}`,
				file: requiredFile,
			});
		}
	}

	return errors;
}

export function validateExportStructure(
	compilationResults: Map<string, { success: boolean; exports?: string[] }>,
): ValidationError[] {
	const errors: ValidationError[] = [];

	for (const [fileName, requiredExports] of Object.entries(REQUIRED_EXPORTS)) {
		const result = compilationResults.get(fileName);

		if (!result) {
			errors.push({
				type: 'missing_file',
				severity: 'error',
				message: `File not compiled: ${fileName}`,
				file: fileName,
			});
			continue;
		}

		if (!result.success) {
			errors.push({
				type: 'compilation_failed',
				severity: 'error',
				message: `Compilation failed for ${fileName}`,
				file: fileName,
			});
			continue;
		}

		if (!result.exports) {
			errors.push({
				type: 'invalid_structure',
				severity: 'error',
				message: `No exports found in ${fileName}`,
				file: fileName,
			});
			continue;
		}

		for (const requiredExport of requiredExports) {
			if (!result.exports.includes(requiredExport)) {
				errors.push({
					type: 'missing_exports',
					severity: 'warning',
					message: `Missing recommended export '${requiredExport}' in ${fileName}`,
					file: fileName,
				});
			}
		}
	}

	return errors;
}

export function validateSlideFiles(files: FileType[], slideDirectory = 'public/slides'): ValidationError[] {
	const errors: ValidationError[] = [];
	
	// Normalize slideDirectory to handle both /public/slides and public/slides
	const normalizedSlideDir = slideDirectory.replace(/^\/+/, '');
	
	const slideFiles = files.filter(
		(f) => {
			const normalizedPath = f.filePath.replace(/^\/+/, '');
			return (
				normalizedPath.includes(`${normalizedSlideDir}/`) &&
				(f.filePath.endsWith('.jsx') || f.filePath.endsWith('.tsx')) &&
				!f.filePath.includes('/_dev/')
			);
		}
	);

	if (slideFiles.length === 0) {
		errors.push({
			type: 'missing_file',
			severity: 'error',
			message: `No slide files found in ${normalizedSlideDir}/ directory`,
		});
	}

	const slideNames = new Set<string>();
	for (const slide of slideFiles) {
		const name = slide.filePath.split('/').pop();
		if (name && slideNames.has(name)) {
			errors.push({
				type: 'invalid_structure',
				severity: 'warning',
				message: `Duplicate slide file name: ${name}`,
				file: slide.filePath,
			});
		}
		if (name) slideNames.add(name);
	}

	return errors;
}

export function validateTemplate(files: FileType[], slideDirectory = 'public/slides'): ValidationResult {
	const errors: ValidationError[] = [];

	errors.push(...validateRequiredFiles(files));
	errors.push(...validateSlideFiles(files, slideDirectory));

	const criticalErrors = errors.filter((e) => e.severity === 'error');
	const warnings = errors.filter((e) => e.severity === 'warning').map((e) => e.message);

	return {
		valid: criticalErrors.length === 0,
		errors: criticalErrors,
		warnings,
	};
}
