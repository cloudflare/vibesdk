import { FileOutputType } from '../../schemas';
import { GitHubPushRequest, StaticAnalysisResponse, RuntimeError, PreviewType } from '../../../services/sandbox/sandboxTypes';
import { GitHubExportResult } from '../../../services/github/types';
import { DeploymentStartedMessage, DeploymentCompletedMessage, DeploymentFailedMessage } from '../../../api/websocketTypes';
import { CloudflareDeploymentStartedMessage, CloudflareDeploymentCompletedMessage, CloudflareDeploymentErrorMessage } from '../../../api/websocketTypes';

/**
 * Callbacks for sandbox deployment events
 */
export interface SandboxDeploymentCallbacks {
    onStarted?: (data: Omit<DeploymentStartedMessage, 'type'>) => void;
    onCompleted?: (data: Omit<DeploymentCompletedMessage, 'type'>) => void;
    onError?: (data: Omit<DeploymentFailedMessage, 'type'>) => void;
}

/**
 * Callbacks for Cloudflare deployment events
 */
export interface CloudflareDeploymentCallbacks {
    onStarted?: (data: Omit<CloudflareDeploymentStartedMessage, 'type'>) => void;
    onCompleted?: (data: Omit<CloudflareDeploymentCompletedMessage, 'type'>) => void;
    onError?: (data: Omit<CloudflareDeploymentErrorMessage, 'type'>) => void;
    onPreviewExpired?: () => void;
}

/**
 * Parameters for deployment operation
 */
export interface DeploymentParams {
    files: FileOutputType[];
    redeploy: boolean;
    commitMessage?: string;
    clearLogs?: boolean;
}

/**
 * Result from deployment/instance operations
 */
export interface DeploymentResult {
    sandboxInstanceId: string;
    previewURL?: string;
    tunnelURL?: string;
    redeployed: boolean;
}

/**
 * Interface for deployment management operations
 * Handles sandbox deployment, instance creation, analysis, and exports
 * Manages sessionId and health check intervals internally
 */
export interface IDeploymentManager {
    /**
     * Get current session ID
     */
    getSessionId(): string;

    /**
     * Reset session ID (called on timeout or specific errors)
     */
    resetSessionId(): void;

    /**
     * Run static analysis (lint + typecheck) on code
     */
    runStaticAnalysis(files?: string[]): Promise<StaticAnalysisResponse>;

    /**
     * Fetch runtime errors from sandbox instance
     */
    fetchRuntimeErrors(clear?: boolean): Promise<RuntimeError[]>;

    /**
     * Wait for preview to be ready (used during initialization)
     */
    waitForPreview(): Promise<void>;

    /**
     * Execute setup commands during redeployment
     */
    executeSetupCommands(sandboxInstanceId: string, timeoutMs?: number): Promise<void>;

    /**
     * Deploy to sandbox
     * Handles: queue, retry, timeout, sessionId reset, health checks
     * Callbacks allow agent to broadcast at the right times (after queue, when actually starting)
     */
    deployToSandbox(
        files?: FileOutputType[],
        redeploy?: boolean,
        commitMessage?: string,
        clearLogs?: boolean,
        callbacks?: SandboxDeploymentCallbacks
    ): Promise<PreviewType | null>;

    /**
     * Deploy to Cloudflare Workers
     * Returns deployment URL and deployment ID for database updates
     */
    deployToCloudflare(callbacks?: CloudflareDeploymentCallbacks): Promise<{ deploymentUrl: string | null; deploymentId?: string }>;

    /**
     * Push to GitHub repository 
     */
    pushToGitHub(options: GitHubPushRequest): Promise<GitHubExportResult>;
}
