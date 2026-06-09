import { User, Monitor, Expand, FileDown } from 'lucide-react';
import { HeaderButton, HeaderToggleButton, HeaderDivider } from '@/components/shared/header-actions';
import type { HeaderActionsProps } from '../../core/types';

// Presentation-specific state keys
const SPEAKER_MODE_KEY = 'speakerMode';
const PREVIEW_MODE_KEY = 'previewMode';

export function PresentationHeaderActions({
	previewRef,
	featureState,
	setFeatureState,
}: HeaderActionsProps) {
	const speakerMode = featureState[SPEAKER_MODE_KEY] as boolean | undefined;
	const previewMode = featureState[PREVIEW_MODE_KEY] as boolean | undefined;

	const handleToggleSpeakerMode = () => {
		const newValue = !speakerMode;
		setFeatureState(SPEAKER_MODE_KEY, newValue);
		// Speaker mode and preview mode are mutually exclusive
		if (newValue) {
			setFeatureState(PREVIEW_MODE_KEY, false);
		}
	};

	const handleTogglePreviewMode = () => {
		const newValue = !previewMode;
		setFeatureState(PREVIEW_MODE_KEY, newValue);
		// Speaker mode and preview mode are mutually exclusive
		if (newValue) {
			setFeatureState(SPEAKER_MODE_KEY, false);
		}
	};

	const handleFullscreen = () => {
		previewRef.current?.requestFullscreen();
	};

	const handleExportPdf = () => {
		// PDF export via Reveal.js print stylesheet
		const iframe = previewRef.current;
		if (!iframe?.contentWindow) return;

		// Navigate iframe to print view
		const currentSrc = iframe.src;
		const printUrl = currentSrc.includes('?')
			? `${currentSrc}&print-pdf`
			: `${currentSrc}?print-pdf`;

		// Open print view in new window for PDF export
		window.open(printUrl, '_blank');
	};

	return (
		<>
			<HeaderToggleButton
				icon={User}
				label="Speaker"
				onClick={handleToggleSpeakerMode}
				title="Speaker Mode (with notes and preview)"
				active={speakerMode}
			/>

			<HeaderToggleButton
				icon={Monitor}
				label="Preview"
				onClick={handleTogglePreviewMode}
				title="Preview Mode (current and next slide)"
				active={previewMode}
			/>

			<HeaderButton
				icon={Expand}
				onClick={handleFullscreen}
				title="Fullscreen"
				iconOnly
			/>

			<HeaderDivider />

			<HeaderButton
				icon={FileDown}
				label="Export PDF"
				onClick={handleExportPdf}
				title="Export presentation as PDF"
			/>
		</>
	);
}
