import type { ReactNode } from 'react';
import { ViewModeSwitch } from './view-mode-switch';
import { HEADER_STYLES } from './view-header-styles';
import type { ProjectType } from '@/api-types';

interface ViewHeaderProps {
	view: 'preview' | 'editor' | 'docs' | 'blueprint' | 'presentation';
	onViewChange: (mode: 'preview' | 'editor' | 'docs' | 'blueprint' | 'presentation') => void;
	previewAvailable: boolean;
	showTooltip: boolean;
	hasDocumentation: boolean;
	previewUrl?: string;
	centerContent?: ReactNode;
	rightActions?: ReactNode;
	projectType?: ProjectType;
}

export function ViewHeader({
	view,
	onViewChange,
	previewAvailable,
	showTooltip,
    hasDocumentation,
	previewUrl,
	centerContent,
	rightActions,
	projectType,
}: ViewHeaderProps) {
	return (
		<div className={`grid grid-cols-3 ${HEADER_STYLES.padding} ${HEADER_STYLES.container}`}>
			<div className="flex items-center">
				<ViewModeSwitch
					view={view}
					onChange={onViewChange}
					previewAvailable={previewAvailable}
					showTooltip={showTooltip}
					hasDocumentation={hasDocumentation}
					previewUrl={previewUrl}
					projectType={projectType}
				/>
			</div>
			<div className="flex items-center justify-center">
				{centerContent}
			</div>
			<div className="flex items-center justify-end">
				{rightActions}
			</div>
		</div>
	);
}
