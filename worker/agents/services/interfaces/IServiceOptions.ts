import { IStateManager } from './IStateManager';
import { IFileManager } from './IFileManager';
import { StructuredLogger } from '../../../logger';
import { BaseProjectState } from '../../core/state';

/**
 * Common options for all agent services
 */
export interface ServiceOptions<TState extends BaseProjectState = BaseProjectState> {
    env: Env,
    stateManager: IStateManager<TState>;
    fileManager: IFileManager;
    getLogger: () => StructuredLogger;
}
