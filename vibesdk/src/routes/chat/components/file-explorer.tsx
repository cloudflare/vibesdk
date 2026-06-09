import { useState } from 'react';
import { LucideNetwork, ChevronRight, File } from 'lucide-react';
import type { FileType } from '@/api-types';
import clsx from 'clsx';

interface FileTreeItem {
	name: string;
	type: 'file' | 'folder';
	filePath: string;
	children?: { [key: string]: FileTreeItem };
	file?: FileType;
}

export function FileTreeItem({
	item,
	level = 0,
	currentFile,
	onFileClick,
}: {
	item: FileTreeItem;
	level?: number;
	currentFile: FileType | undefined;
	onFileClick: (file: FileType) => void;
}) {
	const [isExpanded, setIsExpanded] = useState(true);
	const isCurrentFile = currentFile?.filePath === item.filePath;

	if (item.type === 'file' && item.file) {
		return (
			<button
				onClick={() => onFileClick(item.file!)}
				className={`flex items-center w-full gap-2 py-1 px-3 transition-colors text-sm ${
					isCurrentFile
						? 'text-brand bg-zinc-100'
						: 'text-text-primary/80 hover:bg-accent hover:text-text-primary'
				}`}
				style={{ paddingLeft: `${level * 12 + 12}px` }}
			>
				<File className="size-3" />
				<span className="flex-1 text-left truncate">{item.name}</span>
				{/* {item.file.isGenerating ? (
					<Loader className="size-3 animate-spin" />
				) : null}
				{item.file.needsFixing && (
					<span className="text-[9px] text-orange-400">fix</span>
				)}
				{item.file.hasRuntimeError && (
					<span className="text-[9px] text-red-400">error</span>
				)} */}
			</button>
		);
	}

	return (
		<div>
			<button
				onClick={() => setIsExpanded(!isExpanded)}
				className="flex items-center gap-2 py-1 px-3 transition-colors text-sm text-text-primary/80 hover:bg-accent hover:text-text-primary w-full"
				style={{ paddingLeft: `${level * 12 + 12}px` }}
			>
				<ChevronRight
					className={clsx(
						'size-3 transition-transform duration-200 ease-in-out',
						isExpanded && 'rotate-90',
					)}
				/>
				<span className="flex-1 text-left truncate">{item.name}</span>
			</button>
			{isExpanded && item.children && (
				<div>
					{Object.values(item.children).map((child) => (
						<FileTreeItem
							key={child.filePath}
							item={child}
							level={level + 1}
							currentFile={currentFile}
							onFileClick={onFileClick}
						/>
					))}
				</div>
			)}
		</div>
	);
}

function buildFileTree(files: FileType[]): FileTreeItem[] {
	const root: { [key: string]: FileTreeItem } = {};

	files.forEach((file) => {
		const parts = file.filePath.split('/');
		let currentLevel: { [key: string]: FileTreeItem } = root;

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
			if (!currentLevel[part].children) {
				currentLevel[part].children = {};
			}
			currentLevel = currentLevel[part].children;
		}

		const fileName = parts[parts.length - 1];
		currentLevel[fileName] = {
			name: fileName,
			type: 'file',
			filePath: file.filePath,
			file: file,
		};
	});

	return Object.values(root);
}

export function FileExplorer({
	files,
	currentFile,
	onFileClick,
}: {
	files: FileType[];
	currentFile: FileType | undefined;
	onFileClick: (file: FileType) => void;
}) {
	const fileTree = buildFileTree(files);

	return (
		<div className="w-full max-w-[200px] bg-bg-3 border-r border-text/10 h-full overflow-y-auto">
			<div className="p-2 px-3 text-sm flex items-center gap-1 text-text-primary/50 font-medium">
				<LucideNetwork className="size-4" />
				Files
			</div>
			<div className="flex flex-col">
				{fileTree.map((item) => (
					<FileTreeItem
						key={item.filePath}
						item={item}
						currentFile={currentFile}
						onFileClick={onFileClick}
					/>
				))}
			</div>
		</div>
	);
}
