import { AgentState, FileState } from './state';
import { StructuredLogger } from '../../logger';
import { TemplateDetails } from 'worker/services/sandbox/sandboxTypes';
import { generateNanoId } from '../../utils/idGenerator';
import { generateProjectName } from '../utils/templateCustomizer';

// Type guards for legacy state detection
type LegacyFileFormat = {
    file_path?: string;
    file_contents?: string;
    file_purpose?: string;
};

type StateWithDeprecatedFields = AgentState & {
    latestScreenshot?: unknown;
    templateDetails?: TemplateDetails;
    agentMode?: string;
};

function hasLegacyFileFormat(file: unknown): file is LegacyFileFormat {
    if (typeof file !== 'object' || file === null) return false;
    return 'file_path' in file || 'file_contents' in file || 'file_purpose' in file;
}

function hasField<K extends string>(state: AgentState, key: K): state is AgentState & Record<K, unknown> {
    return key in state;
}

function isStateWithTemplateDetails(state: AgentState): state is StateWithDeprecatedFields & { templateDetails: TemplateDetails } {
    return 'templateDetails' in state;
}

function isStateWithAgentMode(state: AgentState): state is StateWithDeprecatedFields & { agentMode: string } {
    return 'agentMode' in state;
}

export class StateMigration {
    static migrateIfNeeded(state: AgentState, logger: StructuredLogger): AgentState | null {
        let needsMigration = false;
        
        //------------------------------------------------------------------------------------
        // Migrate files from old schema
        //------------------------------------------------------------------------------------
        const migrateFile = (file: FileState | unknown): FileState => {
            if (hasLegacyFileFormat(file)) {
                return {
                    filePath: (file as FileState).filePath || file.file_path || '',
                    fileContents: (file as FileState).fileContents || file.file_contents || '',
                    filePurpose: (file as FileState).filePurpose || file.file_purpose || '',
                    lastDiff: (file as FileState).lastDiff || '',
                };
            }
            return file as FileState;
        };

        const migratedFilesMap: Record<string, FileState> = {};
        for (const [key, file] of Object.entries(state.generatedFilesMap)) {
            const migratedFile = migrateFile(file);
            
            migratedFilesMap[key] = {
                ...migratedFile,
            };
            
            if (migratedFile !== file) {
                needsMigration = true;
            }
        }

        //------------------------------------------------------------------------------------
        // Migrate inference context from old schema
        //------------------------------------------------------------------------------------
        let migratedInferenceContext = state.inferenceContext;
        if (migratedInferenceContext && 'userApiKeys' in migratedInferenceContext) {
            migratedInferenceContext = {
                ...migratedInferenceContext
            };
            
            // Remove the deprecated field using type assertion
            const contextWithLegacyField = migratedInferenceContext as unknown as Record<string, unknown>;
            delete contextWithLegacyField.userApiKeys;
            needsMigration = true;
        }

        //------------------------------------------------------------------------------------
        // Migrate deprecated props
        //------------------------------------------------------------------------------------  
        const stateHasDeprecatedProps = hasField(state, 'latestScreenshot');
        if (stateHasDeprecatedProps) {
            needsMigration = true;
        }

        const stateHasProjectUpdatesAccumulator = hasField(state, 'projectUpdatesAccumulator');
        if (!stateHasProjectUpdatesAccumulator) {
            needsMigration = true;
        }

        //------------------------------------------------------------------------------------
        // Migrate templateDetails -> templateName
        //------------------------------------------------------------------------------------
        let migratedTemplateName = state.templateName;
        const hasTemplateDetails = isStateWithTemplateDetails(state);
        if (hasTemplateDetails) {
            migratedTemplateName = state.templateDetails.name;
            needsMigration = true;
            logger.info('Migrating templateDetails to templateName', { templateName: migratedTemplateName });
        }

        //------------------------------------------------------------------------------------
        // Migrate projectName -> generate if missing
        //------------------------------------------------------------------------------------
        let migratedProjectName = state.projectName;
        if (!state.projectName) {
            // Generate project name for older apps
            migratedProjectName = generateProjectName(
                state.blueprint?.projectName || migratedTemplateName || state.query,
                generateNanoId(),
                20
            );
            needsMigration = true;
            logger.info('Generating missing projectName', { projectName: migratedProjectName });
        }

        let migratedProjectType = state.projectType;
        const hasProjectType = hasField(state, 'projectType');
        if (!hasProjectType || migratedProjectType !== 'app' && migratedProjectType !== 'presentation' && migratedProjectType !== 'general' && migratedProjectType !== 'workflow') {
            migratedProjectType = 'app';
            needsMigration = true;
            logger.info('Adding default projectType for legacy state', { projectType: migratedProjectType });
        }

        let migratedBehaviorType = state.behaviorType;
        const stateRecord = state as unknown as Record<string, unknown>;
        const rawBehaviorType = stateRecord.behaviorType;
        const hasValidBehaviorType = rawBehaviorType === 'phasic' || rawBehaviorType === 'agentic';

        if (!hasField(state, 'behaviorType') || !hasValidBehaviorType) {
            migratedBehaviorType = 'phasic';
            needsMigration = true;
            logger.info('Adding default behaviorType for legacy state', { behaviorType: migratedBehaviorType });
        }

        if (isStateWithAgentMode(state)) {
            migratedBehaviorType = state.agentMode === 'smart' ? 'agentic' : 'phasic';
            needsMigration = true;
            logger.info('Migrating agentMode to behaviorType', {
                oldMode: state.agentMode,
                newType: migratedBehaviorType,
            });
        }

        const migratedProjectUpdatesAccumulator = stateHasProjectUpdatesAccumulator && Array.isArray((stateRecord as Record<string, unknown>).projectUpdatesAccumulator)
            ? (stateRecord.projectUpdatesAccumulator as string[])
            : [];

        if (needsMigration) {
            logger.info('Migrating state: schema format, conversation cleanup, security fixes, and bootstrap setup', {
                generatedFilesCount: Object.keys(migratedFilesMap).length,
                removedUserApiKeys: state.inferenceContext && 'userApiKeys' in state.inferenceContext,
            });

            const newState: AgentState = {
                ...state,
                behaviorType: migratedBehaviorType,
                projectType: migratedProjectType,
                generatedFilesMap: migratedFilesMap,
                inferenceContext: migratedInferenceContext,
                projectUpdatesAccumulator: migratedProjectUpdatesAccumulator,
                templateName: migratedTemplateName,
                projectName: migratedProjectName,
            } as AgentState;

            const stateWithDeprecated = newState as StateWithDeprecatedFields;
            if (stateHasDeprecatedProps) {
                delete stateWithDeprecated.latestScreenshot;
            }
            if (hasTemplateDetails) {
                delete stateWithDeprecated.templateDetails;
            }
            if (isStateWithAgentMode(state)) {
                delete stateWithDeprecated.agentMode;
            }

            return newState;
        }

        return null;
    }
}
