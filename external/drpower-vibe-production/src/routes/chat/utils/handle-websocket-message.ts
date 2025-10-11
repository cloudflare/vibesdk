import type { WebSocket } from 'partysocket';
import type { WebSocketMessage, BlueprintType } from '@/api-types';
import { logger } from '@/utils/logger';
import { getFileType } from '@/utils/string';
import { getPreviewUrl } from '@/lib/utils';
import { generateId } from '@/utils/id-generator';
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
    setMessages: React.Dispatch<React.SetStateAction<any[]>>;
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
    sendMessage: (message: any) => void;
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
            case 'cf_agent_state': {
                const { state } = message;
                logger.debug('🔄 Agent state update received:', state);

                if (!isInitialStateRestored) {
                    logger.debug('📥 Performing initial state restoration');
                    
                    if (state.blueprint && !blueprint) {
                        setBlueprint(state.blueprint);
                        updateStage('blueprint', { status: 'completed' });
                    }

                    if (state.query && !query) {
                        setQuery(state.query);
                    }

                    if (state.templateDetails?.files && bootstrapFiles.length === 0) {
                        loadBootstrapFiles(state.templateDetails.files);
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
                        const timeline = state.generatedPhases.map((phase: any, index: number) => ({
                            id: `phase-${index}`,
                            name: phase.name,
                            description: phase.description,
                            status: phase.completed ? 'completed' as const : 'generating' as const,
                            files: phase.files.map((filesConcept: any) => {
                                const file = state.generatedFilesMap?.[filesConcept.path];
                                return {
                                    path: filesConcept.path,
                                    purpose: filesConcept.purpose,
                                    status: (file ? 'completed' as const : 'generating' as const),
                                    contents: file?.fileContents
                                };
                            }),
                            timestamp: Date.now(),
                        }));
                        setPhaseTimeline(timeline);
                    }

                    if (state.conversationMessages && state.conversationMessages.length > 0) {
                        logger.debug('💬 Restoring conversation messages:', state.conversationMessages.length);
                        const restoredMessages = state.conversationMessages
                            .map((msg: any) => {
                                const role = String(msg.role || '').toLowerCase();
                                const content: string = String(msg.content ?? '');

                                // Map only recognized roles; ignore system/tool/other roles
                                let type: 'user' | 'ai' | null = null;
                                if (role === 'user' || role === 'human') type = 'user';
                                else if (role === 'assistant' || role === 'ai' || role === 'model') type = 'ai';

                                if (!type) return null;
                                if (content.includes('<Internal Memo>')) return null;

                                return {
                                    type,
                                    id: (msg.conversationId || msg.id || generateId()),
                                    message: content,
                                    isThinking: false,
                                } as const;
                            })
                            .filter(Boolean) as Array<{ type: 'user' | 'ai'; id: string; message: string; isThinking: boolean }>;

                        if (restoredMessages.length > 0) {
                            logger.debug('💬 Replacing messages with restored conversation:', restoredMessages.length);
                            setMessages(restoredMessages);
                        }
                    }
                    
                    updateStage('bootstrap', { status: 'completed' });
                    
                    if (state.blueprint) {
                        updateStage('blueprint', { status: 'completed' });
                    }
                    
                    if (state.generatedFilesMap && Object.keys(state.generatedFilesMap).length > 0) {
                        updateStage('code', { status: 'completed' });
                        updateStage('validate', { status: 'completed' });
                    }

                    setIsInitialStateRestored(true);

                    if (state.generatedFilesMap && Object.keys(state.generatedFilesMap).length > 0 && 
                        urlChatId !== 'new') {
                        logger.debug('🚀 Requesting preview deployment for existing chat with files');
                        sendWebSocketMessage(websocket, 'preview');
                    }
                }

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
                            updateStage('validate', { status: 'completed' });

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
                break;
            }

            case 'generation_complete': {
                setIsRedeployReady(true);
                setFiles((prev) => setAllFilesCompleted(prev));
                setProjectStages((prev) => completeStages(prev, ['code', 'validate', 'fix']));

                sendMessage({
                    id: 'generation-complete',
                    message: 'Code generation has been completed.',
                    isThinking: false,
                });
                setIsPhaseProgressActive(false);
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
                toast.error(`Error: ${message.message}`);
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
                
                sendMessage({
                    id: 'code_review',
                    message: reviewMessage,
                });
                break;
            }

            case 'runtime_error_found': {
                logger.info('Runtime error found in sandbox', message.errors);
                
                onDebugMessage?.('error', 
                    `Runtime Error (${message.count} errors)`,
                    message.errors.map((e: any) => `${e.message}\nStack: ${e.stack || 'N/A'}`).join('\n\n'),
                    'Runtime Detection'
                );
                break;
            }

            case 'code_reviewing': {
                const totalIssues =
                    (message.staticAnalysis?.lint?.issues?.length || 0) +
                    (message.staticAnalysis?.typecheck?.issues?.length || 0) +
                    (message.runtimeErrors.length || 0);

                updateStage('validate', { status: 'active' });

                if (totalIssues > 0) {
                    updateStage('fix', { status: 'active', metadata: `Fixing ${totalIssues} issues` });
                    
                    const errorDetails = [
                        `Lint Issues: ${JSON.stringify(message.staticAnalysis?.lint?.issues)}`,
                        `Type Errors: ${JSON.stringify(message.staticAnalysis?.typecheck?.issues)}`,
                        `Runtime Errors: ${JSON.stringify(message.runtimeErrors)}`,
                        `Client Errors: ${JSON.stringify(message.clientErrors)}`,
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
                updateStage('validate', { status: 'completed' });
                updateStage('fix', { status: 'completed' });
                sendMessage({
                    id: 'phase_generating',
                    message: message.message,
                });
                setIsThinking(true);
                setIsPhaseProgressActive(true);
                break;
            }

            case 'phase_generated': {
                sendMessage({
                    id: 'phase_generated',
                    message: message.message,
                });
                setIsThinking(false);
                setIsPhaseProgressActive(false);
                break;
            }

            case 'phase_implementing': {
                sendMessage({
                    id: 'phase_implementing',
                    message: message.message,
                });
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
                sendMessage({
                    id: 'phase_validating',
                    message: message.message,
                });
                updateStage('validate', { status: 'active' });
                
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
                sendMessage({
                    id: 'phase_validated',
                    message: message.message,
                });
                updateStage('validate', { status: 'completed' });
                break;
            }

            case 'phase_implemented': {
                sendMessage({
                    id: 'phase_implemented',
                    message: message.message,
                });

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

            case 'generation_stopped': {
                setIsGenerating(false);
                setIsGenerationPaused(true);
                sendMessage({
                    id: 'generation_stopped',
                    message: message.message,
                });
                break;
            }

            case 'generation_resumed': {
                setIsGenerating(true);
                setIsGenerationPaused(false);
                sendMessage({
                    id: 'generation_resumed',
                    message: message.message,
                });
                break;
            }

            case 'cloudflare_deployment_started': {
                setIsDeploying(true);
                sendMessage({
                    id: 'cloudflare_deployment_started',
                    message: message.message,
                });
                break;
            }

            case 'cloudflare_deployment_completed': {
                setIsDeploying(false);
                setCloudflareDeploymentUrl(message.deploymentUrl);
                setDeploymentError('');
                setIsRedeployReady(false);
                
                sendMessage({
                    id: 'cloudflare_deployment_completed',
                    message: `Your project has been permanently deployed to Cloudflare Workers: ${message.deploymentUrl}`,
                });
                
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
                
                sendMessage({
                    id: 'cloudflare_deployment_error',
                    message: `❌ Deployment failed: ${message.error}\n\n🔄 You can try deploying again.`,
                });

                toast.error(`Error: ${message.error}`);
                
                onDebugMessage?.('error', 
                    'Deployment Failed - State Reset',
                    `Error: ${message.error}\nDeployment button reset for retry`,
                    'Deployment Error Recovery'
                );
                break;
            }

            case 'github_export_started': {
                sendMessage({
                    id: 'github_export_started',
                    message: message.message,
                });
                break;
            }

            case 'github_export_progress': {
                sendMessage({
                    id: 'github_export_progress',
                    message: message.message,
                });
                break;
            }

            case 'github_export_completed': {
                sendMessage({
                    id: 'github_export_completed',
                    message: message.message,
                });
                break;
            }

            case 'github_export_error': {
                sendMessage({
                    id: 'github_export_error',
                    message: `❌ GitHub export failed: ${message.error}`,
                });

                toast.error(`Error: ${message.error}`);
                
                break;
            }

            case 'conversation_response': {
                // Use concrete conversationId when available; otherwise use placeholder
                let id = message.conversationId ?? 'conversation_response';

                // If a concrete id arrives later, rename placeholder once
                if (message.conversationId) {
                    const convId = message.conversationId;
                    setMessages(prev => {
                        const genericIdx = prev.findIndex(m => m.type === 'ai' && m.id === 'conversation_response');
                        if (genericIdx !== -1) {
                            return prev.map((m, i) => i === genericIdx ? { ...m, id: convId } : m);
                        }
                        return prev;
                    });
                    id = convId;
                }

                if (message.tool) {
                    const tool = message.tool;
                    setMessages(prev => appendToolEvent(prev, id, { name: tool.name, status: tool.status }));
                    break;
                }

                if (message.isStreaming) {
                    setMessages(prev => handleStreamingMessage(prev, id, message.message, false));
                    break;
                }

                setMessages(prev => {
                    const idx = prev.findIndex(m => m.type === 'ai' && m.id === id);
                    if (idx !== -1) return prev.map((m, i) => i === idx ? { ...m, message: message.message } : m);
                    return [...prev, createAIMessage(id, message.message)];
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
