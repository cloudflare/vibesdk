import { type FormEvent, type RefObject } from 'react';
import { WebSocket } from 'partysocket';
import { Square } from 'lucide-react';
import { PromptBox } from '@/components/prompt-box';
import { sendWebSocketMessage } from '../utils/websocket-helpers';
import type { ImageAttachment } from '@/api-types';
import { type UsageSummary } from '@/hooks/use-limits';

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

	// Usage limits
	limitsData?: UsageSummary | null;
	onConnectCloudflare?: () => void;
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
	isGenerating,
	isGeneratingBlueprint,
	isDebugging,
	websocket,
	chatFormRef,
	limitsData,
	onConnectCloudflare,
}: ChatInputProps) {
	const handleStopGeneration = () => {
		if (websocket) {
			sendWebSocketMessage(websocket, 'stop_generation');
		}
	};

	const placeholder = isDebugging
		? 'Deep debugging in progress... Please abort to continue'
		: isChatDisabled
			? 'Please wait for blueprint completion...'
			: 'Send a message';

	const stopButton = (isGenerating || isGeneratingBlueprint || isDebugging) ? (
		<button
			type="button"
			onClick={handleStopGeneration}
			className="p-0.5 rounded-full hover:bg-red-500/10 text-text-tertiary hover:text-red-500 transition-all duration-200 group animated-border-ring"
			aria-label="Stop generation"
			title="Stop generation"
		>
			<Square className="size-2.5 fill-brand/90 text-brand/80" />
		</button>
	) : undefined;

	return (
		<PromptBox
			value={newMessage}
			onChange={onMessageChange}
			onSubmit={() => onSubmit(new Event('submit') as unknown as FormEvent)}
			placeholder={placeholder}
			images={images}
			onAddImages={onAddImages}
			onRemoveImage={onRemoveImage}
			isProcessing={isProcessing}
			compactImagePreview
			isDragging={isChatDragging}
			dragHandlers={chatDragHandlers}
			disabled={isChatDisabled}
			limitsData={limitsData}
			onConnectCloudflare={onConnectCloudflare}
			variant="compact"
			rightActions={stopButton}
			maxWords={4000}
			formRef={chatFormRef}
			className="shrink-0 p-4 pb-5 bg-transparent"
		/>
	);
}
