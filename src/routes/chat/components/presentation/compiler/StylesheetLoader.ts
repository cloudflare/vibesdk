/**
 * Stylesheet Loader
 *
 * Responsible for loading all CSS and runtime styles that the
 * presentation templates expect, without polluting the host app.
 *
 * Design goals:
 * - Tailwind runtime is loaded once, with a scoped config so utilities
 *   only affect the presentation root.
 * - Prism + font stylesheets are loaded from CDN.
 * - Template CSS (e.g. slides-styles.css) is injected from the
 *   in‑memory file map rather than relying on network paths.
 */

import {
	INTER_JETBRAINS_FONTS,
	PRISM_THEME,
	type ExternalResource,
} from './cdnConfig';

interface StylesheetOptions {
	files: Map<string, string>;
	slideDirectory: string;
}

const injectedStyles = new Set<string>();

const CDN_STYLESHEETS: ExternalResource[] = [PRISM_THEME, INTER_JETBRAINS_FONTS];

/**
 * Inject CDN stylesheets into document head
 */
function injectCDNStylesheets(): void {
	for (const resource of CDN_STYLESHEETS) {
		if (injectedStyles.has(resource.url)) {
			continue;
		}

		const link = document.createElement('link');
		link.rel = 'stylesheet';
		link.href = resource.url;
		if (resource.integrity) {
			link.integrity = resource.integrity;
		}
		if (resource.crossOrigin) {
			link.crossOrigin = resource.crossOrigin;
		}
		document.head.appendChild(link);

		injectedStyles.add(resource.url);
	}
}

/**
 * Inject template CSS files into document head
 */
function injectTemplateStyles(files: Map<string, string>): void {
	for (const [filePath, content] of files.entries()) {
		if (!filePath.endsWith('.css')) {
			continue;
		}

		if (injectedStyles.has(filePath)) {
			continue;
		}

		const style = document.createElement('style');
		style.textContent = content;
		style.setAttribute('data-source', filePath);
		document.head.appendChild(style);

		injectedStyles.add(filePath);
	}
}

/**
 * Load all required stylesheets for presentation
 */
export function loadStylesheets(options: StylesheetOptions): void {
	injectCDNStylesheets();
	injectTemplateStyles(options.files);
}

/**
 * Clear all injected stylesheets (for cleanup)
 */
export function clearStylesheets(): void {
	const templateStyles = document.querySelectorAll('style[data-source]');
	for (const style of templateStyles) {
		style.remove();
	}

	for (const resource of CDN_STYLESHEETS) {
		const link = document.querySelector(`link[href="${resource.url}"]`);
		if (link) {
			link.remove();
		}
	}

	injectedStyles.clear();
}
