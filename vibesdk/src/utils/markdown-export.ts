/**
 * Export markdown content as a downloadable .md file
 */
export function exportMarkdownAsFile(content: string, filename: string): void {
	const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' });
	const url = URL.createObjectURL(blob);
	const a = document.createElement('a');
	a.href = url;
	a.download = filename.endsWith('.md') ? filename : `${filename}.md`;
	document.body.appendChild(a);
	a.click();
	document.body.removeChild(a);
	URL.revokeObjectURL(url);
}

/**
 * DEPRECATED: PDF export functionality has been replaced with browser Print API
 *
 * Users should now use window.print() which provides:
 * - Better PDF quality (browser native generation)
 * - Smaller file sizes (500KB-1MB vs 34MB)
 * - Native OS print dialog
 * - Automatic page breaks and formatting
 * - Zero bundle overhead
 *
 * See markdown-docs-preview.tsx for the new handlePrint implementation
 */
export async function exportMarkdownAsPDF(
	_element: HTMLElement,
	_filename: string
): Promise<void> {
	throw new Error(
		'PDF export has been replaced with browser Print API. ' +
		'Use window.print() for better results with smaller files and better quality.'
	);
}
