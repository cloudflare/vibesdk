import type { ViewDefinition } from '@/api-types';
import type { FeatureModule, FeatureContext } from '../core/types';

// General projects don't have a preview - show a placeholder
function GeneralPreview({ className }: { className?: string }) {
	return (
		<div className={`${className ?? ''} flex items-center justify-center bg-bg-3 border border-text/10 rounded-lg`}>
			<div className="text-center p-8">
				<p className="text-text-primary/70 text-sm">
					This project type does not have a live preview.
					<br />
					View the generated code in the Editor tab.
				</p>
			</div>
		</div>
	);
}

const GENERAL_VIEWS: ViewDefinition[] = [
	{
		id: 'editor',
		label: 'Code',
		iconName: 'Code2',
		tooltip: 'View and edit code',
	},
	{
		id: 'docs',
		label: 'Docs',
		iconName: 'FileText',
		tooltip: 'View documentation',
	},
];

const generalFeatureModule: FeatureModule = {
	id: 'general',

	getViews(): ViewDefinition[] {
		return GENERAL_VIEWS;
	},

	PreviewComponent: GeneralPreview,

	onActivate(context: FeatureContext) {
		console.log('[GeneralFeature] Activated for project:', context.projectType);
	},

	onDeactivate(context: FeatureContext) {
		console.log('[GeneralFeature] Deactivated from project:', context.projectType);
	},
};

export default generalFeatureModule;
