/**
 * Extracts and resolves imports using Babel AST traversal
 */

import { getBabelInstance } from './BabelCompiler';

export interface ImportDeclaration {
	source: string;
	specifiers: Array<{
		imported: string;
		local: string;
	}>;
	isDefault: boolean;
}

export function parseImports(code: string): ImportDeclaration[] {
	const babel = getBabelInstance();
	if (!babel) {
		throw new Error('Babel not loaded. Call preloadBabel() first.');
	}
	
	const imports: ImportDeclaration[] = [];

	try {
		babel.transform(code, {
			presets: [
				['react', { runtime: 'automatic' }]
			],
			plugins: [
				(): { visitor: Record<string, unknown> } => ({
					visitor: {
						ImportDeclaration(path: {
							node: {
								source: { value: string };
								specifiers: Array<{
									type: string;
									local: { name: string };
									imported?: { name: string };
								}>;
							};
						}): void {
							const node = path.node;
							const specifiers: Array<{ imported: string; local: string }> = [];
							let isDefault = false;

							for (const spec of node.specifiers) {
								if (spec.type === 'ImportDefaultSpecifier') {
									isDefault = true;
									specifiers.push({
										imported: 'default',
										local: spec.local.name,
									});
								} else if (spec.type === 'ImportSpecifier') {
									specifiers.push({
										imported: spec.imported?.name || spec.local.name,
										local: spec.local.name,
									});
								} else if (spec.type === 'ImportNamespaceSpecifier') {
									specifiers.push({
										imported: '*',
										local: spec.local.name,
									});
								}
							}

							imports.push({
								source: node.source.value,
								specifiers,
								isDefault,
							});
						},
					},
				}),
			],
			filename: 'module.jsx',
			sourceType: 'module',
		});

		return imports;
	} catch (error) {
		console.error('[ImportResolver] Failed to parse imports:', error);
		return [];
	}
}

export function resolveImportPath(
	importPath: string,
	currentFile: string,
	files: Map<string, string>,
): string | null {
	if (!importPath.startsWith('.') && !importPath.startsWith('/')) {
		return null;
	}

	if (importPath.startsWith('/')) {
		const withoutLeadingSlash = importPath.slice(1);
		const withPublic = `public/${withoutLeadingSlash}`;
		
		if (files.has(withPublic)) {
			return withPublic;
		}
		const withPublicExt = tryWithExtensions(withPublic, files);
		if (withPublicExt) {
			return withPublicExt;
		}
		
		return files.has(withoutLeadingSlash) 
			? withoutLeadingSlash 
			: tryWithExtensions(withoutLeadingSlash, files);
	}

	const currentDir = currentFile.split('/').slice(0, -1).join('/');
	const resolved = resolvePath(currentDir, importPath);
	return files.has(resolved) ? resolved : tryWithExtensions(resolved, files);
}

function tryWithExtensions(path: string, files: Map<string, string>): string | null {
	const extensions = ['.js', '.jsx', '.ts', '.tsx'];
	
	for (const ext of extensions) {
		const withExt = path + ext;
		if (files.has(withExt)) {
			return withExt;
		}
	}
	
	return null;
}

function resolvePath(base: string, relative: string): string {
	const parts = base.split('/').filter(Boolean);
	const relativeParts = relative.split('/').filter(Boolean);

	for (const part of relativeParts) {
		if (part === '..') {
			parts.pop();
		} else if (part !== '.') {
			parts.push(part);
		}
	}

	return parts.join('/');
}

export function isBareImport(importPath: string): boolean {
	return !importPath.startsWith('.') && !importPath.startsWith('/');
}
