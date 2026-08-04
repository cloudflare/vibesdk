import { type FormEvent, type ReactNode, type RefObject, useRef } from 'react';
import { ArrowRightIcon } from '@phosphor-icons/react';
import { cn } from '@cloudflare/kumo';
import { ImageAttachmentPreview } from '@/components/image-attachment-preview';
import { ImageUploadButton } from '@/components/image-upload-button';
import { CreditsBanner } from '@/components/credits-banner';
import { OrangeButton } from '@/components/shared/OrangeButton';
import { useTypewriterPlaceholder } from '@/hooks/use-typewriter-placeholder';
import type { ImageAttachment } from '@/api-types';
import { type UsageSummary } from '@/hooks/use-limits';

const MAX_WORDS = 4000;
const countWords = (text: string): number => {
	return text
		.trim()
		.split(/\s+/)
		.filter((word) => word.length > 0).length;
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
	/** Content tucked behind the top of the input box (compact variant only). */
	aboveContent?: ReactNode;

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
	aboveContent,
	maxWords,
	formRef,
	className,
}: PromptBoxProps) {
	const internalTextareaRef = useRef<HTMLTextAreaElement>(null);
	const typewriterText = useTypewriterPlaceholder(
		placeholderPhrases,
		animatedPlaceholder,
	);

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
		el.style.height = '0px';
		el.style.height =
			Math.min(Math.max(el.scrollHeight, isCompact ? 40 : 0), maxHeight) +
			'px';
	};

	const dragOverlay = isDragging && (
		<div className="absolute inset-0 flex items-center justify-center bg-brand/10 backdrop-blur-sm rounded-xl z-50 pointer-events-none">
			<p className="text-kumo-brand font-medium">Drop images here</p>
		</div>
	);

	if (isCompact) {
		return (
			<div className={cn('flex flex-col', className)} {...dragHandlers}>
				{aboveContent}
				<CreditsBanner
					limitsData={limitsData}
					onConnectCloudflare={onConnectCloudflare}
				>
					<div className="min-h-10 rounded-xl transition-all duration-200 bg-bg-4 dark:bg-kumo-elevated border box-border">
						<form ref={formRef} onSubmit={handleSubmit}>
							<div className="relative flex min-h-10 items-center">
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
									className="w-full bg-transparent rounded-xl px-3 pr-20 py-3 text-sm leading-5 ring-0 outline-none text-text-primary placeholder:text-text-primary/50! disabled:opacity-50 disabled:cursor-not-allowed resize-none overflow-y-auto no-scrollbar min-h-10 max-h-[120px] group"
									style={{
										height: '40px',
										minHeight: '40px',
									}}
									ref={(textarea) => {
										(
											internalTextareaRef as React.MutableRefObject<HTMLTextAreaElement | null>
										).current = textarea;
										if (textarea) autoResize(textarea);
									}}
								/>
								<div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-2">
									{rightActions}
									<OrangeButton
										type="submit"
										shape="square"
										size="sm"
										disabled={
											!value.trim() ||
											disabled ||
											submitDisabled
										}
										aria-label="Send message"
										title="Send message"
										icon={
											submitIcon ?? (
												<ArrowRightIcon className="size-4" />
											)
										}
									/>
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
			className={cn('w-full z-10', className)}
			radius={borderRadius}
		>
			<div
				className="w-full rounded-[18px] bg-bg-4 dark:bg-kumo-elevated cursor-text border transition-all duration-200 shadow-sm"
				onClick={(e) => {
					const target = e.target as HTMLElement;
					if (
						target.closest(
							'button, a, input, textarea, select, label, [role="button"]',
						)
					) {
						return;
					}
					internalTextareaRef.current?.focus();
				}}
			>
				<form
					ref={formRef}
					onSubmit={handleSubmit}
					className="flex z-10 flex-col w-full min-h-[136px] bg-bg-4 ring-0 dark:bg-kumo-elevated rounded-[18px] p-4 transition-all duration-200"
				>
					<div
						className={cn(
							'flex-1 flex flex-col relative',
							isDragging &&
								'ring-2 ring-brand ring-offset-2 rounded-lg',
						)}
						{...dragHandlers}
					>
						{dragOverlay}
						<textarea
							className="w-full resize-none ring-0 z-20 outline-0 placeholder:text-text-primary/60 text-text-primary group"
							value={value}
							placeholder={resolvedPlaceholder}
							autoFocus
							ref={(textarea) => {
								(
									internalTextareaRef as React.MutableRefObject<HTMLTextAreaElement | null>
								).current = textarea;
								if (textarea) autoResize(textarea);
							}}
							onChange={(e) => {
								handleTextChange(e.target.value);
								autoResize(e.currentTarget);
							}}
							onInput={(e) =>
								autoResize(
									e.currentTarget as HTMLTextAreaElement,
								)
							}
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
						className={cn(
							'flex items-center mt-4 pt-1',
							leftActions ? 'justify-between' : 'justify-end',
						)}
					>
						{leftActions}
						<div
							className={cn(
								'flex items-center gap-2',
								leftActions && 'ml-4',
							)}
						>
							{rightActions}
							<ImageUploadButton
								onFilesSelected={onAddImages}
								disabled={disabled || isProcessing}
							/>
							<OrangeButton
								type="submit"
								shape="square"
								size="sm"
								disabled={
									!value.trim() || disabled || submitDisabled
								}
								aria-label="Send message"
								title="Send message"
								className="size-7!"
								icon={
									submitIcon ?? (
										<ArrowRightIcon className="size-5" />
									)
								}
							/>
						</div>
					</div>
				</form>
			</div>
		</CreditsBanner>
	);
}
