import { type FormEvent, type ReactNode, type RefObject, useRef } from 'react';
import { ArrowRight } from 'react-feather';
import clsx from 'clsx';
import { ImageAttachmentPreview } from '@/components/image-attachment-preview';
import { ImageUploadButton } from '@/components/image-upload-button';
import { CreditsBanner } from '@/components/credits-banner';
import { useTypewriterPlaceholder } from '@/hooks/use-typewriter-placeholder';
import type { ImageAttachment } from '@/api-types';
import { type UsageSummary } from '@/hooks/use-limits';

const MAX_WORDS = 4000;
const countWords = (text: string): number => {
	return text.trim().split(/\s+/).filter((word) => word.length > 0).length;
};

interface DragHandlers {
	onDragEnter: (e: React.DragEvent) => void;
	onDragLeave: (e: React.DragEvent) => void;
	onDragOver: (e: React.DragEvent) => void;
	onDrop: (e: React.DragEvent) => void;
}

export interface PromptBoxProps {
	// Core
	value: string;
	onChange: (value: string) => void;
	onSubmit: () => void;

	// Placeholder
	placeholder?: string;
	animatedPlaceholder?: boolean;
	placeholderPhrases?: string[];

	// Images
	images: ImageAttachment[];
	onAddImages: (files: File[]) => void;
	onRemoveImage: (id: string) => void;
	isProcessing?: boolean;
	compactImagePreview?: boolean;

	// Drag and drop
	isDragging: boolean;
	dragHandlers: DragHandlers;

	// State
	disabled?: boolean;
	submitDisabled?: boolean;

	// CreditsBanner
	limitsData?: UsageSummary | null;
	onConnectCloudflare?: () => void;

	// Layout
	variant?: 'compact' | 'expanded';

	// Slots
	leftActions?: ReactNode;
	rightActions?: ReactNode;
	submitIcon?: ReactNode;

	// Text limits
	maxWords?: number;

	// Refs
	formRef?: RefObject<HTMLFormElement | null>;

	// Styling
	className?: string;
}

export function PromptBox({
	value,
	onChange,
	onSubmit,
	placeholder = '',
	animatedPlaceholder = false,
	placeholderPhrases = [],
	images,
	onAddImages,
	onRemoveImage,
	isProcessing = false,
	compactImagePreview = false,
	isDragging,
	dragHandlers,
	disabled = false,
	submitDisabled = false,
	limitsData,
	onConnectCloudflare,
	variant = 'compact',
	leftActions,
	rightActions,
	submitIcon,
	maxWords,
	formRef,
	className,
}: PromptBoxProps) {
	const internalTextareaRef = useRef<HTMLTextAreaElement>(null);
	const typewriterText = useTypewriterPlaceholder(placeholderPhrases, animatedPlaceholder);

	const resolvedPlaceholder = animatedPlaceholder
		? `${placeholder}${typewriterText}`
		: placeholder;

	const wordLimit = maxWords ?? MAX_WORDS;

	const handleTextChange = (newValue: string) => {
		if (maxWords !== undefined) {
			const newWordCount = countWords(newValue);
			if (newWordCount > wordLimit) return;
		}
		onChange(newValue);
	};

	const handleSubmit = (e: FormEvent) => {
		e.preventDefault();
		onSubmit();
	};

	const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
		if (e.key === 'Enter' && !e.shiftKey) {
			e.preventDefault();
			onSubmit();
		}
	};

	const isCompact = variant === 'compact';
	const maxHeight = isCompact ? 120 : 300;
	const borderRadius = isCompact ? 12 : 18;

	const autoResize = (el: HTMLTextAreaElement) => {
		el.style.height = 'auto';
		el.style.height = Math.min(el.scrollHeight, maxHeight) + 'px';
	};

	const dragOverlay = isDragging && (
		<div className="absolute inset-0 flex items-center justify-center bg-accent/10 backdrop-blur-sm rounded-xl z-50 pointer-events-none">
			<p className="text-accent font-medium">Drop images here</p>
		</div>
	);

	if (isCompact) {
		return (
			<div className={className} {...dragHandlers}>
				<CreditsBanner limitsData={limitsData} onConnectCloudflare={onConnectCloudflare}>
					<div className="rounded-xl bg-bg-2 border border-[#f48120]/30 focus-within:border-[#f48120]/70 transition-all duration-200">
						<form ref={formRef} onSubmit={handleSubmit}>
							<div className="relative">
								{dragOverlay}
								{images.length > 0 && (
									<div className="mb-2">
										<ImageAttachmentPreview
											images={images}
											onRemove={onRemoveImage}
											compact={compactImagePreview}
										/>
									</div>
								)}
								<textarea
									value={value}
									onChange={(e) => {
										handleTextChange(e.target.value);
										autoResize(e.currentTarget);
									}}
									onKeyDown={handleKeyDown}
									disabled={disabled}
									placeholder={resolvedPlaceholder}
									rows={1}
									className="w-full bg-transparent rounded-xl px-3 pr-20 py-2 text-sm ring-0 outline-none text-text-primary placeholder:text-text-primary/50! disabled:opacity-50 disabled:cursor-not-allowed resize-none overflow-y-auto no-scrollbar min-h-[36px] max-h-[120px] group"
									style={{ height: 'auto', minHeight: '36px' }}
									ref={(textarea) => {
										(internalTextareaRef as React.MutableRefObject<HTMLTextAreaElement | null>).current = textarea;
										if (textarea) autoResize(textarea);
									}}
								/>
								<div className="absolute right-1.5 bottom-2.5 flex items-center gap-1">
									{rightActions}
									<ImageUploadButton
										onFilesSelected={onAddImages}
										disabled={disabled || isProcessing}
									/>
									<button
										type="submit"
										disabled={!value.trim() || disabled || submitDisabled}
										className="p-1.5 rounded-md bg-accent/90 hover:bg-accent/80 disabled:opacity-50 disabled:cursor-not-allowed disabled:bg-transparent text-white disabled:text-text-primary transition-colors"
									>
										{submitIcon ?? <ArrowRight className="size-4" />}
									</button>
								</div>
							</div>
						</form>
					</div>
				</CreditsBanner>
			</div>
		);
	}

	// Expanded variant
	return (
		<CreditsBanner
			limitsData={limitsData}
			onConnectCloudflare={onConnectCloudflare}
			className={clsx('w-full z-10', className)}
			radius={borderRadius}
		>
			<div className="w-full rounded-[18px] bg-bg-4 dark:bg-bg-2 border border-[#f48120]/30 focus-within:border-[#f48120]/70 transition-all duration-200">
				<form
					ref={formRef}
					onSubmit={handleSubmit}
					className="flex z-10 flex-col w-full min-h-[150px] bg-bg-4 ring-0 dark:bg-bg-2 rounded-[18px] p-5 transition-all duration-200"
				>
					<div
						className={clsx(
							'flex-1 flex flex-col relative',
							isDragging && 'ring-2 ring-accent ring-offset-2 rounded-lg',
						)}
						{...dragHandlers}
					>
						{dragOverlay}
						<textarea
							className="w-full resize-none ring-0 z-20 outline-0 placeholder:text-text-primary/60 text-text-primary group"
							value={value}
							placeholder={resolvedPlaceholder}
							ref={(textarea) => {
								(internalTextareaRef as React.MutableRefObject<HTMLTextAreaElement | null>).current = textarea;
								if (textarea) autoResize(textarea);
							}}
							onChange={(e) => {
								handleTextChange(e.target.value);
								autoResize(e.currentTarget);
							}}
							onInput={(e) => autoResize(e.currentTarget as HTMLTextAreaElement)}
							onKeyDown={handleKeyDown}
							disabled={disabled}
						/>
						{images.length > 0 && (
							<div className="mt-3">
								<ImageAttachmentPreview
									images={images}
									onRemove={onRemoveImage}
									compact={compactImagePreview}
								/>
							</div>
						)}
					</div>
					<div
						className={clsx(
							'flex items-center mt-4 pt-1',
							leftActions ? 'justify-between' : 'justify-end',
						)}
					>
						{leftActions}
						<div className={clsx('flex items-center gap-2', leftActions && 'ml-4')}>
							{rightActions}
							<ImageUploadButton
								onFilesSelected={onAddImages}
								disabled={disabled || isProcessing}
							/>
							<button
								type="submit"
								disabled={!value.trim() || disabled || submitDisabled}
								className="bg-accent text-white p-1 rounded-md *:size-5 transition-all duration-200 hover:shadow-md disabled:opacity-50 disabled:cursor-not-allowed"
							>
								{submitIcon ?? <ArrowRight />}
							</button>
						</div>
					</div>
				</form>
			</div>
		</CreditsBanner>
	);
}
