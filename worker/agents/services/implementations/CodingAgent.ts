import { ProcessedImageAttachment } from "worker/types/image-attachment";
import { Blueprint, FileConceptType } from "worker/agents/schemas";
import { ExecuteCommandsResponse, StaticAnalysisResponse, RuntimeError } from "worker/services/sandbox/sandboxTypes";
import { ICodingAgent } from "../interfaces/ICodingAgent";
import { OperationOptions } from "worker/agents/operations/common";
import { DeepDebugResult } from "worker/agents/core/types";
import { RenderToolCall } from "worker/agents/operations/UserConversationProcessor";
import { WebSocketMessageResponses } from "worker/agents/constants";

/*
* CodingAgentInterface - stub for passing to tool calls
*/
export class CodingAgentInterface {
    agentStub: ICodingAgent;
    constructor (agentStub: ICodingAgent) {
        this.agentStub = agentStub;
    }

    getLogs(reset?: boolean, durationSeconds?: number): Promise<string> {
        return this.agentStub.getLogs(reset, durationSeconds);
    }

    fetchRuntimeErrors(clear?: boolean): Promise<RuntimeError[]> {
        return this.agentStub.fetchRuntimeErrors(clear);
    }

    async deployPreview(clearLogs: boolean = true, forceRedeploy: boolean = false): Promise<string> {
        const response = await this.agentStub.deployToSandbox([], forceRedeploy, undefined, clearLogs);
        // Send a message to refresh the preview
        if (response && response.previewURL) {
            this.agentStub.broadcast(WebSocketMessageResponses.PREVIEW_FORCE_REFRESH, {});
            return `Deployment successful: ${response.previewURL}`;
        } else {
            return `Failed to deploy: ${response?.tunnelURL}`;
        }
    }

    async deployToCloudflare(): Promise<string> {
        const response = await this.agentStub.deployToCloudflare();
        if (response && response.deploymentUrl) {
            return `Deployment successful: ${response.deploymentUrl}`;
        } else {
            return `Failed to deploy: ${response?.workersUrl}`;
        }
    }

    queueRequest(request: string, images?: ProcessedImageAttachment[]): void {
        this.agentStub.queueUserRequest(request, images);
    }

    clearConversation(): void {
        this.agentStub.clearConversation();
    }

    getOperationOptions(): OperationOptions {
        return this.agentStub.getOperationOptions();
    }

    getGit() {
        return this.agentStub.getGit();
    }

    updateProjectName(newName: string): Promise<boolean> {
        return this.agentStub.updateProjectName(newName);
    }

    updateBlueprint(patch: Partial<Blueprint>): Promise<Blueprint> {
        return this.agentStub.updateBlueprint(patch);
    }

    // Generic debugging helpers — delegate to underlying agent
    readFiles(paths: string[]): Promise<{ files: { path: string; content: string }[] }> {
        return this.agentStub.readFiles(paths);
    }

    runStaticAnalysisCode(files?: string[]): Promise<StaticAnalysisResponse> {
        return this.agentStub.runStaticAnalysisCode(files);
    }

    execCommands(commands: string[], shouldSave: boolean, timeout?: number): Promise<ExecuteCommandsResponse> {
        return this.agentStub.execCommands(commands, shouldSave, timeout);
    }

    // Exposes a simplified regenerate API for tools
    regenerateFile(path: string, issues: string[]): Promise<{ path: string; diff: string }> {
        return this.agentStub.regenerateFileByPath(path, issues);
    }

    // Exposes file generation via phase implementation
    generateFiles(
        phaseName: string,
        phaseDescription: string,
        requirements: string[],
        files: FileConceptType[]
    ): Promise<{ files: Array<{ path: string; purpose: string; diff: string }> }> {
        return this.agentStub.generateFiles(phaseName, phaseDescription, requirements, files);
    }

    isCodeGenerating(): boolean {
        return this.agentStub.isCodeGenerating();
    }

    waitForGeneration(): Promise<void> {
        return this.agentStub.waitForGeneration();
    }

    isDeepDebugging(): boolean {
        return this.agentStub.isDeepDebugging();
    }

    waitForDeepDebug(): Promise<void> {
        return this.agentStub.waitForDeepDebug();
    }

    executeDeepDebug(
        issue: string,
        toolRenderer: RenderToolCall,
        streamCb: (chunk: string) => void,
        focusPaths?: string[]
    ): Promise<DeepDebugResult> {
        return this.agentStub.executeDeepDebug(issue, toolRenderer, streamCb, focusPaths);
    }
}
