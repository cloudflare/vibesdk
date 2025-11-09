import { AgentState, FileState } from './state';
import { StructuredLogger } from '../../logger';
import { TemplateDetails } from 'worker/services/sandbox/sandboxTypes';
import { generateNanoId } from '../../utils/idGenerator';
import { generateProjectName } from '../utils/templateCustomizer';

export class StateMigration {
    static migrateIfNeeded(state: AgentState, logger: StructuredLogger): AgentState | null {
        let needsMigration = false;
        const legacyState = state as unknown as Record<string, unknown>;
        
        //------------------------------------------------------------------------------------
        // Migrate files from old schema
        //------------------------------------------------------------------------------------
        const migrateFile = (file: any): any => {
            const hasOldFormat = 'file_path' in file || 'file_contents' in file || 'file_purpose' in file;
            
            if (hasOldFormat) {
                return {
                    filePath: file.filePath || file.file_path,
                    fileContents: file.fileContents || file.file_contents,
                    filePurpose: file.filePurpose || file.file_purpose,
                };
            }
            return file;
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
            
            delete (migratedInferenceContext as any).userApiKeys;
            needsMigration = true;
        }

        //------------------------------------------------------------------------------------
        // Migrate deprecated props
        //------------------------------------------------------------------------------------  
        const stateHasDeprecatedProps = 'latestScreenshot' in (state as any);
        if (stateHasDeprecatedProps) {
            needsMigration = true;
        }

        const stateHasProjectUpdatesAccumulator = 'projectUpdatesAccumulator' in (state as any);
        if (!stateHasProjectUpdatesAccumulator) {
            needsMigration = true;
        }

        //------------------------------------------------------------------------------------
        // Migrate templateDetails -> templateName
        //------------------------------------------------------------------------------------
        let migratedTemplateName = state.templateName;
        const hasTemplateDetails = 'templateDetails' in (state as any);
        if (hasTemplateDetails) {
            const templateDetails = (state as any).templateDetails;
            migratedTemplateName = (templateDetails as TemplateDetails).name;
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
        if (!('projectType' in legacyState) || !migratedProjectType) {
            migratedProjectType = 'app';
            needsMigration = true;
            logger.info('Adding default projectType for legacy state', { projectType: migratedProjectType });
        }

        let migratedBehaviorType = state.behaviorType;
        if ('agentMode' in legacyState) {
            const legacyAgentMode = (legacyState as { agentMode?: string }).agentMode;
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
            if (stateHasDeprecatedProps) {
                delete (newState as any).latestScreenshot;
            }
            if (hasTemplateDetails) {
                delete (newState as any).templateDetails;
            }
            if ('agentMode' in legacyState) {
                delete (newState as any).agentMode;
            }
            
            return newState;
        }

        return null;
    }
}
