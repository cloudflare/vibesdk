/**
 * Presentation Feature Module
 *
 * Feature module for slide presentation projects
 */

import type { ViewDefinition } from '@/api-types';
import type { FeatureModule, FeatureContext } from '../core/types';
import type { FileType, TemplateDetails } from '@/api-types';
import { PresentationPreview } from './components/PresentationPreview';
import { PresentationHeaderActions } from './components/PresentationHeaderActions';

const PRESENTATION_VIEWS: ViewDefinition[] = [
	{
		id: 'preview',
		label: 'Preview',
		iconName: 'Presentation',
		tooltip: 'View presentation slides',
	},
	{
		id: 'editor',
		label: 'Code',
		iconName: 'Code2',
		tooltip: 'Edit slide source code',
	},
	{
		id: 'docs',
		label: 'Docs',
		iconName: 'FileText',
		tooltip: 'View documentation',
	},
];

/**
 * Filter out demo slides from file list when viewing user's actual presentation.
 * Demo slides have paths like 'public/slides/demo-slide*.json' or similar patterns.
 */
function filterDemoSlides(files: FileType[], templateDetails?: TemplateDetails | null): FileType[] {
	const slideDir = templateDetails?.slideDirectory || 'public/slides';
	const slideDirPrefix = `${slideDir}/`;

	return files
		.filter((file) => {
			// Exclude demo-slide*.json files
			if (file.filePath.startsWith(slideDirPrefix) &&
				file.filePath.includes('/demo-slide') &&
				file.filePath.endsWith('.json')) {
				return false;
			}
			return true;
		})
		.map((file) => {
			// Clean demo slides from manifest.json
			if (file.filePath === `${slideDir}/manifest.json` && file.fileContents) {
				try {
					const manifest = JSON.parse(file.fileContents);
					if (Array.isArray(manifest.slides)) {
						const filtered = manifest.slides.filter(
							(name: string) => !name.startsWith('demo-slide')
						);
						if (filtered.length !== manifest.slides.length) {
							return {
								...file,
								fileContents: JSON.stringify({ ...manifest, slides: filtered }, null, 2),
							};
						}
					}
				} catch {
					// Invalid JSON, return as-is
				}
			}
			return file;
		});
}

const presentationFeatureModule: FeatureModule = {
	id: 'presentation',

	getViews(): ViewDefinition[] {
		return PRESENTATION_VIEWS;
	},

	PreviewComponent: PresentationPreview,

	HeaderActionsComponent: PresentationHeaderActions,

	processFiles(files: FileType[], templateDetails?: TemplateDetails | null): FileType[] {
		return filterDemoSlides(files, templateDetails);
	},

	onActivate(context: FeatureContext) {
		console.log('[PresentationFeature] Activated for project:', context.projectType);
	},

	onDeactivate(context: FeatureContext) {
		console.log('[PresentationFeature] Deactivated from project:', context.projectType);
	},
};

export default presentationFeatureModule;
