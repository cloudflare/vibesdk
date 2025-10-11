import { CodeGenState } from '../../core/state';

/**
 * Interface for state management
 * Abstracts state persistence and updates
 */
export interface IStateManager {
    /**
     * Get current state
     */
    getState(): Readonly<CodeGenState>;

    /**
     * Update state immutably
     */
    setState(newState: CodeGenState): void;

    /**
     * Update specific field
     */
    updateField<K extends keyof CodeGenState>(field: K, value: CodeGenState[K]): void;

    /**
     * Batch update multiple fields
     */
    batchUpdate(updates: Partial<CodeGenState>): void;
}