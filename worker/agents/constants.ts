import { WebSocketMessageType } from "../api/websocketTypes";
import { AgentActionKey } from "./inferutils/config.types";

export const WebSocketMessageResponses: Record<string, WebSocketMessageType> = {
    AGENT_CONNECTED: 'agent_connected',

    GENERATION_STARTED: 'generation_started',
    GENERATION_COMPLETE: 'generation_complete',

    PHASE_GENERATING: 'phase_generating',
    PHASE_GENERATED: 'phase_generated',

    PHASE_IMPLEMENTING: 'phase_implementing',
    PHASE_IMPLEMENTED: 'phase_implemented',

    PHASE_VALIDATING: 'phase_validating',
    PHASE_VALIDATED: 'phase_validated',

    FILE_CHUNK_GENERATED: 'file_chunk_generated',
    FILE_GENERATING: 'file_generating',
    FILE_GENERATED: 'file_generated',
    FILE_REGENERATING: 'file_regenerating',
    FILE_REGENERATED: 'file_regenerated',

    RUNTIME_ERROR_FOUND: 'runtime_error_found',
    STATIC_ANALYSIS_RESULTS: 'static_analysis_results',
    
    DEPLOYMENT_STARTED: 'deployment_started',
    DEPLOYMENT_COMPLETED: 'deployment_completed',
    DEPLOYMENT_FAILED: 'deployment_failed',
    PREVIEW_FORCE_REFRESH: 'preview_force_refresh',
    // Cloudflare deployment messages
    CLOUDFLARE_DEPLOYMENT_STARTED: 'cloudflare_deployment_started',
    CLOUDFLARE_DEPLOYMENT_COMPLETED: 'cloudflare_deployment_completed', 
    CLOUDFLARE_DEPLOYMENT_ERROR: 'cloudflare_deployment_error',
    
    // Screenshot messages
    SCREENSHOT_CAPTURE_STARTED: 'screenshot_capture_started',
    SCREENSHOT_CAPTURE_SUCCESS: 'screenshot_capture_success',
    SCREENSHOT_CAPTURE_ERROR: 'screenshot_capture_error',
    SCREENSHOT_ANALYSIS_RESULT: 'screenshot_analysis_result',
    
    ERROR: 'error',
    RATE_LIMIT_ERROR: 'rate_limit_error',

    CODE_REVIEWING: 'code_reviewing',
    CODE_REVIEWED: 'code_reviewed',

    COMMAND_EXECUTING: 'command_executing',
    COMMAND_EXECUTED: 'command_executed',
    COMMAND_EXECUTION_FAILED: 'command_execution_failed',
    
    // Generation control messages
    GENERATION_STOPPED: 'generation_stopped',
    GENERATION_RESUMED: 'generation_resumed',

    DETERMINISTIC_CODE_FIX_STARTED: 'deterministic_code_fix_started',
    DETERMINISTIC_CODE_FIX_COMPLETED: 'deterministic_code_fix_completed',
    
    // GitHub export messages
    GITHUB_EXPORT_STARTED: 'github_export_started',
    GITHUB_EXPORT_PROGRESS: 'github_export_progress',
    GITHUB_EXPORT_COMPLETED: 'github_export_completed',
    GITHUB_EXPORT_ERROR: 'github_export_error',
    
    // Conversational AI messages
    USER_SUGGESTIONS_PROCESSING: 'user_suggestions_processing',
    CONVERSATION_RESPONSE: 'conversation_response',
    CONVERSATION_CLEARED: 'conversation_cleared',
    CONVERSATION_STATE: 'conversation_state',
    PROJECT_NAME_UPDATED: 'project_name_updated',
    BLUEPRINT_UPDATED: 'blueprint_updated',
    BLUEPRINT_CHUNK: 'blueprint_chunk',
    TEMPLATE_UPDATED: 'template_updated',

    // Model configuration info
    MODEL_CONFIGS_INFO: 'model_configs_info',
    
    // Terminal messages
    TERMINAL_OUTPUT: 'terminal_output',
    SERVER_LOG: 'server_log',

    // Vault messages
    VAULT_REQUIRED: 'vault_required',
} as const satisfies Record<string, WebSocketMessageType>;

// WebSocket message types
export const WebSocketMessageRequests = {
    SESSION_INIT: 'session_init',
    GENERATE_ALL: 'generate_all',
    GENERATE: 'generate',
    DEPLOY: 'deploy',
    PREVIEW: 'preview',
    OVERWRITE: 'overwrite',
    UPDATE_QUERY: 'update_query',
    RUNTIME_ERROR_FOUND: 'runtime_error_found',
    PREVIEW_FAILED: 'preview_failed',
    CAPTURE_SCREENSHOT: 'capture_screenshot',
    STOP_GENERATION: 'stop_generation',
    RESUME_GENERATION: 'resume_generation',
    
    // GitHub export request
    GITHUB_EXPORT: 'github_export',
    
    // Conversational AI requests
    USER_SUGGESTION: 'user_suggestion',
    CLEAR_CONVERSATION: 'clear_conversation',
    GET_CONVERSATION_STATE: 'get_conversation_state',
    
    // Model configuration info request
    GET_MODEL_CONFIGS: 'get_model_configs',
    
    // Terminal command request
    TERMINAL_COMMAND: 'terminal_command',

    // Vault session sync (SK sent to vault WebSocket, only sessionId here)
    VAULT_UNLOCKED: 'vault_unlocked',
    VAULT_LOCKED: 'vault_locked',
};

export const PREVIEW_EXPIRED_ERROR = 'Preview expired, attempting redeploy. Please try again after a minute or refresh the page';
export const MAX_DEPLOYMENT_RETRIES = 5;
export const MAX_LLM_MESSAGES = 200;
export const MAX_TOOL_CALLING_DEPTH_DEFAULT = 7;
export const getMaxToolCallingDepth = (agentActionKey: AgentActionKey | 'testModelConfig') => {
    switch (agentActionKey) {
        case 'deepDebugger':
            return 40;
        case 'agenticProjectBuilder':
            return 100;
        default:
            return MAX_TOOL_CALLING_DEPTH_DEFAULT;
    }
}