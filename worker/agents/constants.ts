import { WebSocketMessageType } from "../api/websocketTypes";

export const WebSocketMessageResponses: Record<string, WebSocketMessageType> = {
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
    
    // Model configuration info
    MODEL_CONFIGS_INFO: 'model_configs_info',
    
    // Terminal messages
    TERMINAL_OUTPUT: 'terminal_output',
    SERVER_LOG: 'server_log',
}

// WebSocket message types
export const WebSocketMessageRequests = {
    GENERATE_ALL: 'generate_all',
    GENERATE: 'generate',
    CODE_REVIEW: 'code_review',
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
    
    // Model configuration info request
    GET_MODEL_CONFIGS: 'get_model_configs',
    
    // Terminal command request
    TERMINAL_COMMAND: 'terminal_command',
};

export const PREVIEW_EXPIRED_ERROR = 'Preview expired, attempting redeploy. Please try again after a minute or refresh the page';
export const MAX_DEPLOYMENT_RETRIES = 5;
export const MAX_LLM_MESSAGES = 100;
export const MAX_TOOL_CALLING_DEPTH = 7;