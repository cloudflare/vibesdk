import type { ExportOptions, ExportResult } from '../../types';
import type { AdditionalExportStrategy, ExportContext } from './types';

const SUPPORTED_KINDS = ['pdf', 'pptx', 'googleslides'] as const;

export class PresentationExportStrategy implements AdditionalExportStrategy {
	getSupportedKinds(): ExportOptions['kind'][] {
		return [...SUPPORTED_KINDS];
	}

	async export(options: ExportOptions, ctx: ExportContext): Promise<ExportResult> {
		ctx.logger.info('Presentation export requested', { kind: options.kind });
		return {
			success: false,
			error: `${options.kind} export not yet implemented`,
		};
	}
}
