import { BaseProjectState } from "worker/agents/core/state";

/**
 * Interface for state management
 * Abstracts state persistence and updates
 */
export interface IStateManager<TState extends BaseProjectState> {
    /**
     * Get current state
     */
    getState(): Readonly<TState>;

    /**
     * Update state immutably
     */
    setState(newState: TState): void;

    /**
     * Update specific field
     */
    updateField<K extends keyof TState>(field: K, value: TState[K]): void;
}