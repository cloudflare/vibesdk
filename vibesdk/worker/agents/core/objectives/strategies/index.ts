import type { ProjectType } from '../../types';
import type { AdditionalExportStrategy } from './types';
import { PresentationExportStrategy } from './presentation';

export function getAdditionalExportStrategy(
	projectType: ProjectType,
): AdditionalExportStrategy | null {
	switch (projectType) {
		case 'presentation':
			return new PresentationExportStrategy();
		default:
			return null;
	}
}

export type { AdditionalExportStrategy, ExportContext } from './types';
