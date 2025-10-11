// Type declarations for Bun's built-in SQLite module
declare module 'bun:sqlite' {
	export interface Statement<T = unknown, Params extends unknown[] = unknown[]> {
		all(...params: Params): T[];
		get(...params: Params): T | null;
		run(...params: Params): { changes: number };
	}

	export class Database {
		constructor(filename: string);

		query<T = unknown, Params extends unknown[] = unknown[]>(sql: string): Statement<T, Params>;
		prepare<T = unknown, Params extends unknown[] = unknown[]>(sql: string): Statement<T, Params>;
		exec(sql: string): void;
		close(): void;
		transaction<TArgs extends unknown[], TResult>(fn: (...args: TArgs) => TResult): (...args: TArgs) => TResult;
	}
}
