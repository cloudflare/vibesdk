import { FileOutputType, FileConceptType, Blueprint } from "worker/agents/schemas";
import { BaseSandboxService } from "worker/services/sandbox/BaseSandboxService";
import { ExecuteCommandsResponse, PreviewType, StaticAnalysisResponse, RuntimeError } from "worker/services/sandbox/sandboxTypes";
import { ProcessedImageAttachment } from "worker/types/image-attachment";
import { BehaviorType, DeepDebugResult } from "worker/agents/core/types";
import { RenderToolCall } from "worker/agents/operations/UserConversationProcessor";
import { WebSocketMessageType, WebSocketMessageData } from "worker/api/websocketTypes";
import { GitVersionControl } from "worker/agents/git/git";
import { OperationOptions } from "worker/agents/operations/common";

export interface ICodingAgent {
    getBehavior(): BehaviorType;
    
    getLogs(reset?: boolean, durationSeconds?: number): Promise<string>;
    
    fetchRuntimeErrors(clear?: boolean): Promise<RuntimeError[]>;
    
    deployToSandbox(files?: FileOutputType[], redeploy?: boolean, commitMessage?: string, clearLogs?: boolean): Promise<PreviewType | null>;
    
    broadcast<T extends WebSocketMessageType>(msg: T, data?: WebSocketMessageData<T>): void;
    
    deployToCloudflare(): Promise<{ deploymentUrl?: string; workersUrl?: string } | null>;
    
    queueUserRequest(request: string, images?: ProcessedImageAttachment[]): void;
    
    deployPreview(clearLogs?: boolean, forceRedeploy?: boolean): Promise<string>;
    
    clearConversation(): void;
    
    updateProjectName(newName: string): Promise<boolean>;
    
    getOperationOptions(): OperationOptions;
    
    readFiles(paths: string[]): Promise<{ files: { path: string; content: string }[] }>;
    
    runStaticAnalysisCode(files?: string[]): Promise<StaticAnalysisResponse>;
    
    execCommands(commands: string[], shouldSave: boolean, timeout?: number): Promise<ExecuteCommandsResponse>;

    updateBlueprint(patch: Partial<Blueprint>): Promise<Blueprint>;
    
    generateFiles(
        phaseName: string,
        phaseDescription: string,
        requirements: string[],
        files: FileConceptType[]
    ): Promise<{ files: Array<{ path: string; purpose: string; diff: string }> }>;

    regenerateFileByPath(path: string, issues: string[]): Promise<{ path: string; diff: string }>;
    
    isCodeGenerating(): boolean;
    
    waitForGeneration(): Promise<void>;
    
    isDeepDebugging(): boolean;
    
    waitForDeepDebug(): Promise<void>;
    
    executeDeepDebug(
        issue: string,
        toolRenderer: RenderToolCall,
        streamCb: (chunk: string) => void,
        focusPaths?: string[],
    ): Promise<DeepDebugResult>;
    
    getGit(): GitVersionControl;
    
    getSandboxServiceClient(): BaseSandboxService;
}
