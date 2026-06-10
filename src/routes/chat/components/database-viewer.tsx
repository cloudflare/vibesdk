/**
 * DatabaseViewer — read-only inspector for the space-generated app's
 * Durable Object SQLite storage.
 *
 * The LLM exports `class App extends DurableObject`. SpaceDO hosts it as
 * a Facet; the inspector wrapper injected into the dynamic worker adds
 * `__vibeInspect*` methods to a subclass of App without forcing the LLM
 * to write any boilerplate. This component just hits the host inspector
 * endpoints (see `worker/api/controllers/appDatabase`).
 */
import { useState } from 'react';
import {
	Database as DatabaseIcon,
	RefreshCw,
	ChevronLeft,
	ChevronRight,
	Trash2,
} from 'lucide-react';
import clsx from 'clsx';
import { useDatabaseViewer } from '../hooks/use-database-viewer';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

interface DatabaseViewerProps {
	agentId: string;
	enabled: boolean;
}

const PAGE_SIZE_OPTIONS = [25, 50, 100, 200];
const MAX_INLINE_CELL_LEN = 80;

export function DatabaseViewer({ agentId, enabled }: DatabaseViewerProps) {
	const state = useDatabaseViewer(agentId, { enabled });
	const {
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
	} = state;

	const [expandedCell, setExpandedCell] = useState<{ column: string; value: unknown } | null>(null);
	const [confirmingWipe, setConfirmingWipe] = useState(false);

	const totalPages = queryResult ? Math.max(1, Math.ceil(queryResult.totalCount / pageSize)) : 1;

	const refreshAll = async () => {
		await refreshTables();
		if (selectedTable) await refreshQuery();
	};

	const onColumnHeaderClick = (column: string) => {
		if (orderBy === column) {
			if (orderDir === 'asc') setOrder(column, 'desc');
			else if (orderDir === 'desc') setOrder(undefined, undefined);
			else setOrder(column, 'asc');
		} else {
			setOrder(column, 'asc');
		}
	};

	return (
		<div className="flex-1 flex flex-col overflow-hidden bg-bg-3 text-text-primary">
			<div className="flex items-center gap-2 px-3 py-2 border-b border-bg-2 bg-bg-4/40">
				<DatabaseIcon className="size-4 text-text-50/70" />
				<span className="text-xs font-mono text-text-50/70">App database</span>
				<span className="text-xs text-text-50/40 ml-2">read-only</span>
				<div className="ml-auto flex items-center gap-1">
					<button
						className="p-1 hover:bg-bg-2 rounded transition-colors text-text-50/70"
						onClick={() => void refreshAll()}
						title="Refresh"
					>
						<RefreshCw
							className={clsx('size-4', (loadingTables || loadingQuery) && 'animate-spin')}
						/>
					</button>
					<button
						className="p-1 hover:bg-bg-2 rounded transition-colors text-red-500/80 hover:text-red-500"
						onClick={() => setConfirmingWipe(true)}
						title="Reset database"
					>
						<Trash2 className="size-4" />
					</button>
				</div>
			</div>

			{error && (
				<div className="px-3 py-2 text-xs text-red-400 bg-red-500/10 border-b border-red-500/20">
					{error}
				</div>
			)}

			<div className="flex-1 flex overflow-hidden">
				<div className="w-56 border-r border-bg-2 overflow-y-auto bg-bg-4/20 flex flex-col">
					<div className="px-3 py-2 text-[10px] uppercase tracking-wider text-text-50/40 font-mono">
						Tables
					</div>
					{loadingTables && (
						<div className="px-3 py-2 text-xs text-text-50/50">Loading…</div>
					)}
					{!loadingTables && tables && tables.tables.length === 0 && (
						<div className="px-3 py-4 text-xs text-text-50/50 leading-relaxed">
							No tables yet.
							<br />
							Your app hasn't written anything to its database yet.
						</div>
					)}
					{tables?.tables.map((t) => (
						<button
							key={t.name}
							onClick={() => selectTable(t.name)}
							className={clsx(
								'flex items-center justify-between px-3 py-1.5 text-xs font-mono text-left hover:bg-bg-2 transition-colors',
								selectedTable === t.name && 'bg-bg-2 text-text-primary',
							)}
						>
							<span className="truncate">{t.name}</span>
							<span className="text-text-50/40 ml-2">{t.rowCount}</span>
						</button>
					))}
				</div>

				<div className="flex-1 flex flex-col overflow-hidden">
					{!selectedTable && (
						<div className="flex-1 flex items-center justify-center text-text-50/50 text-sm">
							Select a table to view rows
						</div>
					)}
					{selectedTable && (
						<>
							<div className="flex-1 overflow-auto">
								{loadingQuery && !queryResult && (
									<div className="p-4 text-xs text-text-50/50">Loading rows…</div>
								)}
								{queryResult && queryResult.rows.length === 0 && (
									<div className="p-4 text-xs text-text-50/50">No rows.</div>
								)}
								{queryResult && queryResult.rows.length > 0 && (
									<table className="w-full text-xs font-mono">
										<thead className="sticky top-0 bg-bg-4 border-b border-bg-2">
											<tr>
												{queryResult.columns.map((col) => (
													<th
														key={col}
														onClick={() => onColumnHeaderClick(col)}
														className="px-3 py-1.5 text-left font-medium text-text-50/70 cursor-pointer select-none hover:bg-bg-2"
													>
														{col}
														{orderBy === col && (
															<span className="ml-1 text-text-primary">
																{orderDir === 'asc' ? '↑' : '↓'}
															</span>
														)}
													</th>
												))}
											</tr>
										</thead>
										<tbody>
											{queryResult.rows.map((row, i) => (
												<tr
													key={i}
													className="border-b border-bg-2/50 hover:bg-bg-2/30"
												>
													{queryResult.columns.map((col) => (
														<td key={col} className="px-3 py-1.5 align-top">
															<CellValue
																value={row[col]}
																onExpand={(v) =>
																	setExpandedCell({ column: col, value: v })
																}
															/>
														</td>
													))}
												</tr>
											))}
										</tbody>
									</table>
								)}
							</div>
							{queryResult && (
								<div className="flex items-center gap-3 px-3 py-2 border-t border-bg-2 bg-bg-4/40 text-xs">
									<span className="text-text-50/60">
										{queryResult.totalCount.toLocaleString()} rows
									</span>
									<span className="text-text-50/30">·</span>
									<span className="text-text-50/60">
										Page {page + 1} / {totalPages}
									</span>
									<button
										className="p-1 rounded hover:bg-bg-2 text-text-50/60 hover:text-text-primary disabled:opacity-30 disabled:cursor-not-allowed"
										onClick={() => setPage(Math.max(0, page - 1))}
										disabled={page === 0}
									>
										<ChevronLeft className="size-3.5" />
									</button>
									<button
										className="p-1 rounded hover:bg-bg-2 text-text-50/60 hover:text-text-primary disabled:opacity-30 disabled:cursor-not-allowed"
										onClick={() => setPage(Math.min(totalPages - 1, page + 1))}
										disabled={page >= totalPages - 1}
									>
										<ChevronRight className="size-3.5" />
									</button>
									<div className="ml-auto flex items-center gap-1">
										<span className="text-text-50/50">per page</span>
										<select
											value={pageSize}
											onChange={(e) => setPageSize(Number(e.target.value))}
											className="bg-bg-2 border border-bg-1 rounded px-1 py-0.5 text-text-primary"
										>
											{PAGE_SIZE_OPTIONS.map((n) => (
												<option key={n} value={n}>
													{n}
												</option>
											))}
										</select>
									</div>
								</div>
							)}
						</>
					)}
				</div>
			</div>

			<Dialog open={!!expandedCell} onOpenChange={(open) => !open && setExpandedCell(null)}>
				<DialogContent className="max-w-3xl">
					<DialogHeader>
						<DialogTitle className="font-mono text-sm">{expandedCell?.column}</DialogTitle>
					</DialogHeader>
					{expandedCell && (
						<div className="overflow-auto max-h-[60vh]">
							<ExpandedCellView value={expandedCell.value} />
						</div>
					)}
				</DialogContent>
			</Dialog>

			<Dialog open={confirmingWipe} onOpenChange={setConfirmingWipe}>
				<DialogContent className="max-w-md">
					<DialogHeader>
						<DialogTitle>Reset app database?</DialogTitle>
					</DialogHeader>
					<p className="text-sm text-text-50/80">
						This drops every table in your app's Durable Object. The next request the app
						handles will recreate whatever schema its <code>CREATE TABLE IF NOT EXISTS</code>{' '}
						calls define. This cannot be undone.
					</p>
					<div className="flex justify-end gap-2 mt-4">
						<Button variant="outline" onClick={() => setConfirmingWipe(false)}>
							Cancel
						</Button>
						<Button
							variant="destructive"
							onClick={async () => {
								await wipe();
								setConfirmingWipe(false);
							}}
						>
							Reset
						</Button>
					</div>
				</DialogContent>
			</Dialog>
		</div>
	);
}

// ─── Cell rendering ─────────────────────────────────────────────────────────

function CellValue({
	value,
	onExpand,
}: {
	value: unknown;
	onExpand: (v: unknown) => void;
}) {
	if (value === null || value === undefined) {
		return <span className="text-text-50/30 italic">null</span>;
	}
	if (typeof value === 'number' || typeof value === 'boolean') {
		return <span>{String(value)}</span>;
	}
	if (typeof value === 'string') {
		if (value.length <= MAX_INLINE_CELL_LEN) {
			return <span className="break-all">{value}</span>;
		}
		return (
			<button
				className="text-left text-text-primary/80 hover:text-text-primary underline-offset-2 hover:underline truncate block w-full"
				onClick={() => onExpand(value)}
				title="Click to view full value"
			>
				{value.slice(0, MAX_INLINE_CELL_LEN)}…
			</button>
		);
	}
	const repr = typeof value === 'object' ? JSON.stringify(value) : String(value);
	if (repr.length <= MAX_INLINE_CELL_LEN) {
		return <span>{repr}</span>;
	}
	return (
		<button
			className="text-left text-text-primary/80 hover:text-text-primary underline-offset-2 hover:underline truncate block w-full"
			onClick={() => onExpand(value)}
		>
			{repr.slice(0, MAX_INLINE_CELL_LEN)}…
		</button>
	);
}

function ExpandedCellView({ value }: { value: unknown }) {
	if (value === null || value === undefined) {
		return <pre className="text-xs">null</pre>;
	}
	if (typeof value === 'string') {
		try {
			const parsed = JSON.parse(value);
			return (
				<pre className="text-xs font-mono whitespace-pre-wrap break-all">
					{JSON.stringify(parsed, null, 2)}
				</pre>
			);
		} catch {
			return (
				<pre className="text-xs font-mono whitespace-pre-wrap break-all">{value}</pre>
			);
		}
	}
	if (typeof value === 'object') {
		return (
			<pre className="text-xs font-mono whitespace-pre-wrap break-all">
				{JSON.stringify(value, null, 2)}
			</pre>
		);
	}
	return <pre className="text-xs font-mono">{String(value)}</pre>;
}
