
import { SmartCodeGeneratorAgent } from './core/smartGeneratorAgent';
import { getAgentByName } from 'agents';
import { CodeGenState } from './core/state';
import { generateId } from '../utils/idGenerator';
import { StructuredLogger } from '../logger';
import { InferenceContext } from './inferutils/config.types';
import { SandboxSdkClient } from '../services/sandbox/sandboxSdkClient';
import { selectTemplate } from './planning/templateSelector';
import { TemplateDetails } from '../services/sandbox/sandboxTypes';
import { TemplateSelection } from './schemas';
import type { ImageAttachment } from '../types/image-attachment';
import { BaseSandboxService } from 'worker/services/sandbox/BaseSandboxService';

export async function getAgentStub(env: Env, agentId: string, searchInOtherJurisdictions: boolean = false, logger: StructuredLogger) : Promise<DurableObjectStub<SmartCodeGeneratorAgent>> {
    if (searchInOtherJurisdictions) {
        // Try multiple jurisdictions until we find the agent
        const jurisdictions = [undefined, 'eu' as DurableObjectJurisdiction];
        for (const jurisdiction of jurisdictions) {
            try {
                logger.info(`Agent ${agentId} retreiving from jurisdiction ${jurisdiction}`);
                const stub = await getAgentByName<Env, SmartCodeGeneratorAgent>(env.CodeGenObject, agentId, {
                    locationHint: 'enam',
                    jurisdiction: jurisdiction,
                });
                const isInitialized = await stub.isInitialized()
                if (isInitialized) {
                    logger.info(`Agent ${agentId} found in jurisdiction ${jurisdiction}`);
                    return stub
                }
            } catch (error) {
                logger.info(`Agent ${agentId} not found in jurisdiction ${jurisdiction}`);
            }
        }
        // If all jurisdictions fail, throw an error
        // throw new Error(`Agent ${agentId} not found in any jurisdiction`);
    }
    logger.info(`Agent ${agentId} retrieved directly`);
    return getAgentByName<Env, SmartCodeGeneratorAgent>(env.CodeGenObject, agentId, {
        locationHint: 'enam'
    });
}

export async function getAgentState(env: Env, agentId: string, searchInOtherJurisdictions: boolean = false, logger: StructuredLogger) : Promise<CodeGenState> {
    const agentInstance = await getAgentStub(env, agentId, searchInOtherJurisdictions, logger);
    return await agentInstance.getFullState() as CodeGenState;
}

export async function cloneAgent(env: Env, agentId: string, logger: StructuredLogger) : Promise<{newAgentId: string, newAgent: DurableObjectStub<SmartCodeGeneratorAgent>}> {
    const agentInstance = await getAgentStub(env, agentId, true, logger);
    if (!agentInstance || !await agentInstance.isInitialized()) {
        throw new Error(`Agent ${agentId} not found`);
    }
    const newAgentId = generateId();

    const newAgent = await getAgentStub(env, newAgentId, false, logger);
    const originalState = await agentInstance.getFullState() as CodeGenState;
    const newState = {
        ...originalState,
        sessionId: newAgentId,
        sandboxInstanceId: undefined,
        pendingUserInputs: [],
        currentDevState: 0,
        generationPromise: undefined,
        shouldBeGenerating: false,
        // latestScreenshot: undefined,
        clientReportedErrors: [],
    };

    await newAgent.setState(newState);
    return {newAgentId, newAgent};
}

export async function getTemplateForQuery(
    env: Env,
    inferenceContext: InferenceContext,
    query: string,
    images: ImageAttachment[] | undefined,
    logger: StructuredLogger,
) : Promise<{templateDetails: TemplateDetails, selection: TemplateSelection}> {
    // Fetch available templates
    const templatesResponse = await SandboxSdkClient.listTemplates();
    if (!templatesResponse || !templatesResponse.success) {
        throw new Error(`Failed to fetch templates from sandbox service, ${templatesResponse.error}`);
    }
        
    const analyzeQueryResponse = await selectTemplate({
        env,
        inferenceContext,
        query,
        availableTemplates: templatesResponse.templates,
        images,
    });
    
    logger.info('Selected template', { selectedTemplate: analyzeQueryResponse });
            
    if (!analyzeQueryResponse.selectedTemplateName) {
        logger.error('No suitable template found for code generation');
        throw new Error('No suitable template found for code generation');
    }
            
    const selectedTemplate = templatesResponse.templates.find(template => template.name === analyzeQueryResponse.selectedTemplateName);
    if (!selectedTemplate) {
        logger.error('Selected template not found');
        throw new Error('Selected template not found');
    }
    const templateDetailsResponse = await BaseSandboxService.getTemplateDetails(selectedTemplate.name);
    if (!templateDetailsResponse.success || !templateDetailsResponse.templateDetails) {
        logger.error('Failed to fetch files', { templateDetailsResponse });
        throw new Error('Failed to fetch files');
    }
            
    const templateDetails = templateDetailsResponse.templateDetails;
    return { templateDetails, selection: analyzeQueryResponse };
}