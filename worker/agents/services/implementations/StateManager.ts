import { BaseProjectState } from 'worker/agents/core/state';
import { IStateManager } from '../interfaces/IStateManager';

/**
 * State manager implementation for Durable Objects
 * Works with the Agent's state management
 */
export class StateManager<TState extends BaseProjectState> implements IStateManager<TState> {
    constructor(
        private getStateFunc: () => TState,
        private setStateFunc: (state: TState) => void
    ) {}

    getState(): Readonly<TState> {
        return this.getStateFunc();
    }

    setState(newState: TState): void {
        this.setStateFunc(newState);
    }

    updateField<K extends keyof TState>(field: K, value: TState[K]): void {
        const currentState = this.getState();
        this.setState({
            ...currentState,
            [field]: value
        });
    }
}