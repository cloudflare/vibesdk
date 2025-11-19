import type { RefObject } from 'react';
import { GitBranch, Github, Expand, User, Monitor, FileDown } from 'lucide-react';
import { ModelConfigInfo } from './model-config-info';
import { HeaderButton, HeaderToggleButton, HeaderDivider } from './header-actions';
import type { ModelConfigsInfo } from '@/api-types';

interface PreviewHeaderActionsProps {
	modelConfigs?: ModelConfigsInfo;
	onRequestConfigs: () => void;
	loadingConfigs: boolean;
	onGitCloneClick: () => void;
	isGitHubExportReady: boolean;
	onGitHubExportClick: () => void;
	behaviorType?: 'phasic' | 'agentic';
	urlChatId?: string;
	isPhase1Complete: boolean;
	previewRef: RefObject<HTMLIFrameElement | null>;
	projectType?: string;
	speakerMode?: boolean;
	previewMode?: boolean;
	onToggleSpeakerMode?: () => void;
	onTogglePreviewMode?: () => void;
	onExportPdf?: () => void;
}

export function PreviewHeaderActions({
	modelConfigs,
	onRequestConfigs,
	loadingConfigs,
	onGitCloneClick,
	isGitHubExportReady,
	onGitHubExportClick,
	previewRef,
	projectType,
	speakerMode,
	previewMode,
	onToggleSpeakerMode,
	onTogglePreviewMode,
	onExportPdf,
}: PreviewHeaderActionsProps) {
	const isPresentation = projectType === 'presentation';

	return (
		<>
			{isPresentation ? (
				<>
					{onToggleSpeakerMode && (
						<HeaderToggleButton
							icon={User}
							label="Speaker"
							onClick={onToggleSpeakerMode}
							title="Speaker Mode (with notes and preview)"
							active={speakerMode}
						/>
					)}

					{onTogglePreviewMode && (
						<HeaderToggleButton
							icon={Monitor}
							label="Preview"
							onClick={onTogglePreviewMode}
							title="Preview Mode (current and next slide)"
							active={previewMode}
						/>
					)}

					<HeaderButton
						icon={Expand}
						onClick={() => previewRef.current?.requestFullscreen()}
						title="Fullscreen"
						iconOnly
					/>

					{onExportPdf && (
						<>
							<HeaderDivider />
							<HeaderButton
								icon={FileDown}
								label="Export PDF"
								onClick={onExportPdf}
								title="Export presentation as PDF"
							/>
						</>
					)}
				</>
			) : (
				<>
					<ModelConfigInfo
						configs={modelConfigs}
						onRequestConfigs={onRequestConfigs}
						loading={loadingConfigs}
					/>
					<HeaderButton
						icon={GitBranch}
						label="Clone"
						onClick={onGitCloneClick}
						title="Clone to local machine"
					/>
					{isGitHubExportReady && (
						<HeaderButton
							icon={Github}
							label="GitHub"
							onClick={onGitHubExportClick}
							title="Export to GitHub"
						/>
					)}
					<HeaderButton
						icon={Expand}
						onClick={() => previewRef.current?.requestFullscreen()}
						title="Fullscreen"
						iconOnly
					/>
				</>
			)}
		</>
	);
}
