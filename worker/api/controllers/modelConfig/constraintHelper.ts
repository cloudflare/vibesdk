import { AGENT_CONSTRAINTS } from '../../../agents/inferutils/config';
import { AgentActionKey, AIModels } from '../../../agents/inferutils/config.types';
import { isValidAIModel } from '../../../agents/inferutils/config.types';

export interface ConstraintValidationResult {
	valid: boolean;
	constraintEnabled: boolean;
	allowedModels?: AIModels[];
}

/**
 * Validates if a model is allowed for an agent action based on constraints.
 * Returns valid=true if no constraint exists or constraint is disabled (graceful default).
 *
 * @param agentAction - The agent operation key
 * @param modelName - The model name to validate
 * @returns Validation result with allowed models if constraint violated
 */
export function validateAgentConstraints(
	agentAction: AgentActionKey,
	modelName: string
): ConstraintValidationResult {
	const constraint = AGENT_CONSTRAINTS.get(agentAction);

	// Graceful: No constraint or disabled = always valid
	if (!constraint || !constraint.enabled) {
		return { valid: true, constraintEnabled: false };
	}

	// Validate model name is a valid AIModels enum value
	if (!isValidAIModel(modelName)) {
		return {
			valid: false,
			constraintEnabled: true,
			allowedModels: Array.from(constraint.allowedModels),
		};
	}

	const isAllowed = constraint.allowedModels.has(modelName);

	return {
		valid: isAllowed,
		constraintEnabled: true,
		allowedModels: isAllowed ? undefined : Array.from(constraint.allowedModels),
	};
}

/**
 * Filters available models based on agent constraints.
 * Returns all models if no constraint exists or constraint is disabled.
 *
 * @param agentAction - The agent operation key
 * @param allAvailableModels - All models the user has access to
 * @returns Filtered list of models allowed for this agent action
 */
export function getFilteredModelsForAgent(
	agentAction: AgentActionKey,
	allAvailableModels: AIModels[]
): AIModels[] {
	const constraint = AGENT_CONSTRAINTS.get(agentAction);

	// Graceful: No constraint or disabled = return all
	if (!constraint || !constraint.enabled) {
		return allAvailableModels;
	}

	// Filter: intersection of available AND allowed
	return allAvailableModels.filter((model) => constraint.allowedModels.has(model));
}
