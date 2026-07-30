import { useState } from 'react';
import {
	FileText,
	Folder,
	FolderOpen,
	Loader,
	ChevronRight,
} from 'lucide-react';
import { cn } from '@cloudflare/kumo';
import type { FileType } from '@/api-types';

interface DocsSidebarProps {
	files: FileType[];
	activeFile?: string;
	onFileSelect: (filePath: string) => void;
}

interface FileNode {
	name: string;
	path: string;
	isDirectory: boolean;
	children?: FileNode[];
	file?: FileType;
}

export function DocsSidebar({
	files,
	activeFile,
	onFileSelect,
}: DocsSidebarProps) {
	const [expandedFolders, setExpandedFolders] = useState<Set<string>>(
		new Set(['docs', 'documentation', '.']),
	);

	// Build file tree from flat list
	const fileTree = buildFileTree(files);

	const toggleFolder = (path: string) => {
		setExpandedFolders((prev) => {
			const next = new Set(prev);
			if (next.has(path)) {
				next.delete(path);
			} else {
				next.add(path);
			}
			return next;
		});
	};

	return (
		<div className="w-64 bg-kumo-elevated border-r flex flex-col overflow-hidden">
			{/* Header */}
			<div className="px-4 py-3 border-b">
				<h3 className="text-sm font-medium text-text-primary">
					Documentation
				</h3>
				<p className="text-xs text-kumo-subtle mt-0.5">
					{files.length} {files.length === 1 ? 'file' : 'files'}
				</p>
			</div>

			{/* File tree */}
			<div className="flex-1 overflow-y-auto py-2">
				{fileTree.map((node) => (
					<TreeNode
						key={node.path}
						node={node}
						activeFile={activeFile}
						expandedFolders={expandedFolders}
						onFileSelect={onFileSelect}
						onToggleFolder={toggleFolder}
						depth={0}
					/>
				))}
			</div>
		</div>
	);
}

/**
 * Recursive tree node component
 */
function TreeNode({
	node,
	activeFile,
	expandedFolders,
	onFileSelect,
	onToggleFolder,
	depth,
}: {
	node: FileNode;
	activeFile?: string;
	expandedFolders: Set<string>;
	onFileSelect: (path: string) => void;
	onToggleFolder: (path: string) => void;
	depth: number;
}) {
	const isExpanded = expandedFolders.has(node.path);
	const isActive = activeFile === node.path;
	const isGenerating = node.file?.isGenerating;

	if (node.isDirectory) {
		return (
			<div>
				<button
					onClick={() => onToggleFolder(node.path)}
					className="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-kumo-base transition-colors text-sm text-text-secondary hover:text-text-primary"
					style={{ paddingLeft: `${depth * 12 + 12}px` }}
				>
					<ChevronRight
						className={cn(
							'size-3 transition-transform flex-shrink-0',
							isExpanded && 'rotate-90',
						)}
					/>
					{isExpanded ? (
						<FolderOpen className="size-4 flex-shrink-0 text-kumo-brand" />
					) : (
						<Folder className="size-4 flex-shrink-0 text-kumo-subtle" />
					)}
					<span className="truncate">{node.name}</span>
				</button>
				{isExpanded && node.children && (
					<div>
						{node.children.map((child) => (
							<TreeNode
								key={child.path}
								node={child}
								activeFile={activeFile}
								expandedFolders={expandedFolders}
								onFileSelect={onFileSelect}
								onToggleFolder={onToggleFolder}
								depth={depth + 1}
							/>
						))}
					</div>
				)}
			</div>
		);
	}

	return (
		<button
			onClick={() => onFileSelect(node.path)}
			className={cn(
				'w-full flex items-center gap-2 px-3 py-1.5 transition-colors text-sm',
				isActive
					? 'bg-brand/10 text-kumo-brand border-l-2 border-brand'
					: 'hover:bg-kumo-base text-text-secondary hover:text-text-primary border-l-2 border-transparent',
			)}
			style={{ paddingLeft: `${depth * 12 + 12}px` }}
		>
			<FileText className="size-4 flex-shrink-0" />
			<span className="truncate flex-1 text-left">{node.name}</span>
			{isGenerating && (
				<Loader className="size-3 animate-spin text-kumo-brand flex-shrink-0" />
			)}
		</button>
	);
}

/**
 * Build a hierarchical file tree from flat file list
 */
function buildFileTree(files: FileType[]): FileNode[] {
	const root: FileNode = {
		name: '',
		path: '',
		isDirectory: true,
		children: [],
	};

	// Sort files by path for consistent ordering
	const sortedFiles = [...files].sort((a, b) =>
		a.filePath.localeCompare(b.filePath),
	);

	for (const file of sortedFiles) {
		const parts = file.filePath.split('/');
		let currentNode = root;

		// Navigate/create directory structure
		for (let i = 0; i < parts.length - 1; i++) {
			const part = parts[i];
			const path = parts.slice(0, i + 1).join('/');

			let childNode = currentNode.children?.find(
				(n) => n.name === part && n.isDirectory,
			);

			if (!childNode) {
				childNode = {
					name: part,
					path,
					isDirectory: true,
					children: [],
				};
				currentNode.children = currentNode.children || [];
				currentNode.children.push(childNode);
			}

			currentNode = childNode;
		}

		// Add file node
		const fileName = parts[parts.length - 1];
		currentNode.children = currentNode.children || [];
		currentNode.children.push({
			name: fileName,
			path: file.filePath,
			isDirectory: false,
			file,
		});
	}

	return root.children || [];
}
