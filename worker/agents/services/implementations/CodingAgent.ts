import { ICodingAgent } from "../interfaces/ICodingAgent";

/*
* CodingAgentInterface - stub for passing to tool calls
*/
export class CodingAgentInterface {
    agentStub: ICodingAgent;
    constructor (agentStub: ICodingAgent) {
        this.agentStub = agentStub;
    }

    getLogs(reset?: boolean): Promise<string> {
        return this.agentStub.getLogs(reset);
    }

    async deployPreview(): Promise<string> {
        const response = await this.agentStub.deployToSandbox([], false);
        if (response && response.previewURL) {
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

    queueRequest(request: string, images?: string[]): void {
        this.agentStub.queueUserRequest(request, images);
    }
}