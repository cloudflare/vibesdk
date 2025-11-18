import type { WebSocket } from 'partysocket';
import type { WebSocketMessage, BlueprintType, ConversationMessage } from '@/api-types';
import { deduplicateMessages, isAssistantMessageDuplicate } from './deduplicate-messages';
import { logger } from '@/utils/logger';
import { getFileType } from '@/utils/string';
import { getPreviewUrl } from '@/lib/utils';
import {
    setFileGenerating,
    appendFileChunk,
    setFileCompleted,
    setAllFilesCompleted,
    updatePhaseFileStatus,
} from './file-state-helpers';
import { 
    createAIMessage,
    handleRateLimitError,
    handleStreamingMessage,
    appendToolEvent,
    type ChatMessage,
} from './message-helpers';
import { completeStages } from './project-stage-helpers';
import { sendWebSocketMessage } from './websocket-helpers';
import type { FileType, PhaseTimelineItem } from '../hooks/use-chat';
import { toast } from 'sonner';

export interface HandleMessageDeps {
    // State setters
    setFiles: React.Dispatch<React.SetStateAction<FileType[]>>;
    setPhaseTimeline: React.Dispatch<React.SetStateAction<PhaseTimelineItem[]>>;
    setProjectStages: React.Dispatch<React.SetStateAction<any[]>>;
    setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>;
    setBlueprint: React.Dispatch<React.SetStateAction<BlueprintType | undefined>>;
    setQuery: React.Dispatch<React.SetStateAction<string | undefined>>;
    setPreviewUrl: React.Dispatch<React.SetStateAction<string | undefined>>;
    setTotalFiles: React.Dispatch<React.SetStateAction<number | undefined>>;
    setIsRedeployReady: React.Dispatch<React.SetStateAction<boolean>>;
    setIsPreviewDeploying: React.Dispatch<React.SetStateAction<boolean>>;
    setIsThinking: React.Dispatch<React.SetStateAction<boolean>>;
    setIsInitialStateRestored: React.Dispatch<React.SetStateAction<boolean>>;
    setShouldRefreshPreview: React.Dispatch<React.SetStateAction<boolean>>;
    setIsDeploying: React.Dispatch<React.SetStateAction<boolean>>;
    setCloudflareDeploymentUrl: React.Dispatch<React.SetStateAction<string>>;
    setDeploymentError: React.Dispatch<React.SetStateAction<string | undefined>>;
    setIsGenerationPaused: React.Dispatch<React.SetStateAction<boolean>>;
    setIsGenerating: React.Dispatch<React.SetStateAction<boolean>>;
    setIsPhaseProgressActive: React.Dispatch<React.SetStateAction<boolean>>;
    setRuntimeErrorCount: React.Dispatch<React.SetStateAction<number>>;
    setStaticIssueCount: React.Dispatch<React.SetStateAction<number>>;
    setIsDebugging: React.Dispatch<React.SetStateAction<boolean>>;
    
    // Current state
    isInitialStateRestored: boolean;
    blueprint: BlueprintType | undefined;
    query: string | undefined;
    bootstrapFiles: FileType[];
    files: FileType[];
    phaseTimeline: PhaseTimelineItem[];
    previewUrl: string | undefined;
    projectStages: any[];
    isGenerating: boolean;
    urlChatId: string | undefined;
    
    // Functions
    updateStage: (stageId: string, updates: any) => void;
    sendMessage: (message: ConversationMessage) => void;
    loadBootstrapFiles: (files: FileType[]) => void;
    onDebugMessage?: (
        type: 'error' | 'warning' | 'info' | 'websocket',
        message: string,
        details?: string,
        source?: string,
        messageType?: string,
        rawMessage?: unknown
    ) => void;
    onTerminalMessage?: (log: { 
        id: string; 
        content: string; 
        type: 'command' | 'stdout' | 'stderr' | 'info' | 'error' | 'warn' | 'debug'; 
        timestamp: number; 
        source?: string 
    }) => void;
}

export function createWebSocketMessageHandler(deps: HandleMessageDeps) {
    const extractTextContent = (content: ConversationMessage['content']): string => {
        if (!content) return '';
        if (typeof content === 'string') return content;
        if (Array.isArray(content)) {
            return content
                .map(c => (c && 'type' in c && c.type === 'text') ? c.text : '')
                .join(' ')
                .trim();
        }
        return '';
    };
    return (websocket: WebSocket, message: WebSocketMessage) => {
        const {
            setFiles,
            setPhaseTimeline,
            setProjectStages,
            setMessages,
            setBlueprint,
            setQuery,
            setPreviewUrl,
            setTotalFiles,
            setIsRedeployReady,
            setIsPreviewDeploying,
            setIsThinking,
            setIsInitialStateRestored,
            setShouldRefreshPreview,
            setIsDeploying,
            setCloudflareDeploymentUrl,
            setDeploymentError,
            setIsGenerationPaused,
            setIsGenerating,
            setIsPhaseProgressActive,
            setIsDebugging,
            isInitialStateRestored,
            blueprint,
            query,
            bootstrapFiles,
            files,
            phaseTimeline,
            previewUrl,
            projectStages,
            isGenerating,
            urlChatId,
            updateStage,
            sendMessage,
            loadBootstrapFiles,
            onDebugMessage,
            onTerminalMessage,
        } = deps;

        // Log messages except for frequent ones
        if (message.type !== 'file_chunk_generated' && message.type !== 'cf_agent_state' && message.type.length <= 50) {
            logger.info('received message', message.type, message);
            onDebugMessage?.('websocket', 
                `${message.type}`,
                JSON.stringify(message, null, 2),
                'WebSocket',
                message.type,
                message
            );
        }
        
        switch (message.type) {
            case 'conversation_cleared': {
                // Reset chat messages to a subtle tool-event entry indicating success
                setMessages(() => appendToolEvent([], 'conversation_cleared', {
                    name: message.message || 'conversation reset',
                    status: 'success'
                }));
                break;
            }
            case 'agent_connected': {
                const { state, templateDetails } = message;
                console.log('Agent connected', state, templateDetails);
                
                if (!isInitialStateRestored) {
                    logger.debug('📥 Performing initial state restoration');
                    
                    if (state.blueprint && !blueprint) {
                        setBlueprint(state.blueprint);
                        updateStage('blueprint', { status: 'completed' });
                    }

                    if (state.query && !query) {
                        setQuery(state.query);
                    }

                    if (templateDetails?.allFiles && bootstrapFiles.length === 0) {
                        const files = Object.entries(templateDetails.allFiles).map(([filePath, fileContents]) => ({
                            filePath,
                            fileContents,
                        })).filter((file) => templateDetails.importantFiles.includes(file.filePath));
                        logger.debug('📥 Restoring bootstrap files:', files);
                        loadBootstrapFiles(files);
                    }

                    if (state.generatedFilesMap && files.length === 0) {
                        setFiles(
                            Object.values(state.generatedFilesMap).map((file: any) => ({
                                filePath: file.filePath,
                                fileContents: file.fileContents,
                                isGenerating: false,
                                needsFixing: false,
                                hasErrors: false,
                                language: getFileType(file.filePath),
                            })),
                        );
                    }

                    if (state.generatedPhases && state.generatedPhases.length > 0 && phaseTimeline.length === 0) {
                        logger.debug('📋 Restoring phase timeline:', state.generatedPhases);
                        // If not actively generating, mark incomplete phases as cancelled (they were interrupted)
                        const isActivelyGenerating = state.shouldBeGenerating === true;
                        
                        const timeline = state.generatedPhases.map((phase: any, index: number) => {
                            // Determine phase status:
                            // - completed if explicitly marked complete
                            // - cancelled if incomplete and not actively generating (interrupted)
                            // - generating if incomplete and actively generating
                            const phaseStatus = phase.completed 
                                ? 'completed' as const 
                                : !isActivelyGenerating 
                                    ? 'cancelled' as const 
                                    : 'generating' as const;
                            
                            return {
                                id: `phase-${index}`,
                                name: phase.name,
                                description: phase.description,
                                status: phaseStatus,
                                files: phase.files.map((filesConcept: any) => {
                                    const file = state.generatedFilesMap?.[filesConcept.path];
                                    // File status:
                                    // - completed if it exists in generated files
                                    // - cancelled if missing and not actively generating (interrupted)
                                    // - generating if missing and actively generating
                                    const fileStatus = file 
                                        ? 'completed' as const 
                                        : !isActivelyGenerating 
                                            ? 'cancelled' as const 
                                            : 'generating' as const;
                                    return {
                                        path: filesConcept.path,
                                        purpose: filesConcept.purpose,
                                        status: fileStatus,
                                        contents: file?.fileContents
                                    };
                                }),
                                timestamp: Date.now(),
                            };
                        });
                        setPhaseTimeline(timeline);
                    }
                    
                    updateStage('bootstrap', { status: 'completed' });
                    
                    if (state.blueprint) {
                        updateStage('blueprint', { status: 'completed' });
                    }
                    
                    if (state.generatedFilesMap && Object.keys(state.generatedFilesMap).length > 0) {
                        updateStage('code', { status: 'completed' });
                        if (urlChatId !== 'new') {
                            logger.debug('🚀 Requesting preview deployment for existing chat with files');
                            sendWebSocketMessage(websocket, 'preview');
                        }
                    }

                    setIsInitialStateRestored(true);
                }
                break;
            }
            case 'cf_agent_state': {
                const { state } = message;
                logger.debug('🔄 Agent state update received:', state);

                if (state.shouldBeGenerating) {
                    logger.debug('🔄 shouldBeGenerating=true detected, auto-resuming generation');
                    updateStage('code', { status: 'active' });
                    
                    logger.debug('📡 Sending auto-resume generate_all message');
                    sendWebSocketMessage(websocket, 'generate_all');
                } else {
                    const codeStage = projectStages.find((stage: any) => stage.id === 'code');
                    if (codeStage?.status === 'active' && !isGenerating) {
                        if (state.generatedFilesMap && Object.keys(state.generatedFilesMap).length > 0) {
                            updateStage('code', { status: 'completed' });

                            if (!previewUrl) {
                                logger.debug('🚀 Generated files exist but no preview URL - auto-deploying preview');
                                sendWebSocketMessage(websocket, 'preview');
                            }
                        }
                    }
                }

                logger.debug('✅ Agent state update processed');
                break;
            }

            case 'conversation_state': {
                if (message.type !== 'conversation_state') break;
                const { state, deepDebugSession } = message;
                const history: ReadonlyArray<ConversationMessage> = state?.runningHistory ?? [];
                logger.debug('Received conversation_state with messages:', history.length, 'deepDebugSession:', deepDebugSession);

                const restoredMessages: ChatMessage[] = [];
                let currentAssistant: ChatMessage | null = null;
                
                const ensureToolEvents = (assistant: ChatMessage) => {
                    if (!assistant.ui) assistant.ui = { toolEvents: [] };
                    if (!assistant.ui.toolEvents) assistant.ui.toolEvents = [];
                };
                
                for (const msg of history) {
                    const text = extractTextContent(msg.content);
                    if (text?.includes('<Internal Memo>')) continue;
                    
                    if (msg.role === 'user') {
                        restoredMessages.push({
                            role: 'user',
                            conversationId: msg.conversationId,
                            content: text || '',
                        });
                        currentAssistant = null;
                    } else if (msg.role === 'assistant') {
                        const content = msg.conversationId.startsWith('archive-') 
                            ? 'previous history was compacted' 
                            : (text || '');
                        
                        const hasToolCalls = msg.tool_calls && msg.tool_calls.length > 0;
                        
                        // Merge all consecutive assistant messages into one bubble
                        if (currentAssistant) {
                            // Append content if present
                            if (content) {
                                currentAssistant.content += (currentAssistant.content ? '\n\n' : '') + content;
                            }
                            // Append tool_calls if present
                            if (hasToolCalls) {
                                if (!currentAssistant.tool_calls) {
                                    currentAssistant.tool_calls = [];
                                }
                                currentAssistant.tool_calls.push(...msg.tool_calls!);
                                ensureToolEvents(currentAssistant);
                            }
                        } else {
                            // Create new assistant message
                            currentAssistant = {
                                role: 'assistant',
                                conversationId: msg.conversationId,
                                content,
                                ui: hasToolCalls ? { toolEvents: [] } : undefined,
                                tool_calls: hasToolCalls ? [...msg.tool_calls!] : undefined,
                            };
                            restoredMessages.push(currentAssistant);
                        }
                    } else if (msg.role === 'tool' && 'name' in msg && msg.name && currentAssistant) {
                        ensureToolEvents(currentAssistant);
                        currentAssistant.ui!.toolEvents!.push({
                            name: msg.name,
                            status: 'success',
                            timestamp: Date.now(),
                            result: text || undefined,
                            contentLength: currentAssistant.content.length,
                        });
                    }
                }

                // Restore active debug session if one is running
                if (deepDebugSession?.conversationId) {
                    setIsDebugging(true);
                    
                    // Find if there's already a message with this conversationId
                    const existingMessageIndex = restoredMessages.findIndex(
                        m => m.role === 'assistant' && m.conversationId === deepDebugSession.conversationId
                    );
                    
                    if (existingMessageIndex !== -1) {
                        // Update existing message to show as active debug
                        const existingMessage = restoredMessages[existingMessageIndex];
                        if (!existingMessage.ui) existingMessage.ui = {};
                        if (!existingMessage.ui.toolEvents) existingMessage.ui.toolEvents = [];
                        
                        const debugEventIndex = existingMessage.ui.toolEvents.findIndex(e => e.name === 'deep_debug');
                        if (debugEventIndex === -1) {
                            existingMessage.ui.toolEvents.push({
                                name: 'deep_debug',
                                status: 'start',
                                timestamp: Date.now(),
                                contentLength: 0
                            });
                        } else {
                            existingMessage.ui.toolEvents[debugEventIndex].status = 'start';
                            existingMessage.ui.toolEvents[debugEventIndex].contentLength = 0;
                        }
                    } else {
                        // Create new placeholder message with the active conversationId
                        const debugBubble: ChatMessage = {
                            role: 'assistant',
                            conversationId: deepDebugSession.conversationId,
                            content: 'Deep debug session in progress...',
                            ui: {
                                toolEvents: [{
                                    name: 'deep_debug',
                                    status: 'start',
                                    timestamp: Date.now(),
                                    contentLength: 0
                                }]
                            }
                        };
                        restoredMessages.push(debugBubble);
                    }
                }

                if (restoredMessages.length > 0) {
                    // Deduplicate assistant messages with identical content (even if separated by tool messages)
                    const deduplicated = deduplicateMessages(restoredMessages);
                    
                    logger.debug('Merging conversation_state with', deduplicated.length, 'messages (', restoredMessages.length - deduplicated.length, 'duplicates removed)');
                    setMessages(prev => {
                        const hasFetching = prev.some(m => m.role === 'assistant' && m.conversationId === 'fetching-chat');
                        const hasReconnect = prev.some(m => m.role === 'assistant' && m.conversationId === 'websocket_reconnected');
                        
                        if (hasFetching) {
                            const next = appendToolEvent(prev, 'fetching-chat', { 
                                name: 'fetching your latest conversations', 
                                status: 'success' 
                            });
                            return [...next, ...deduplicated];
                        }
                        
                        if (hasReconnect) {
                            // Preserve reconnect message on top when restoring state after reconnect
                            return [...prev, ...deduplicated];
                        }
                        
                        return deduplicated;
                    });
                }
                break;
            }

            case 'file_generating': {
                setFiles((prev) => setFileGenerating(prev, message.filePath));
                break;
            }

            case 'file_chunk_generated': {
                setFiles((prev) => appendFileChunk(prev, message.filePath, message.chunk));
                break;
            }

            case 'file_generated': {
                setFiles((prev) => setFileCompleted(prev, message.file.filePath, message.file.fileContents));
                setPhaseTimeline((prev) => updatePhaseFileStatus(
                    prev,
                    message.file.filePath,
                    'completed',
                    message.file.fileContents
                ));
                break;
            }

            case 'file_regenerated': {
                setIsRedeployReady(true);
                setFiles((prev) => setFileCompleted(prev, message.file.filePath, message.file.fileContents));
                setPhaseTimeline((prev) => updatePhaseFileStatus(
                    prev,
                    message.file.filePath,
                    'completed',
                    message.file.fileContents
                ));
                break;
            }

            case 'file_regenerating': {
                setFiles((prev) => setFileGenerating(prev, message.filePath, 'File being regenerated...'));
                setPhaseTimeline((prev) => updatePhaseFileStatus(prev, message.filePath, 'generating'));
                break;
            }

            case 'generation_started': {
                updateStage('code', { status: 'active' });
                setTotalFiles(message.totalFiles);
                setIsGenerating(true);
                break;
            }

            case 'generation_complete': {
                setIsRedeployReady(true);
                setFiles((prev) => setAllFilesCompleted(prev));
                setProjectStages((prev) => completeStages(prev, ['code']));

                sendMessage(createAIMessage('generation-complete', 'Code generation has been completed.'));
                
                // Reset all phase indicators
                setIsPhaseProgressActive(false);
                setIsThinking(false);
                setIsGenerating(false);
                break;
            }

            case 'deployment_started': {
                setIsPreviewDeploying(true);
                break;
            }

            case 'deployment_completed': {
                setIsPreviewDeploying(false);
                const finalPreviewURL = getPreviewUrl(message.previewURL, message.tunnelURL);
                setPreviewUrl(finalPreviewURL);
                break;
            }

            case 'deployment_failed': {
                toast.error(message.error);
                break;
            }

            case 'code_reviewed': {
                const reviewData = message.review;
                const totalIssues = reviewData?.filesToFix?.reduce((count: number, file: any) =>
                    count + file.issues.length, 0) || 0;

                let reviewMessage = 'Code review complete';
                if (reviewData?.issuesFound) {
                    reviewMessage = `Code review complete - ${totalIssues} issue${totalIssues !== 1 ? 's' : ''} found across ${reviewData.filesToFix?.length || 0} file${reviewData.filesToFix?.length !== 1 ? 's' : ''}`;
                } else {
                    reviewMessage = 'Code review complete - no issues found';
                }

                sendMessage(createAIMessage('code_reviewed', reviewMessage));
                break;
            }

            case 'runtime_error_found': {
                logger.info('Runtime error found in sandbox', message.errors);
                
                // Update runtime error count
                deps.setRuntimeErrorCount(message.count || message.errors?.length || 0);
                
                onDebugMessage?.('error', 
                    `Runtime Error (${message.count} errors)`,
                    message.errors.map((e: any) => `${e.message}\nStack: ${e.stack || 'N/A'}`).join('\n\n'),
                    'Runtime Detection'
                );
                break;
            }

            case 'code_reviewing': {
                const lintIssues = message.staticAnalysis?.lint?.issues?.length || 0;
                const typecheckIssues = message.staticAnalysis?.typecheck?.issues?.length || 0;
                const runtimeErrors = message.runtimeErrors?.length || 0;
                const totalIssues = lintIssues + typecheckIssues + runtimeErrors;

                // Update issue counts
                deps.setStaticIssueCount(lintIssues + typecheckIssues);
                deps.setRuntimeErrorCount(runtimeErrors);

                // Show review start message
                sendMessage(createAIMessage('review_start', 'App generation complete, now reviewing code indepth'));

                if (totalIssues > 0) {
                    const errorDetails = [
                        `Lint Issues: ${JSON.stringify(message.staticAnalysis?.lint?.issues)}`,
                        `Type Errors: ${JSON.stringify(message.staticAnalysis?.typecheck?.issues)}`,
                        `Runtime Errors: ${JSON.stringify(message.runtimeErrors)}`,
                    ].filter(Boolean).join('\n');

                    onDebugMessage?.('warning',
                        `Generation Issues Found (${totalIssues} total)`,
                        errorDetails,
                        'Code Generation'
                    );
                }
                break;
            }

            case 'phase_generating': {
                sendMessage(createAIMessage('phase_generating', message.message));
                setIsThinking(true);
                setIsPhaseProgressActive(true);
                break;
            }

            case 'phase_generated': {
                sendMessage(createAIMessage('phase_generated', message.message));
                setIsThinking(false);
                setIsPhaseProgressActive(false);
                break;
            }

            case 'phase_implementing': {
                sendMessage(createAIMessage('phase_implementing', message.message));
                updateStage('code', { status: 'active' });
                
                if (message.phase) {
                    setPhaseTimeline(prev => {
                        const existingPhase = prev.find(p => p.name === message.phase.name);
                        if (existingPhase) {
                            logger.debug('Phase already exists in timeline:', message.phase.name);
                            return prev;
                        }
                        
                        const newPhase = {
                            id: `${message.phase.name}-${Date.now()}`,
                            name: message.phase.name,
                            description: message.phase.description,
                            files: message.phase.files?.map((f: any) => ({
                                path: f.path,
                                purpose: f.purpose,
                                status: 'generating' as const,
                            })) || [],
                            status: 'generating' as const,
                            timestamp: Date.now()
                        };
                        
                        logger.debug('Added new phase to timeline:', message.phase.name);
                        return [...prev, newPhase];
                    });
                }
                break;
            }

            case 'phase_validating': {
                sendMessage(createAIMessage('phase_validating', message.message));
                
                setPhaseTimeline(prev => {
                    const updated = [...prev];
                    if (updated.length > 0) {
                        const lastPhase = updated[updated.length - 1];
                        lastPhase.status = 'validating';
                        logger.debug(`Phase validating: ${lastPhase.name}`);
                    }
                    return updated;
                });
                setIsPreviewDeploying(false);
                setIsPhaseProgressActive(false);
                break;
            }

            case 'phase_validated': {
                sendMessage(createAIMessage('phase_validated', message.message));
                break;
            }

            case 'phase_implemented': {
                sendMessage(createAIMessage('phase_implemented', message.message));

                updateStage('code', { status: 'completed' });
                setIsRedeployReady(true);
                setIsPhaseProgressActive(false);
                
                if (message.phase) {
                    setPhaseTimeline(prev => {
                        const updated = [...prev];
                        if (updated.length > 0) {
                            const lastPhase = updated[updated.length - 1];
                            lastPhase.status = 'completed';
                            lastPhase.files = lastPhase.files.map(f => ({ ...f, status: 'completed' as const }));
                            logger.debug(`Phase completed: ${lastPhase.name}`);
                        }
                        return updated;
                    });
                }

                logger.debug('🔄 Scheduling preview refresh in 1 second after deployment completion');
                setTimeout(() => {
                    logger.debug('🔄 Triggering preview refresh after deployment completion');
                    setShouldRefreshPreview(true);
                    
                    setTimeout(() => {
                        setShouldRefreshPreview(false);
                    }, 100);
                    
                    onDebugMessage?.('info',
                        'Preview Auto-Refresh Triggered',
                        `Preview refreshed 1 second after deployment completion`,
                        'Preview Auto-Refresh'
                    );
                }, 1000);
                break;
            }

            case 'preview_force_refresh': {
                setShouldRefreshPreview(true);
                setTimeout(() => {
                    setShouldRefreshPreview(false);
                }, 100);
                break;
            }

            case 'generation_stopped': {
                setIsGenerating(false);
                setIsGenerationPaused(true);
                setIsDebugging(false);
                
                // Reset phase indicators
                setIsPhaseProgressActive(false);
                setIsThinking(false);
                
                // Show toast notification for user-initiated stop
                toast.info('Generation stopped', {
                    description: message.message || 'Code generation has been stopped'
                });
                
                sendMessage(createAIMessage('generation_stopped', message.message));
                break;
            }

            case 'generation_resumed': {
                setIsGenerating(true);
                setIsGenerationPaused(false);
                sendMessage(createAIMessage('generation_resumed', message.message));
                break;
            }

            case 'cloudflare_deployment_started': {
                setIsDeploying(true);
                sendMessage(createAIMessage('cloudflare_deployment_started', message.message));
                break;
            }

            case 'cloudflare_deployment_completed': {
                setIsDeploying(false);
                setCloudflareDeploymentUrl(message.deploymentUrl);
                setDeploymentError('');
                setIsRedeployReady(false);
                
                sendMessage(createAIMessage('cloudflare_deployment_completed', `Your project has been permanently deployed to Cloudflare Workers: ${message.deploymentUrl}`));
                
                onDebugMessage?.('info', 
                    'Deployment Completed - Redeploy Reset',
                    `Deployment URL: ${message.deploymentUrl}\nPhase count at deployment: ${phaseTimeline.length}\nRedeploy button disabled until next phase`,
                    'Redeployment Management'
                );
                break;
            }

            case 'cloudflare_deployment_error': {
                setIsDeploying(false);
                setDeploymentError(message.error || 'Unknown deployment error');
                setCloudflareDeploymentUrl('');
                setIsRedeployReady(true);
                
                sendMessage(createAIMessage('cloudflare_deployment_error', `❌ Deployment failed: ${message.error}\n\n🔄 You can try deploying again.`));

                toast.error(`Error: ${message.error}`);
                
                onDebugMessage?.('error', 
                    'Deployment Failed - State Reset',
                    `Error: ${message.error}\nDeployment button reset for retry`,
                    'Deployment Error Recovery'
                );
                break;
            }

            case 'github_export_started': {
                sendMessage(createAIMessage('github_export_started', message.message));
                break;
            }

            case 'github_export_progress': {
                sendMessage(createAIMessage('github_export_progress', message.message));
                break;
            }

            case 'github_export_completed': {
                sendMessage(createAIMessage('github_export_completed', message.message));
                break;
            }

            case 'github_export_error': {
                sendMessage(createAIMessage('github_export_error', `❌ GitHub export failed: ${message.error}`));

                toast.error(`Error: ${message.error}`);
                
                break;
            }

            case 'conversation_response': {
                // Use concrete conversationId when available; otherwise use placeholder id
                let conversationId = message.conversationId ?? 'conversation_response';

                // If a concrete id arrives later, update placeholder once
                if (message.conversationId) {
                    const convId = message.conversationId;
                    setMessages(prev => {
                        const genericIdx = prev.findIndex(m => m.role === 'assistant' && m.conversationId === 'conversation_response');
                        if (genericIdx !== -1) {
                            return prev.map((m, i) => i === genericIdx ? { ...m, conversationId: convId } : m);
                        }
                        return prev;
                    });
                    conversationId = convId;
                }

                const isArchive = conversationId.startsWith('archive-');
                const placeholder = 'previous history was compacted';

                if (message.tool) {
                    const tool = message.tool;
                    setMessages(prev => appendToolEvent(prev, conversationId, { 
                        name: tool.name, 
                        status: tool.status,
                        result: tool.result 
                    }));
                    break;
                }

                if (message.isStreaming) {
                    setMessages(prev => handleStreamingMessage(prev, conversationId, isArchive ? placeholder : message.message, false));
                    break;
                }

                setMessages(prev => {
                    const idx = prev.findIndex(m => m.role === 'assistant' && m.conversationId === conversationId);
                    if (idx !== -1) return prev.map((m, i) => i === idx ? { ...m, content: (isArchive ? placeholder : message.message) } : m);
                    
                    // Deduplicate: Don't add if last assistant message has identical content
                    const newContent = isArchive ? placeholder : message.message;
                    if (isAssistantMessageDuplicate(prev, newContent)) {
                        logger.debug('Skipping duplicate assistant message');
                        return prev; // Skip duplicate
                    }
                    
                    return [...prev, createAIMessage(conversationId, newContent)];
                });
                break;
            }

            case 'terminal_output': {
                // Handle terminal output from server
                if (onTerminalMessage) {
                    const terminalLog = {
                        id: `terminal-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`,
                        content: message.output,
                        type: message.outputType as 'stdout' | 'stderr' | 'info',
                        timestamp: message.timestamp
                    };
                    onTerminalMessage(terminalLog);
                }
                break;
            }

            case 'server_log': {
                // Handle server logs
                if (onTerminalMessage) {
                    const serverLog = {
                        id: `log-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`,
                        content: message.message,
                        type: message.level as 'info' | 'warn' | 'error' | 'debug',
                        timestamp: message.timestamp,
                        source: message.source
                    };
                    onTerminalMessage(serverLog);
                }
                break;
            }

            case 'error': {
                const errorData = message;
                setMessages(prev => [
                    ...prev,
                    createAIMessage(`error_${Date.now()}`, `❌ ${errorData.error}`)
                ]);
                
                onDebugMessage?.(
                    'error',
                    'WebSocket Error',
                    errorData.error,
                    'WebSocket',
                    'error',
                    errorData
                );
                break;
            }

            case 'rate_limit_error': {
                const errorData = message.error;
                const rateLimitMessage = handleRateLimitError(
                    errorData.details,
                    onDebugMessage
                );
                setMessages(prev => [...prev, rateLimitMessage]);
                
                break;
            }

            default:
                logger.warn('Unhandled message:', message);
        }
    };
}
