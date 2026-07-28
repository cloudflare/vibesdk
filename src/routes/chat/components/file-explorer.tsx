import { useMemo, useState, memo, type ComponentType } from 'react';
import type { FileType } from '@/api-types';
import { cn } from '@cloudflare/kumo';
import {
	CaretRightIcon,
	FileCssIcon,
	FileHtmlIcon,
	FileIcon,
	FileJsIcon,
	FileJsxIcon,
	FileMdIcon,
	FileSvgIcon,
	FileTsIcon,
	FileTsxIcon,
	FoldersIcon,
	type IconProps,
} from '@phosphor-icons/react';

interface FileTreeItem {
	name: string;
	type: 'file' | 'folder';
	filePath: string;
	children?: Record<string, FileTreeItem>;
	file?: FileType;
}

const FILE_ICON_BY_EXT: Record<string, ComponentType<IconProps>> = {
	ts: FileTsIcon,
	tsx: FileTsxIcon,
	js: FileJsIcon,
	jsx: FileJsxIcon,
	css: FileCssIcon,
	html: FileHtmlIcon,
	md: FileMdIcon,
	svg: FileSvgIcon,
};

function getFileIcon(fileName: string): ComponentType<IconProps> {
	const ext = fileName.includes('.')
		? fileName.slice(fileName.lastIndexOf('.') + 1).toLowerCase()
		: '';
	return FILE_ICON_BY_EXT[ext] ?? FileIcon;
}

function compareTreeItems(a: FileTreeItem, b: FileTreeItem): number {
	// Folders first, then alphabetical
	if (a.type !== b.type) {
		return a.type === 'folder' ? -1 : 1;
	}
	return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
}

function sortedChildren(
	children: Record<string, FileTreeItem> | undefined,
): FileTreeItem[] {
	if (!children) return [];
	return Object.values(children).sort(compareTreeItems);
}

const FileTreeNode = memo(function FileTreeNode({
	item,
	level = 0,
	currentFilePath,
	onFileClick,
}: {
	item: FileTreeItem;
	level?: number;
	currentFilePath: string | undefined;
	onFileClick: (file: FileType) => void;
}) {
	const [isExpanded, setIsExpanded] = useState(true);
	const isCurrentFile =
		item.type === 'file' && currentFilePath === item.filePath;
	const paddingLeft = level * 12 + 12;

	if (item.type === 'file' && item.file) {
		const file = item.file;
		const Icon = getFileIcon(item.name);
		return (
			<button
				type="button"
				onClick={() => onFileClick(file)}
				aria-current={isCurrentFile ? 'page' : undefined}
				className={cn(
					'flex items-center w-full gap-2 py-1.5 px-3 transition-colors text-sm',
					isCurrentFile
						? 'bg-kumo-tint text-text-primary border-r-2 border-brand'
						: 'text-kumo-subtle hover:bg-kumo-tint hover:text-text-primary',
				)}
				style={{ paddingLeft: `${paddingLeft}px` }}
			>
				<Icon className="size-3.5 shrink-0 opacity-60" />
				<span className="flex-1 text-left truncate">{item.name}</span>
			</button>
		);
	}

	const childItems = sortedChildren(item.children);

	return (
		<div role="group" aria-label={item.name}>
			<button
				type="button"
				onClick={() => setIsExpanded((open) => !open)}
				aria-expanded={isExpanded}
				className="flex items-center gap-2 py-1.5 px-3 transition-colors text-sm text-kumo-subtle hover:bg-kumo-tint hover:text-text-primary w-full"
				style={{ paddingLeft: `${paddingLeft}px` }}
			>
				<CaretRightIcon
					className={cn(
						'size-3.5 shrink-0 transition-transform duration-200 ease-in-out',
						isExpanded && 'rotate-90',
					)}
					aria-hidden
				/>
				<span className="flex-1 text-left truncate">{item.name}</span>
			</button>
			{isExpanded && childItems.length > 0 && (
				<div>
					{childItems.map((child) => (
						<FileTreeNode
							key={child.filePath}
							item={child}
							level={level + 1}
							currentFilePath={currentFilePath}
							onFileClick={onFileClick}
						/>
					))}
				</div>
			)}
		</div>
	);
});

function buildFileTree(files: FileType[]): FileTreeItem[] {
	const root: Record<string, FileTreeItem> = {};

	for (const file of files) {
		const parts = file.filePath.split('/').filter(Boolean);
		if (parts.length === 0) continue;

		let currentLevel = root;

		for (let i = 0; i < parts.length - 1; i++) {
			const part = parts[i];
			if (!currentLevel[part]) {
				currentLevel[part] = {
					name: part,
					type: 'folder',
					filePath: parts.slice(0, i + 1).join('/'),
					children: {},
				};
			}
			currentLevel[part].children ??= {};
			currentLevel = currentLevel[part].children;
		}

		const fileName = parts[parts.length - 1];
		currentLevel[fileName] = {
			name: fileName,
			type: 'file',
			filePath: file.filePath,
			file,
		};
	}

	return Object.values(root).sort(compareTreeItems);
}

export function FileExplorer({
	files,
	currentFile,
	onFileClick,
	className,
	showHeader = true,
}: {
	files: FileType[];
	currentFile: FileType | undefined;
	onFileClick: (file: FileType) => void;
	className?: string;
	showHeader?: boolean;
}) {
	const fileTree = useMemo(() => buildFileTree(files), [files]);
	const currentFilePath = currentFile?.filePath;

	return (
		<div
			className={cn(
				'w-full max-w-[200px] bg-kumo-base border-r h-full overflow-y-auto',
				className,
			)}
			role="tree"
			aria-label="Project files"
		>
			{showHeader && (
				<div className="p-2 px-3 text-sm flex items-center gap-1 text-text-primary/50 font-medium border-b mb-1">
					<FoldersIcon weight="duotone" className="size-4" />
					Files
				</div>
			)}
			<div className="flex flex-col">
				{fileTree.map((item) => (
					<FileTreeNode
						key={item.filePath}
						item={item}
						currentFilePath={currentFilePath}
						onFileClick={onFileClick}
					/>
				))}
			</div>
		</div>
	);
}
