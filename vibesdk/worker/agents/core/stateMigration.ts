import { AgentState, FileState } from './state';
import { StructuredLogger } from '../../logger';
import { TemplateDetails } from 'worker/services/sandbox/sandboxTypes';
import { generateNanoId } from '../../utils/idGenerator';
import { generateProjectName } from '../utils/templateCustomizer';
import { MAX_AGENT_QUERY_LENGTH } from 'worker/api/controllers/agent/types';
import type { InferenceMetadata } from '../inferutils/config.types';

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
    inferenceContext?: unknown;
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

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
}

function extractInferenceMetadata(value: unknown): InferenceMetadata | null {
    if (!isRecord(value)) return null;

    const agentId = value.agentId;
    const userId = value.userId;
    if (typeof agentId !== 'string' || agentId.trim() === '') return null;
    if (typeof userId !== 'string' || userId.trim() === '') return null;

    return { agentId, userId };
}

export class StateMigration {
    static migrateCommon(state: AgentState): AgentState | null {
        const stateRecord = state as unknown as Record<string, unknown>;

        // Check if we already have valid metadata
        if (state.metadata?.agentId && state.metadata?.userId) {
            return null; // No migration needed
        }

        // Try to extract from legacy inferenceContext
        const hasLegacyInferenceContext = hasField(state, 'inferenceContext');
        if (hasLegacyInferenceContext) {
            const rawInferenceContext = stateRecord.inferenceContext;
            const extractedMetadata = extractInferenceMetadata(rawInferenceContext);

            if (extractedMetadata) {
                // Create new state with migrated metadata
                const nextStateRecord: Record<string, unknown> = {
                    ...stateRecord,
                    metadata: extractedMetadata,
                };
                // Remove the old inferenceContext field
                delete nextStateRecord.inferenceContext;

                return nextStateRecord as unknown as AgentState;
            }
        }

        return null; // No migration possible
    }

    // Mostly for phasic behavior
    static migratePhasic(state: AgentState, logger: StructuredLogger): AgentState | null {
        let needsMigration = false;
        const stateRecord = state as unknown as Record<string, unknown>;

        // If the query is too long, truncate it to avoid performance issues
        if (state.query && state.query.length > MAX_AGENT_QUERY_LENGTH) {
            logger.warn("Large prompt detected. Truncating query to avoid performance issues");
            state.query = state.query.slice(0, MAX_AGENT_QUERY_LENGTH);
            needsMigration = true;
        }

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
            logger.info('Migrating state: schema format fixes and legacy field cleanup', {
                generatedFilesCount: Object.keys(migratedFilesMap).length,
            });

            const nextStateRecord: Record<string, unknown> = {
                ...stateRecord,
                behaviorType: migratedBehaviorType,
                projectType: migratedProjectType,
                generatedFilesMap: migratedFilesMap,
                projectUpdatesAccumulator: migratedProjectUpdatesAccumulator,
                templateName: migratedTemplateName,
                projectName: migratedProjectName,
            };

            const newState = nextStateRecord as unknown as AgentState;

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
