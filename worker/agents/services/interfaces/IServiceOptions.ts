import { IStateManager } from './IStateManager';
import { IFileManager } from './IFileManager';
import { StructuredLogger } from '../../../logger';

/**
 * Common options for all agent services
 */
export interface ServiceOptions {
    env: Env,
    stateManager: IStateManager;
    fileManager: IFileManager;
    getLogger: () => StructuredLogger;
}
