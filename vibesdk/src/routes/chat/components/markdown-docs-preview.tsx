import { useState, useEffect, useMemo, useRef, useCallback, type ReactNode } from 'react';
import { Loader, FileText, FileDown } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeExternalLinks from 'rehype-external-links';
import { DocsSidebar } from './docs-sidebar';
import { ExportButton } from './export-button';
import { exportMarkdownAsFile } from '@/utils/markdown-export';
import type { FileType } from '@/api-types';
import './markdown-docs-preview.css';

interface MarkdownDocsPreviewProps {
	files: FileType[];
	isGenerating: boolean;
}

export function MarkdownDocsPreview({
	files,
	isGenerating: _isGenerating,
}: MarkdownDocsPreviewProps) {
	// Prioritize README as default, otherwise first file
	const defaultFile = useMemo(() => {
		const readmeFile = files.find((f) =>
			f.filePath.toLowerCase().includes('readme')
		);
		return readmeFile || files[0];
	}, [files]);

	const [activeFilePath, setActiveFilePath] = useState<string>(
		defaultFile?.filePath || ''
	);

	// Update active file if default changes
	useEffect(() => {
		if (defaultFile && !activeFilePath) {
			setActiveFilePath(defaultFile.filePath);
		}
	}, [defaultFile, activeFilePath]);

	const activeFile = files.find((f) => f.filePath === activeFilePath);

	// Ref for print export
	const contentRef = useRef<HTMLElement>(null);

	// Export handlers
	const handleExportMarkdown = useCallback(() => {
		if (!activeFile) return;
		const filename = activeFile.filePath.split('/').pop() || 'documentation.md';
		exportMarkdownAsFile(activeFile.fileContents || '', filename);
	}, [activeFile]);

	const handlePrint = useCallback(() => {
		window.print();
	}, []);

	// Extract table of contents from markdown headings
	const tableOfContents = useMemo(() => {
		if (!activeFile?.fileContents) return [];

		const headingRegex = /^(#{1,3})\s+(.+)$/gm;
		const headings: { level: number; text: string; id: string }[] = [];
		let match;

		while ((match = headingRegex.exec(activeFile.fileContents)) !== null) {
			const level = match[1].length;
			const text = match[2];
			const id = text
				.toLowerCase()
				.replace(/[^\w\s-]/g, '')
				.replace(/\s+/g, '-');

			headings.push({ level, text, id });
		}

		return headings;
	}, [activeFile?.fileContents]);

	const handleFileSelect = (filePath: string) => {
		setActiveFilePath(filePath);
	};

	const markdownContent = useMemo(() => {
		if (!activeFile) return '';

		let content = activeFile.fileContents || '';

		// Add generating indicator if still streaming
		if (activeFile.isGenerating && content) {
			content += '\n\n_Generating..._';
		}

		return content;
	}, [activeFile]);

	return (
		<div className="flex-1 flex overflow-hidden">
			{/* Sidebar */}
			<DocsSidebar
				files={files}
				activeFile={activeFilePath}
				onFileSelect={handleFileSelect}
			/>

			{/* Main content area */}
			<div className="flex-1 flex flex-col overflow-hidden">
				{/* Header */}
				<div className="flex items-center gap-3 px-6 h-12 bg-bg-2 border-b border-border-primary">
					{/* Left: File name and status */}
					<div className="flex items-center gap-3 flex-1">
						<span className="text-sm font-medium text-text-primary">
							{activeFile?.filePath || 'Documentation'}
						</span>
						{activeFile?.isGenerating && (
							<div className="flex items-center gap-2 text-xs text-accent">
								<Loader className="size-3 animate-spin" />
								<span>Generating...</span>
							</div>
						)}
					</div>

					{/* Right: Export buttons */}
					<div className="flex items-center gap-2 export-button-container">
						<ExportButton
							icon={FileText}
							onClick={handleExportMarkdown}
							tooltip="Download Markdown"
							disabled={!activeFile}
						/>
						<ExportButton
							icon={FileDown}
							onClick={handlePrint}
							tooltip="Print to PDF"
							disabled={!activeFile}
						/>
					</div>
				</div>

				{/* Content with TOC */}
				<div className="flex-1 flex overflow-hidden">
					{/* Main markdown content */}
					<div className="flex-1 overflow-y-auto px-6 py-8">
						{!activeFile ? (
							<div className="flex flex-col items-center justify-center h-full gap-4 text-text-secondary">
								<p>No documentation file selected</p>
							</div>
						) : !markdownContent ? (
							<div className="flex flex-col items-center justify-center h-full gap-4 text-text-secondary">
								<Loader className="size-8 animate-spin text-accent" />
								<p>Waiting for content...</p>
							</div>
						) : (
							<article ref={contentRef} className="prose prose-sm prose-invert max-w-none">
								<ReactMarkdown
									remarkPlugins={[remarkGfm]}
									rehypePlugins={[[rehypeExternalLinks, { target: '_blank' }]]}
									components={{
										h1: ({ node, ...props }) => (
											<h1 id={createId(props.children)} {...props} />
										),
										h2: ({ node, ...props }) => (
											<h2 id={createId(props.children)} {...props} />
										),
										h3: ({ node, ...props }) => (
											<h3 id={createId(props.children)} {...props} />
										),
									}}
								>
									{markdownContent}
								</ReactMarkdown>
							</article>
						)}
					</div>

					{/* Table of contents (if headings exist) */}
					{tableOfContents.length > 0 && (
						<div className="w-56 border-l border-border-primary bg-bg-2 overflow-y-auto py-6 px-4">
							<h4 className="text-xs font-semibold text-text-secondary uppercase tracking-wider mb-3">
								On This Page
							</h4>
							<nav>
								<ul className="space-y-2">
									{tableOfContents.map((heading, idx) => (
										<li
											key={idx}
											style={{
												paddingLeft: `${(heading.level - 1) * 12}px`,
											}}
										>
											<a
												href={`#${heading.id}`}
												className="text-xs text-text-tertiary hover:text-text-primary transition-colors block"
											>
												{heading.text}
											</a>
										</li>
									))}
								</ul>
							</nav>
						</div>
					)}
				</div>
			</div>
		</div>
	);
}

/**
 * Create ID from heading text for anchor links
 */
function createId(children: ReactNode): string {
	const text = extractText(children);
	return text
		.toLowerCase()
		.replace(/[^\w\s-]/g, '')
		.replace(/\s+/g, '-');
}

/**
 * Extract text from React children
 */
function extractText(children: ReactNode): string {
	if (typeof children === 'string') return children;
	if (Array.isArray(children)) return children.map(extractText).join('');
	if (children && typeof children === 'object' && 'props' in children) {
		const element = children as { props: { children?: ReactNode } };
		return extractText(element.props.children);
	}
	return '';
}
