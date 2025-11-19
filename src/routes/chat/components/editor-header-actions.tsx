import type { RefObject } from 'react';
import { GitBranch, Github, Expand } from 'lucide-react';
import { ModelConfigInfo } from './model-config-info';
import { HeaderButton } from './header-actions';
import type { ModelConfigsInfo } from '@/api-types';

interface EditorHeaderActionsProps {
	modelConfigs?: ModelConfigsInfo;
	onRequestConfigs: () => void;
	loadingConfigs: boolean;
	onGitCloneClick: () => void;
	isGitHubExportReady: boolean;
	onGitHubExportClick: () => void;
	editorRef: RefObject<HTMLDivElement | null>;
}

export function EditorHeaderActions({
	modelConfigs,
	onRequestConfigs,
	loadingConfigs,
	onGitCloneClick,
	isGitHubExportReady,
	onGitHubExportClick,
	editorRef,
}: EditorHeaderActionsProps) {
	return (
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
				onClick={() => editorRef.current?.requestFullscreen()}
				title="Fullscreen"
				iconOnly
			/>
		</>
	);
}
