/**
 * Babel Compiler
 * 
 * Dynamically loads and uses Babel Standalone for JSX transformation
 * Lazy-loaded to reduce initial bundle size
 */

import { BABEL_STANDALONE } from './cdnConfig';

declare global {
	interface Window {
		Babel?: BabelStandalone;
	}
}

interface BabelStandalone {
	transform: (
		code: string,
		options: {
			presets?: Array<string | [string, Record<string, unknown>]>;
			plugins?: Array<(() => { visitor: Record<string, unknown> }) | string>;
			filename?: string;
			sourceType?: 'module' | 'script';
		},
	) => {
		code: string;
		map: unknown;
	};
	parse: (
		code: string,
		options: {
			sourceType?: 'module' | 'script';
			plugins?: string[];
		},
	) => {
		program: unknown;
		[key: string]: unknown;
	};
}

let babelInstance: BabelStandalone | null = null;
let babelLoadPromise: Promise<BabelStandalone> | null = null;

/**
 * Load Babel Standalone dynamically
 * Uses CDN to avoid bundling Babel in main bundle
 */
async function loadBabel(): Promise<BabelStandalone> {
	if (babelInstance) {
		return babelInstance;
	}

	if (babelLoadPromise) {
		return babelLoadPromise;
	}

	babelLoadPromise = (async () => {
		console.log('[BabelCompiler] Loading Babel Standalone from CDN...');

		const script = document.createElement('script');
		const { url, integrity, crossOrigin } = BABEL_STANDALONE;
		script.src = url;
		if (integrity) {
			script.integrity = integrity;
		}
		if (crossOrigin) {
			script.crossOrigin = crossOrigin;
		}

		const loadPromise = new Promise<void>((resolve, reject) => {
			script.onload = () => resolve();
			script.onerror = () => reject(new Error('Failed to load Babel'));
		});

		document.head.appendChild(script);
		await loadPromise;

		if (!window.Babel || !window.Babel.transform) {
			throw new Error('Babel failed to load properly');
		}

		babelInstance = window.Babel;
		return window.Babel;
	})();

	return babelLoadPromise;
}

export interface TransformOptions {
	filename: string;
	sourceType?: 'module' | 'script';
	importRewriteMap?: Record<string, string>;
}

export interface TransformResult {
	code: string;
}

/**
 * Transform JSX/TSX code to JavaScript
 * Automatically loads Babel on first use
 */
export async function transformCode(
	code: string,
	options: TransformOptions,
): Promise<TransformResult> {
	const babel = await loadBabel();

	try {
		const plugins: Array<(() => { visitor: Record<string, unknown> }) | string> = [];

		if (options.importRewriteMap && Object.keys(options.importRewriteMap).length > 0) {
			const map = options.importRewriteMap;
			plugins.push(function () {
				return {
					visitor: {
						ImportDeclaration(path: { node: { source: { value: string } } }) {
							const source = path.node.source.value;
							const replacement = map[source];
							if (replacement) {
								path.node.source.value = replacement;
							}
						},
						CallExpression(path: {
							node: {
								callee: { type: string };
								arguments: Array<{ type: string; value: string }>;
							};
						}) {
							if (path.node.callee.type !== 'Import') return;
							const arg = path.node.arguments[0];
							if (!arg || arg.type !== 'StringLiteral') return;
							const replacement = map[arg.value];
							if (replacement) {
								arg.value = replacement;
							}
						},
					},
				};
			});
		}

		const result = babel.transform(code, {
			presets: [
				['react', { runtime: 'classic' }],
				['typescript', { isTSX: true, allExtensions: true }],
			],
			plugins,
			filename: options.filename,
			sourceType: options.sourceType || 'module',
		});

		return { code: result.code };
	} catch (error) {
		console.error('[BabelCompiler] Transform failed:', error);
		throw new Error(
			`Babel transformation failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
		);
	}
}

/**
 * Check if Babel is loaded
 */
export function isBabelLoaded(): boolean {
	return babelInstance !== null;
}

/**
 * Preload Babel (optional optimization)
 */
export async function preloadBabel(): Promise<void> {
	await loadBabel();
}

/**
 * Get loaded Babel instance
 * Returns null if not loaded
 */
export function getBabelInstance(): BabelStandalone | null {
	return babelInstance;
}
