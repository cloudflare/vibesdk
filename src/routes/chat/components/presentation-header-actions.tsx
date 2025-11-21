import { FileDown, User, Monitor, Maximize2 } from 'lucide-react';

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
					onClick={onToggleSpeakerMode}
					className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm transition-colors ${
						speakerMode
							? 'bg-accent text-white'
							: 'bg-bg-3 text-text-primary hover:bg-bg-4'
					}`}
					title="Speaker Mode (with notes and preview)"
				>
					<User className="size-4" />
					<span>Speaker</span>
				</button>
			)}

			{onTogglePreviewMode && (
				<button
					onClick={onTogglePreviewMode}
					className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm transition-colors ${
						previewMode
							? 'bg-accent text-white'
							: 'bg-bg-3 text-text-primary hover:bg-bg-4'
					}`}
					title="Preview Mode (current and next slide)"
				>
					<Monitor className="size-4" />
					<span>Preview</span>
				</button>
			)}

			{onToggleFullscreen && (
				<button
					onClick={onToggleFullscreen}
					className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm transition-colors ${
						fullscreen
							? 'bg-accent text-white'
							: 'bg-bg-3 text-text-primary hover:bg-bg-4'
					}`}
					title="Toggle Fullscreen"
				>
					<Maximize2 className="size-4" />
					<span>Fullscreen</span>
				</button>
			)}

			<div className="w-px h-6 bg-border-primary mx-1" />

			<button
				onClick={onExportPdf}
				className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm bg-bg-3 text-text-primary hover:bg-bg-4 transition-colors"
				title="Export presentation as PDF"
			>
				<FileDown className="size-4" />
				<span>Export PDF</span>
			</button>
		</div>
	);
}
