import { FileOutputType, Blueprint, FileConceptType } from "worker/agents/schemas";
import { BaseSandboxService } from "worker/services/sandbox/BaseSandboxService";
import { ExecuteCommandsResponse, PreviewType, StaticAnalysisResponse, RuntimeError } from "worker/services/sandbox/sandboxTypes";
import { ProcessedImageAttachment } from "worker/types/image-attachment";
import { OperationOptions } from "worker/agents/operations/common";
import { DeepDebugResult } from "worker/agents/core/types";
import { RenderToolCall } from "worker/agents/operations/UserConversationProcessor";
import { WebSocketMessageType, WebSocketMessageData } from "worker/api/websocketTypes";
import { GitVersionControl } from "worker/agents/git/git";

export abstract class ICodingAgent {
    abstract getSandboxServiceClient(): BaseSandboxService;

    abstract getGit(): GitVersionControl;

    abstract deployToSandbox(files: FileOutputType[], redeploy: boolean, commitMessage?: string, clearLogs?: boolean): Promise<PreviewType | null>;

    abstract deployToCloudflare(): Promise<{ deploymentUrl?: string; workersUrl?: string } | null>;

    abstract getLogs(reset?: boolean, durationSeconds?: number): Promise<string>;

    abstract queueUserRequest(request: string, images?: ProcessedImageAttachment[]): void;

    abstract clearConversation(): void;

    abstract updateProjectName(newName: string): Promise<boolean>;

    abstract updateBlueprint(patch: Partial<Blueprint>): Promise<Blueprint>;

    abstract getOperationOptions(): OperationOptions;

    abstract readFiles(paths: string[]): Promise<{ files: { path: string; content: string }[] }>;

    abstract runStaticAnalysisCode(files?: string[]): Promise<StaticAnalysisResponse>;

    abstract execCommands(commands: string[], shouldSave: boolean, timeout?: number): Promise<ExecuteCommandsResponse>;
    
    abstract regenerateFileByPath(path: string, issues: string[]): Promise<{ path: string; diff: string }>;

    abstract generateFiles(
        phaseName: string,
        phaseDescription: string,
        requirements: string[],
        files: FileConceptType[]
    ): Promise<{ files: Array<{ path: string; purpose: string; diff: string }> }>;

    abstract fetchRuntimeErrors(clear?: boolean): Promise<RuntimeError[]>;

    abstract isCodeGenerating(): boolean;

    abstract waitForGeneration(): Promise<void>;

    abstract isDeepDebugging(): boolean;

    abstract waitForDeepDebug(): Promise<void>;

    abstract broadcast<T extends WebSocketMessageType>(message: T, data?: WebSocketMessageData<T>): void;

    abstract executeDeepDebug(
        issue: string,
        toolRenderer: RenderToolCall,
        streamCb: (chunk: string) => void,
        focusPaths?: string[],
    ): Promise<DeepDebugResult>;
}
