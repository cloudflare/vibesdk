import { type FormEvent, type ReactNode, type RefObject } from 'react';
import { WebSocket } from 'partysocket';
import { PromptBox } from '@/components/prompt-box';
import { sendWebSocketMessage } from '../utils/websocket-helpers';
import type { ImageAttachment } from '@/api-types';
import { type UsageSummary } from '@/hooks/use-limits';
import { Button } from '@cloudflare/kumo';
import { SquareIcon } from '@phosphor-icons/react';

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

	// Content tucked behind the top of the input box
	aboveContent?: ReactNode;
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
	aboveContent,
}: ChatInputProps) {
	const handleStopGeneration = () => {
		if (websocket) {
			sendWebSocketMessage(websocket, 'stop_generation');
		}
	};

	const placeholder = isDebugging
		? 'Deep debugging in progress... Please abort to continue'
		: 'Send a message';

	const stopButton =
		isGenerating || isGeneratingBlueprint || isDebugging ? (
			<Button
				type="button"
				variant="secondary-destructive"
				shape="square"
				size="sm"
				onClick={handleStopGeneration}
				aria-label="Stop generation"
				title="Stop generation"
				icon={SquareIcon}
			/>
		) : undefined;

	return (
		<PromptBox
			value={newMessage}
			onChange={onMessageChange}
			onSubmit={() =>
				onSubmit(new Event('submit') as unknown as FormEvent)
			}
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
			aboveContent={aboveContent}
			maxWords={4000}
			formRef={chatFormRef}
			className="shrink-0 p-3 bg-transparent"
		/>
	);
}
