import { QueryClient } from '@tanstack/react-query';
import type {
	PersistedClient,
	Persister,
} from '@tanstack/react-query-persist-client';
import { get, set, del } from 'idb-keyval';

const PERSIST_MAX_AGE = 1000 * 60 * 60 * 24; // 24 hours

export function createQueryClient() {
	return new QueryClient({
		defaultOptions: {
			queries: {
				staleTime: 30_000,
				// Must be >= persist maxAge so restored cache is not GC'd early
				gcTime: PERSIST_MAX_AGE,
				refetchOnWindowFocus: true,
				retry: 1,
			},
		},
	});
}

export function createIDBPersister(
	idbValidKey: IDBValidKey = 'reactQuery',
): Persister {
	return {
		persistClient: async (client: PersistedClient) => {
			await set(idbValidKey, client);
		},
		restoreClient: async () => {
			return await get<PersistedClient>(idbValidKey);
		},
		removeClient: async () => {
			await del(idbValidKey);
		},
	};
}

export const queryPersistOptions = {
	persister: createIDBPersister(),
	maxAge: PERSIST_MAX_AGE,
};
