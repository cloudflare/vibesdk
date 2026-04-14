/**
 * Mobile Feature Module
 *
 * Expo React Native mobile app support with QR code preview for Expo Go.
 */

import type { ViewDefinition } from '@/api-types';
import type { FeatureModule } from '../core/types';
import { MobilePreview } from '../app/components/MobilePreview';
import { MobileHeaderActions } from './components/MobileHeaderActions';

const MOBILE_VIEWS: ViewDefinition[] = [
	{
		id: 'editor',
		label: 'Code',
		iconName: 'Code2',
		tooltip: 'View and edit source code',
	},
	{
		id: 'preview',
		label: 'Preview',
		iconName: 'Smartphone',
		tooltip: 'Mobile preview with QR code',
	},
	{
		id: 'blueprint',
		label: 'Blueprint',
		iconName: 'Workflow',
		tooltip: 'View project blueprint',
	},
];

const mobileFeatureModule: FeatureModule = {
	id: 'mobile',

	getViews(): ViewDefinition[] {
		return MOBILE_VIEWS;
	},

	PreviewComponent: MobilePreview,

	HeaderActionsComponent: MobileHeaderActions,

	onActivate(context) {
		console.log('[MobileFeature] Activated for project:', context.projectType);
	},

	onDeactivate(context) {
		console.log('[MobileFeature] Deactivated from project:', context.projectType);
	},
};

export default mobileFeatureModule;
