import { createContext, useContext } from 'react';

/**
 * Provides a rollback handler to deeply-nested tool-call cards without
 * threading a callback through every intermediate component. `null` disables
 * the rollback UI (e.g. non-think apps, or while deploying/generating).
 */
export type RollbackHandler = ((commitHash: string) => void) | null;

export const RollbackContext = createContext<RollbackHandler>(null);

export function useRollback(): RollbackHandler {
	return useContext(RollbackContext);
}
