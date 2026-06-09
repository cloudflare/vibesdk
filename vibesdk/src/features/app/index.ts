/**
 * App Feature Module
 */

import type { ViewDefinition } from '@/api-types';
import type { FeatureModule } from '../core/types';
import { AppPreview } from './components/AppPreview';
import { AppHeaderActions } from './components/AppHeaderActions';

const APP_VIEWS: ViewDefinition[] = [
	{
		id: 'editor',
		label: 'Code',
		iconName: 'Code2',
		tooltip: 'View and edit source code',
	},
	{
		id: 'preview',
		label: 'Preview',
		iconName: 'Eye',
		tooltip: 'Live preview of your app',
	},
	{
		id: 'blueprint',
		label: 'Blueprint',
		iconName: 'Workflow',
		tooltip: 'View project blueprint',
	},
	{
		id: 'terminal',
		label: 'Terminal',
		iconName: 'Terminal',
		tooltip: 'Command line interface',
	},
];

const appFeatureModule: FeatureModule = {
	id: 'app',

	getViews(): ViewDefinition[] {
		return APP_VIEWS;
	},

	PreviewComponent: AppPreview,

	HeaderActionsComponent: AppHeaderActions,

	onActivate(context) {
		console.log('[AppFeature] Activated for project:', context.projectType);
	},

	onDeactivate(context) {
		console.log('[AppFeature] Deactivated from project:', context.projectType);
	},
};

export default appFeatureModule;
