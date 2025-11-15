import type { RefObject } from 'react';
import { GitBranch, Github, Expand } from 'lucide-react';
import { ModelConfigInfo } from './model-config-info';
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
}

export function PreviewHeaderActions({
	modelConfigs,
	onRequestConfigs,
	loadingConfigs,
	onGitCloneClick,
	isGitHubExportReady,
	onGitHubExportClick,
	previewRef,
}: PreviewHeaderActionsProps) {
	return (
		<>
			<ModelConfigInfo
				configs={modelConfigs}
				onRequestConfigs={onRequestConfigs}
				loading={loadingConfigs}
			/>
			<button
				className="group relative flex items-center gap-1.5 p-1.5 group-hover:pl-2 group-hover:pr-2.5 rounded-full group-hover:rounded-md transition-all duration-300 ease-in-out hover:bg-bg-4 border border-transparent hover:border-border-primary hover:shadow-sm overflow-hidden"
				onClick={onGitCloneClick}
				title="Clone to local machine"
			>
				<GitBranch className="size-3.5 text-text-primary/60 group-hover:text-brand-primary transition-colors duration-300" />
				<span className="max-w-0 group-hover:max-w-xs overflow-hidden whitespace-nowrap transition-all duration-300 ease-in-out text-xs text-text-primary/80 group-hover:text-text-primary">
					Clone
				</span>
			</button>

			{isGitHubExportReady && (
				<button
					className="group relative flex items-center gap-1.5 p-1.5 group-hover:pl-2 group-hover:pr-2.5 rounded-full group-hover:rounded-md transition-all duration-300 ease-in-out hover:bg-bg-4 border border-transparent hover:border-border-primary hover:shadow-sm overflow-hidden"
					onClick={onGitHubExportClick}
					title="Export to GitHub"
				>
					<Github className="size-3.5 text-text-primary/60 group-hover:text-brand-primary transition-colors duration-300" />
					<span className="max-w-0 group-hover:max-w-xs overflow-hidden whitespace-nowrap transition-all duration-300 ease-in-out text-xs text-text-primary/80 group-hover:text-text-primary">
						GitHub
					</span>
				</button>
			)}

			<button
				className="p-1.5 rounded-full transition-all duration-300 ease-in-out hover:bg-bg-4 border border-transparent hover:border-border-primary hover:shadow-sm"
				onClick={() => {
					previewRef.current?.requestFullscreen();
				}}
				title="Fullscreen"
			>
				<Expand className="size-3.5 text-text-primary/60 hover:text-brand-primary transition-colors duration-300" />
			</button>
		</>
	);
}
