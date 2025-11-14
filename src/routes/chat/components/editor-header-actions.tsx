import type { RefObject } from 'react';
import { Expand } from 'lucide-react';
import { ModelConfigInfo } from './model-config-info';
import type { ModelConfigsInfo } from '@/api-types';

interface EditorHeaderActionsProps {
	modelConfigs?: ModelConfigsInfo;
	onRequestConfigs: () => void;
	loadingConfigs: boolean;
	editorRef: RefObject<HTMLDivElement | null>;
}

export function EditorHeaderActions({
	modelConfigs,
	onRequestConfigs,
	loadingConfigs,
	editorRef,
}: EditorHeaderActionsProps) {
	return (
		<>
			<ModelConfigInfo
				configs={modelConfigs}
				onRequestConfigs={onRequestConfigs}
				loading={loadingConfigs}
			/>
			<button
				className="p-1.5 rounded-full transition-all duration-300 ease-in-out hover:bg-bg-4 border border-transparent hover:border-border-primary hover:shadow-sm"
				onClick={() => {
					editorRef.current?.requestFullscreen();
				}}
				title="Fullscreen"
			>
				<Expand className="size-3.5 text-text-primary/60 hover:text-brand-primary transition-colors duration-300" />
			</button>
		</>
	);
}
