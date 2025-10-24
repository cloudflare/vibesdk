import { IStateManager } from '../interfaces/IStateManager';
import { IFileManager } from '../interfaces/IFileManager';
import { StructuredLogger } from '../../../logger';
import { ServiceOptions } from '../interfaces/IServiceOptions';

/**
 * Base class for all agent services
 * Provides common dependencies and DO-compatible access patterns
 */
export abstract class BaseAgentService {
    protected readonly stateManager: IStateManager;
    protected readonly fileManager: IFileManager;
    protected readonly getLogger: () => StructuredLogger;
    protected readonly env: Env;

    constructor(options: ServiceOptions) {
        this.stateManager = options.stateManager;
        this.fileManager = options.fileManager;
        this.getLogger = options.getLogger;
        this.env = options.env;
    }

    /**
     * Get current agent state
     */
    protected getState() {
        return this.stateManager.getState();
    }

    /**
     * Update agent state
     */
    protected setState(newState: ReturnType<IStateManager['getState']>) {
        this.stateManager.setState(newState);
    }

    getAgentId() {
        return this.getState().inferenceContext.agentId
    }
    
    /**
     * Get fresh logger instance (DO-compatible)
     */
    protected getLog(): StructuredLogger {
        return this.getLogger();
    }

    /**
     * Execute an operation with a timeout
     */
    protected async withTimeout<T>(
        operation: Promise<T>,
        timeoutMs: number,
        errorMsg: string,
        onTimeout?: () => void
    ): Promise<T> {
        let timeoutId: ReturnType<typeof setTimeout>;
        
        const timeoutPromise = new Promise<never>((_, reject) => {
            timeoutId = setTimeout(() => {
                onTimeout?.();
                reject(new Error(errorMsg));
            }, timeoutMs);
        });
        
        try {
            return await Promise.race([operation, timeoutPromise]);
        } finally {
            clearTimeout(timeoutId!);
        }
    }
}
