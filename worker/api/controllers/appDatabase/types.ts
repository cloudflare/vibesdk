import type {
	AppDatabaseColumn,
	AppDatabaseReadResult,
	AppDatabaseTable,
} from '@space-do/space';

export type { AppDatabaseColumn, AppDatabaseReadResult, AppDatabaseTable };

export interface ListAppTablesResponse {
	branch: string;
	tables: AppDatabaseTable[];
}

export interface QueryAppTableResponse {
	branch: string;
	table: string;
	columns: string[];
	rows: Record<string, unknown>[];
	totalCount: number;
	limit: number;
	offset: number;
}

export interface WipeAppDatabaseResponse {
	ok: true;
}
