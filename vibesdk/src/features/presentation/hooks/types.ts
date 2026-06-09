import type { FileType, TemplateDetails } from '@/api-types';
import { WebSocket } from 'partysocket';

export interface SlideInfo {
	index: number;
	fileName: string;
	filePath: string;
}

export interface PresentationPreviewProps {
	previewUrl: string;
	className?: string;
	shouldRefreshPreview?: boolean;
	manualRefreshTrigger?: number;
	webSocket?: WebSocket | null;
	speakerMode?: boolean;
	previewMode?: boolean;
	allFiles?: FileType[];
	templateDetails?: TemplateDetails | null;
}

export interface PresentationTimestamps {
	global: number;
	main: number;
	slides: Record<number, number>;
}

export interface PresentationState {
    currentSlideIndex: number;
    setCurrentSlideIndex: (index: number) => void;
    timestamps: PresentationTimestamps;
    generatingSlides: Set<string>;
    failedIframes: Set<number>;
    setFailedIframes: React.Dispatch<React.SetStateAction<Set<number>>>;
}
