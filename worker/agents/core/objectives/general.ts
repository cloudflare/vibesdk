import { ProjectObjective } from './base';
import { BaseProjectState } from '../state';
import { ProjectType, RuntimeType, ExportResult, ExportOptions, DeployResult, DeployOptions } from '../types';
import type { AgentInfrastructure } from '../AgentCore';

export class GeneralObjective<TState extends BaseProjectState = BaseProjectState>
    extends ProjectObjective<TState> {

    constructor(infrastructure: AgentInfrastructure<TState>) {
        super(infrastructure);
    }

    getType(): ProjectType {
        return 'general';
    }

    getRuntime(): RuntimeType {
        // No runtime assumed; agentic behavior will initialize slides/app runtime if needed
        return 'none';
    }

    needsTemplate(): boolean {
        return false;
    }

    getTemplateType(): string | null {
        return null; // scratch
    }

    async deploy(_options?: DeployOptions): Promise<DeployResult> {
        return { success: false, target: 'platform', error: 'Deploy not applicable for general projects. Use tools to initialize a runtime first.' };
    }

    async export(_options: ExportOptions): Promise<ExportResult> {
        return { success: false, error: 'Export not applicable for general projects.' };
    }
}

