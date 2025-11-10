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
        // Migrate conversations cleanups and internal memos
        //------------------------------------------------------------------------------------

        let migratedConversationMessages = state.conversationMessages;
        const MIN_MESSAGES_FOR_CLEANUP = 25;
        
        if (migratedConversationMessages && migratedConversationMessages.length > 0) {
            const originalCount = migratedConversationMessages.length;
            
            const seen = new Set<string>();
            const uniqueMessages = [];
            
            for (const message of migratedConversationMessages) {
                let key = message.conversationId;
                if (!key) {
                    const contentStr = typeof message.content === 'string' 
                        ? message.content.substring(0, 100)
                        : JSON.stringify(message.content || '').substring(0, 100);
                    key = `${message.role || 'unknown'}_${contentStr}_${Date.now()}`;
                }
                
                if (!seen.has(key)) {
                    seen.add(key);
                    uniqueMessages.push(message);
                }
            }
            
            uniqueMessages.sort((a, b) => {
                const getTimestamp = (msg: any) => {
                    if (msg.conversationId && typeof msg.conversationId === 'string' && msg.conversationId.startsWith('conv-')) {
                        const parts = msg.conversationId.split('-');
                        if (parts.length >= 2) {
                            return parseInt(parts[1]) || 0;
                        }
                    }
                    return 0;
                };
                return getTimestamp(a) - getTimestamp(b);
            });
            
            if (uniqueMessages.length > MIN_MESSAGES_FOR_CLEANUP) {
                const realConversations = [];
                const internalMemos = [];
                
                for (const message of uniqueMessages) {
                    const content = typeof message.content === 'string' ? message.content : JSON.stringify(message.content || '');
                    const isInternalMemo = content.includes('**<Internal Memo>**') || content.includes('Project Updates:');
                    
                    if (isInternalMemo) {
                        internalMemos.push(message);
                    } else {
                        realConversations.push(message);
                    }
                }
                
                logger.info('Conversation cleanup analysis', {
                    totalUniqueMessages: uniqueMessages.length,
                    realConversations: realConversations.length,
                    internalMemos: internalMemos.length,
                    willRemoveInternalMemos: uniqueMessages.length > MIN_MESSAGES_FOR_CLEANUP
                });
                
                migratedConversationMessages = realConversations;
            } else {
                migratedConversationMessages = uniqueMessages;
            }
            
            if (migratedConversationMessages.length !== originalCount) {
                logger.info('Fixed conversation message exponential bloat', {
                    originalCount,
                    deduplicatedCount: uniqueMessages.length,
                    finalCount: migratedConversationMessages.length,
                    duplicatesRemoved: originalCount - uniqueMessages.length,
                    internalMemosRemoved: uniqueMessages.length - migratedConversationMessages.length
                });
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
        if (!hasProjectType || !migratedProjectType) {
            migratedProjectType = 'app';
            needsMigration = true;
            logger.info('Adding default projectType for legacy state', { projectType: migratedProjectType });
        }

        let migratedBehaviorType = state.behaviorType;
        if (isStateWithAgentMode(state)) {
            const legacyAgentMode = state.agentMode;
            const nextBehaviorType = legacyAgentMode === 'smart' ? 'agentic' : 'phasic';
            if (nextBehaviorType !== migratedBehaviorType) {
                migratedBehaviorType = nextBehaviorType;
                needsMigration = true;
            }
            logger.info('Migrating behaviorType from agentMode', {
                legacyAgentMode,
                behaviorType: migratedBehaviorType
            });
        }

        if (needsMigration) {
            logger.info('Migrating state: schema format, conversation cleanup, security fixes, and bootstrap setup', {
                generatedFilesCount: Object.keys(migratedFilesMap).length,
                finalConversationCount: migratedConversationMessages?.length || 0,
                removedUserApiKeys: state.inferenceContext && 'userApiKeys' in state.inferenceContext,
            });
            
            const newState: AgentState = {
                ...state,
                generatedFilesMap: migratedFilesMap,
                conversationMessages: migratedConversationMessages,
                inferenceContext: migratedInferenceContext,
                projectUpdatesAccumulator: [],
                templateName: migratedTemplateName,
                projectName: migratedProjectName,
                projectType: migratedProjectType,
                behaviorType: migratedBehaviorType
            } as AgentState;
            
            // Remove deprecated fields
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
