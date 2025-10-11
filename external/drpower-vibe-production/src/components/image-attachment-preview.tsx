import { X } from 'lucide-react';
import type { ImageAttachment } from '@/api-types';
import { motion, AnimatePresence } from 'framer-motion';

export interface ImageAttachmentPreviewProps {
	images: ImageAttachment[];
	onRemove?: (id: string) => void;
	className?: string;
	compact?: boolean;
}

/**
 * Component to display image attachment previews
 */
export function ImageAttachmentPreview({
	images,
	onRemove,
	className = '',
	compact = false,
}: ImageAttachmentPreviewProps) {
	if (images.length === 0) return null;

	return (
		<div className={`flex flex-wrap gap-2 ${className}`}>
			<AnimatePresence mode="popLayout">
				{images.map((image) => (
					<motion.div
						key={image.id}
						initial={{ opacity: 0, scale: 0.8 }}
						animate={{ opacity: 1, scale: 1 }}
						exit={{ opacity: 0, scale: 0.8 }}
						transition={{ duration: 0.2 }}
						className={`relative group ${compact ? 'w-12 h-12' : 'w-20 h-20'} rounded-lg overflow-hidden border border-border-primary bg-bg-3`}
					>
						<img
							src={`data:${image.mimeType};base64,${image.base64Data}`}
							alt={image.filename}
							className="w-full h-full object-cover"
						/>
						{onRemove && (
							<button
								type="button"
								onClick={() => onRemove(image.id)}
								className="absolute top-1 right-1 p-0.5 rounded-full bg-bg-1/90 hover:bg-bg-1 text-text-primary opacity-0 group-hover:opacity-100 transition-opacity"
								aria-label={`Remove ${image.filename}`}
							>
								<X className="size-3" />
							</button>
						)}
						{!compact && (
							<div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-bg-1/90 to-transparent p-1">
								<p className="text-[10px] text-text-secondary truncate">
									{image.filename}
								</p>
							</div>
						)}
					</motion.div>
				))}
			</AnimatePresence>
		</div>
	);
}
