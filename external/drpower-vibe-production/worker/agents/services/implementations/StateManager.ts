import { IStateManager } from '../interfaces/IStateManager';
import { CodeGenState } from '../../core/state';

/**
 * State manager implementation for Durable Objects
 * Works with the Agent's state management
 */
export class StateManager implements IStateManager {
    constructor(
        private getStateFunc: () => CodeGenState,
        private setStateFunc: (state: CodeGenState) => void
    ) {}

    getState(): Readonly<CodeGenState> {
        return this.getStateFunc();
    }

    setState(newState: CodeGenState): void {
        this.setStateFunc(newState);
    }

    updateField<K extends keyof CodeGenState>(field: K, value: CodeGenState[K]): void {
        const currentState = this.getState();
        this.setState({
            ...currentState,
            [field]: value
        });
    }

    batchUpdate(updates: Partial<CodeGenState>): void {
        const currentState = this.getState();
        this.setState({
            ...currentState,
            ...updates
        });
    }
}