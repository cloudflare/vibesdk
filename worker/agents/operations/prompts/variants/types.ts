import { ProjectType } from "../../../core/types";

export type PromptVariant = 'presentation' | 'browser' | 'browser-generate-only' | 'interactive';

export interface PromptSections {
	coreIdentity: string;
	criticalRules: string;
	architecture: string;
	workflow: string;
	toolPatterns: string;
	fileOpsNote: string;
	deploymentTools: string;
	designRequirements: string;
	qualityStandards: string;
	examples: string;
	fileOpsTools: string;
}

export function selectVariant(
	projectType: ProjectType,
	renderMode?: 'sandbox' | 'browser',
	operationalMode?: 'initial' | 'followup'
): PromptVariant {
	if (projectType === 'presentation') return 'presentation';
	if (renderMode === 'browser') {
		return operationalMode === 'followup' ? 'browser' : 'browser-generate-only';
	}
	return 'interactive';
}
