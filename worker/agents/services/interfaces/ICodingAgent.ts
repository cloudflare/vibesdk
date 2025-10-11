import { FileOutputType } from "worker/agents/schemas";
import { BaseSandboxService } from "worker/services/sandbox/BaseSandboxService";
import { PreviewType } from "worker/services/sandbox/sandboxTypes";
import { ImageAttachment } from "worker/types/image-attachment";

export abstract class ICodingAgent {
    abstract getSandboxServiceClient(): BaseSandboxService;

    abstract deployToSandbox(files: FileOutputType[], redeploy: boolean, commitMessage?: string): Promise<PreviewType | null>;

    abstract deployToCloudflare(): Promise<{ deploymentUrl?: string; workersUrl?: string } | null>;

    abstract getLogs(reset?: boolean): Promise<string>;

    abstract queueUserRequest(request: string, images?: ImageAttachment[]): void;
}
