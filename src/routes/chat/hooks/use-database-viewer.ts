/**
 * use-database-viewer
 *
 * Lightweight data hook for the DB tab. Manages two pieces of state:
 * - the list of tables in the App Durable Object,
 * - the paginated rows of the selected table.
 *
 * Fetches are manual (refresh button); the hook never polls.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { apiClient } from '@/lib/api-client';
import type {
	ListAppTablesResponse,
	QueryAppTableResponse,
} from '@/api-types';

export interface DatabaseViewerState {
	tables: ListAppTablesResponse | null;
	queryResult: QueryAppTableResponse | null;
	loadingTables: boolean;
	loadingQuery: boolean;
	error: string | null;
	selectedTable: string | null;
	page: number;
	pageSize: number;
	orderBy?: string;
	orderDir?: 'asc' | 'desc';
}

export interface DatabaseViewerActions {
	refreshTables: () => Promise<void>;
	refreshQuery: () => Promise<void>;
	selectTable: (table: string | null) => void;
	setPage: (page: number) => void;
	setPageSize: (size: number) => void;
	setOrder: (orderBy: string | undefined, orderDir?: 'asc' | 'desc') => void;
	wipe: () => Promise<void>;
}

const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 200;

export function useDatabaseViewer(
	agentId: string | undefined,
	options: { enabled: boolean },
): DatabaseViewerState & DatabaseViewerActions {
	const enabled = options.enabled && !!agentId;

	const [tables, setTables] = useState<ListAppTablesResponse | null>(null);
	const [queryResult, setQueryResult] = useState<QueryAppTableResponse | null>(null);
	const [loadingTables, setLoadingTables] = useState(false);
	const [loadingQuery, setLoadingQuery] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [selectedTable, setSelectedTable] = useState<string | null>(null);
	const [page, setPage] = useState(0);
	const [pageSize, setPageSizeRaw] = useState(DEFAULT_PAGE_SIZE);
	const [orderBy, setOrderBy] = useState<string | undefined>(undefined);
	const [orderDir, setOrderDir] = useState<'asc' | 'desc' | undefined>(undefined);

	const queryReqIdRef = useRef(0);
	const tablesReqIdRef = useRef(0);

	const setPageSize = useCallback((size: number) => {
		setPageSizeRaw(Math.max(1, Math.min(MAX_PAGE_SIZE, size)));
		setPage(0);
	}, []);

	const setOrder = useCallback((by: string | undefined, dir?: 'asc' | 'desc') => {
		setOrderBy(by);
		setOrderDir(dir);
		setPage(0);
	}, []);

	const refreshTables = useCallback(async () => {
		if (!enabled || !agentId) return;
		const reqId = ++tablesReqIdRef.current;
		setLoadingTables(true);
		setError(null);
		try {
			const res = await apiClient.listAppTables(agentId);
			if (reqId !== tablesReqIdRef.current) return;
			if (res.success && res.data) {
				setTables(res.data);
			} else {
				setTables(null);
				setError(res.error?.message ?? 'Failed to load tables');
			}
		} catch (e) {
			if (reqId !== tablesReqIdRef.current) return;
			setError(e instanceof Error ? e.message : String(e));
		} finally {
			if (reqId === tablesReqIdRef.current) setLoadingTables(false);
		}
	}, [agentId, enabled]);

	const refreshQuery = useCallback(async () => {
		if (!enabled || !agentId || !selectedTable) {
			setQueryResult(null);
			return;
		}
		const reqId = ++queryReqIdRef.current;
		setLoadingQuery(true);
		try {
			const res = await apiClient.queryAppTable(agentId, {
				table: selectedTable,
				limit: pageSize,
				offset: page * pageSize,
				orderBy,
				orderDir,
			});
			if (reqId !== queryReqIdRef.current) return;
			if (res.success && res.data) {
				setQueryResult(res.data);
			} else {
				setQueryResult(null);
				setError(res.error?.message ?? 'Failed to load rows');
			}
		} catch (e) {
			if (reqId !== queryReqIdRef.current) return;
			setError(e instanceof Error ? e.message : String(e));
		} finally {
			if (reqId === queryReqIdRef.current) setLoadingQuery(false);
		}
	}, [agentId, enabled, selectedTable, pageSize, page, orderBy, orderDir]);

	const selectTable = useCallback((table: string | null) => {
		setSelectedTable(table);
		setPage(0);
		setOrderBy(undefined);
		setOrderDir(undefined);
		setQueryResult(null);
	}, []);

	const wipe = useCallback(async () => {
		if (!enabled || !agentId) return;
		setLoadingQuery(true);
		try {
			const res = await apiClient.wipeAppDatabase(agentId);
			if (!res.success) {
				setError(res.error?.message ?? 'Wipe failed');
				return;
			}
			setQueryResult(null);
			setTables(null);
			setSelectedTable(null);
			await refreshTables();
		} catch (e) {
			setError(e instanceof Error ? e.message : String(e));
		} finally {
			setLoadingQuery(false);
		}
	}, [agentId, enabled, refreshTables]);

	// Initial + on-enabled-toggle fetch.
	useEffect(() => {
		if (enabled) {
			void refreshTables();
		}
	}, [enabled, refreshTables]);

	// Refresh query when paging / table / order changes.
	useEffect(() => {
		if (enabled && selectedTable) {
			void refreshQuery();
		}
	}, [enabled, selectedTable, page, pageSize, orderBy, orderDir, refreshQuery]);

	return {
		tables,
		queryResult,
		loadingTables,
		loadingQuery,
		error,
		selectedTable,
		page,
		pageSize,
		orderBy,
		orderDir,
		refreshTables,
		refreshQuery,
		selectTable,
		setPage,
		setPageSize,
		setOrder,
		wipe,
	};
}
