import { type FormEvent, type RefObject } from 'react';
import { ArrowRight, Image as ImageIcon } from 'react-feather';
import { WebSocket } from 'partysocket';
import { X } from 'lucide-react';
import { ImageAttachmentPreview } from '@/components/image-attachment-preview';
import { sendWebSocketMessage } from '../utils/websocket-helpers';
import { SUPPORTED_IMAGE_MIME_TYPES, type ImageAttachment } from '@/api-types';

const MAX_WORDS = 4000;
const countWords = (text: string): number => {
	return text.trim().split(/\s+/).filter((word) => word.length > 0).length;
};

interface ChatInputProps {
	// Form state
	newMessage: string;
	onMessageChange: (message: string) => void;
	onSubmit: (e: FormEvent) => void;

	// Image upload
	images: ImageAttachment[];
	onAddImages: (files: File[]) => void;
	onRemoveImage: (id: string) => void;
	isProcessing: boolean;

	// Drag and drop
	isChatDragging: boolean;
	chatDragHandlers: {
		onDragEnter: (e: React.DragEvent) => void;
		onDragLeave: (e: React.DragEvent) => void;
		onDragOver: (e: React.DragEvent) => void;
		onDrop: (e: React.DragEvent) => void;
	};

	// Disabled states
	isChatDisabled: boolean;
	isRunning: boolean;
	isGenerating: boolean;
	isGeneratingBlueprint: boolean;
	isDebugging: boolean;

	// WebSocket
	websocket?: WebSocket;

	// Refs
	chatFormRef: RefObject<HTMLFormElement | null>;
	imageInputRef: RefObject<HTMLInputElement | null>;
}

export function ChatInput({
	newMessage,
	onMessageChange,
	onSubmit,
	images,
	onAddImages,
	onRemoveImage,
	isProcessing,
	isChatDragging,
	chatDragHandlers,
	isChatDisabled,
	isRunning,
	isGenerating,
	isGeneratingBlueprint,
	isDebugging,
	websocket,
	chatFormRef,
	imageInputRef,
}: ChatInputProps) {
	const handleTextChange = (newValue: string) => {
		const newWordCount = countWords(newValue);

		// Only update if within word limit
		if (newWordCount <= MAX_WORDS) {
			onMessageChange(newValue);
		}
	};

	const handleImageInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
		const files = Array.from(e.target.files || []);
		if (files.length > 0) {
			onAddImages(files);
		}
		e.target.value = '';
	};

	const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
		if (e.key === 'Enter') {
			if (!e.shiftKey) {
				// Submit on Enter without Shift
				e.preventDefault();
				onSubmit(e as unknown as FormEvent);
			}
			// Shift+Enter will create a new line (default textarea behavior)
		}
	};

	const handleStopGeneration = () => {
		if (websocket) {
			sendWebSocketMessage(websocket, 'stop_generation');
		}
	};

	const placeholder = isDebugging
		? 'Deep debugging in progress... Please abort to continue'
		: isChatDisabled
			? 'Please wait for blueprint completion...'
			: isRunning
				? 'Chat with AI while generating...'
				: 'Chat with AI...';

	return (
		<form
			ref={chatFormRef}
			onSubmit={onSubmit}
			className="shrink-0 p-4 pb-5 bg-transparent"
			{...chatDragHandlers}
		>
			<input
				ref={imageInputRef}
				type="file"
				accept={SUPPORTED_IMAGE_MIME_TYPES.join(',')}
				multiple
				onChange={handleImageInputChange}
				className="hidden"
				disabled={isChatDisabled}
			/>
			<div className="relative">
				{isChatDragging && (
					<div className="absolute inset-0 flex items-center justify-center bg-accent/10 backdrop-blur-sm rounded-xl z-50 pointer-events-none">
						<p className="text-accent font-medium">Drop images here</p>
					</div>
				)}
				{images.length > 0 && (
					<div className="mb-2">
						<ImageAttachmentPreview
							images={images}
							onRemove={onRemoveImage}
							compact
						/>
					</div>
				)}
				<textarea
					value={newMessage}
					onChange={(e) => {
						handleTextChange(e.target.value);
						const ta = e.currentTarget;
						ta.style.height = 'auto';
						ta.style.height = Math.min(ta.scrollHeight, 120) + 'px';
					}}
					onKeyDown={handleKeyDown}
					disabled={isChatDisabled}
					placeholder={placeholder}
					rows={1}
					className="w-full bg-bg-2 border border-text-primary/10 rounded-xl px-3 pr-20 py-2 text-sm outline-none focus:border-white/20 drop-shadow-2xl text-text-primary placeholder:text-text-primary/50! disabled:opacity-50 disabled:cursor-not-allowed resize-none overflow-y-auto no-scrollbar min-h-[36px] max-h-[120px]"
					style={{
						// Auto-resize based on content
						height: 'auto',
						minHeight: '36px'
					}}
					ref={(textarea) => {
						if (textarea) {
							// Auto-resize textarea based on content
							textarea.style.height = 'auto';
							textarea.style.height = Math.min(textarea.scrollHeight, 120) + 'px';
						}
					}}
				/>
				<div className="absolute right-1.5 bottom-2.5 flex items-center gap-1">
					{(isGenerating || isGeneratingBlueprint || isDebugging) && (
						<button
							type="button"
							onClick={handleStopGeneration}
							className="p-1.5 rounded-md hover:bg-red-500/10 text-text-tertiary hover:text-red-500 transition-all duration-200 group relative"
							aria-label="Stop generation"
							title="Stop generation"
						>
							<X className="size-4" strokeWidth={2} />
							<span className="absolute -top-8 right-0 px-2 py-1 bg-bg-1 border border-border-primary rounded text-xs text-text-secondary whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
								Stop
							</span>
						</button>
					)}
					<button
						type="button"
						onClick={() => imageInputRef.current?.click()}
						disabled={isChatDisabled || isProcessing}
						className="p-1.5 rounded-md hover:bg-bg-3 text-text-secondary hover:text-text-primary transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
						aria-label="Upload image"
						title="Upload image"
					>
						<ImageIcon className="size-4" strokeWidth={1.5} />
					</button>
					<button
						type="submit"
						disabled={!newMessage.trim() || isChatDisabled}
						className="p-1.5 rounded-md bg-accent/90 hover:bg-accent/80 disabled:opacity-50 disabled:cursor-not-allowed disabled:bg-transparent text-white disabled:text-text-primary transition-colors"
					>
						<ArrowRight className="size-4" />
					</button>
				</div>
			</div>
		</form>
	);
}
