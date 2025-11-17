import { FileDown, User, Monitor, Maximize2 } from 'lucide-react';
import clsx from 'clsx';

interface PresentationHeaderActionsProps {
	onExportPdf: () => void;
	onToggleSpeakerMode?: () => void;
	onTogglePreviewMode?: () => void;
	onToggleFullscreen?: () => void;
	speakerMode?: boolean;
	previewMode?: boolean;
	fullscreen?: boolean;
}

export function PresentationHeaderActions({
	onExportPdf,
	onToggleSpeakerMode,
	onTogglePreviewMode,
	onToggleFullscreen,
	speakerMode,
	previewMode,
	fullscreen,
}: PresentationHeaderActionsProps) {
	return (
		<div className="flex items-center gap-2">
			{onToggleSpeakerMode && (
				<button
					className={clsx(
						'group relative flex items-center gap-1.5 p-1.5 group-hover:pl-2 group-hover:pr-2.5 rounded-full group-hover:rounded-md transition-all duration-300 ease-in-out border hover:shadow-sm overflow-hidden',
						speakerMode
							? 'bg-brand-primary/20 border-brand-primary text-brand-primary'
							: 'hover:bg-bg-4 border-transparent hover:border-border-primary',
					)}
					onClick={onToggleSpeakerMode}
					title="Speaker Mode (with notes and preview)"
				>
					<User
						className={clsx(
							'size-3.5 transition-colors duration-300',
							speakerMode
								? 'text-brand-primary'
								: 'text-text-primary/60 group-hover:text-brand-primary',
						)}
					/>
					<span className="max-w-0 group-hover:max-w-xs overflow-hidden whitespace-nowrap transition-all duration-300 ease-in-out text-xs text-text-primary/80 group-hover:text-text-primary">
						Speaker
					</span>
				</button>
			)}

			{onTogglePreviewMode && (
				<button
					className={clsx(
						'group relative flex items-center gap-1.5 p-1.5 group-hover:pl-2 group-hover:pr-2.5 rounded-full group-hover:rounded-md transition-all duration-300 ease-in-out border hover:shadow-sm overflow-hidden',
						previewMode
							? 'bg-brand-primary/20 border-brand-primary text-brand-primary'
							: 'hover:bg-bg-4 border-transparent hover:border-border-primary',
					)}
					onClick={onTogglePreviewMode}
					title="Preview Mode (current and next slide)"
				>
					<Monitor
						className={clsx(
							'size-3.5 transition-colors duration-300',
							previewMode
								? 'text-brand-primary'
								: 'text-text-primary/60 group-hover:text-brand-primary',
						)}
					/>
					<span className="max-w-0 group-hover:max-w-xs overflow-hidden whitespace-nowrap transition-all duration-300 ease-in-out text-xs text-text-primary/80 group-hover:text-text-primary">
						Preview
					</span>
				</button>
			)}

			{onToggleFullscreen && (
				<button
					className={clsx(
						'group relative flex items-center gap-1.5 p-1.5 group-hover:pl-2 group-hover:pr-2.5 rounded-full group-hover:rounded-md transition-all duration-300 ease-in-out border hover:shadow-sm overflow-hidden',
						fullscreen
							? 'bg-brand-primary/20 border-brand-primary text-brand-primary'
							: 'hover:bg-bg-4 border-transparent hover:border-border-primary',
					)}
					onClick={onToggleFullscreen}
					title="Toggle Fullscreen"
				>
					<Maximize2
						className={clsx(
							'size-3.5 transition-colors duration-300',
							fullscreen
								? 'text-brand-primary'
								: 'text-text-primary/60 group-hover:text-brand-primary',
						)}
					/>
					<span className="max-w-0 group-hover:max-w-xs overflow-hidden whitespace-nowrap transition-all duration-300 ease-in-out text-xs text-text-primary/80 group-hover:text-text-primary">
						Fullscreen
					</span>
				</button>
			)}

			<div className="h-4 w-px bg-border-primary mx-1" />

			<button
				className="group relative flex items-center gap-1.5 p-1.5 group-hover:pl-2 group-hover:pr-2.5 rounded-full group-hover:rounded-md transition-all duration-300 ease-in-out hover:bg-bg-4 border border-transparent hover:border-border-primary hover:shadow-sm overflow-hidden"
				onClick={onExportPdf}
				title="Export presentation as PDF"
			>
				<FileDown className="size-3.5 text-text-primary/60 group-hover:text-brand-primary transition-colors duration-300" />
				<span className="max-w-0 group-hover:max-w-xs overflow-hidden whitespace-nowrap transition-all duration-300 ease-in-out text-xs text-text-primary/80 group-hover:text-text-primary">
					Export PDF
				</span>
			</button>
		</div>
	);
}
