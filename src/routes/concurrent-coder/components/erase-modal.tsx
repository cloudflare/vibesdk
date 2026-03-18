import { useState, useEffect, useCallback } from 'react';
import { apiClient } from '@/lib/api-client';

interface SessionRecord {
	id: string;
	prompt: string;
	status: string;
	created_at: string;
}

interface EraseModalProps {
	open: boolean;
	onClose: () => void;
}

export function EraseModal({ open, onClose }: EraseModalProps) {
	const [history, setHistory] = useState<SessionRecord[]>([]);
	const [selectedSessions, setSelectedSessions] = useState<string[]>([]);
	const [eraseLongTerm, setEraseLongTerm] = useState(false);
	const [loading, setLoading] = useState(false);

	const fetchHistory = useCallback(async () => {
		setLoading(true);
		try {
			const res = await apiClient.getCoderHistory();
			setHistory(res.data as SessionRecord[]);
		} catch {
			// ignore
		} finally {
			setLoading(false);
		}
	}, []);

	useEffect(() => {
		if (open) {
			fetchHistory();
		}
	}, [open, fetchHistory]);

	const toggleSession = (id: string) => {
		setSelectedSessions((prev) =>
			prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id],
		);
	};

	const handleErase = async () => {
		if (selectedSessions.length === 0) return;

		await apiClient.eraseCoderSessions(selectedSessions, eraseLongTerm);

		setSelectedSessions([]);
		setEraseLongTerm(false);
		onClose();
	};

	if (!open) return null;

	return (
		<div className="fixed inset-0 z-50 flex items-center justify-center">
			<div className="absolute inset-0 bg-black/50" onClick={onClose} />
			<div className="relative bg-background rounded-xl shadow-xl border p-6 w-full max-w-lg mx-4">
				<h2 className="text-lg font-semibold mb-2">
					Erase Prompt History & Memory
				</h2>
				<p className="text-sm text-muted-foreground mb-4">
					Select sessions you want to forget:
				</p>

				{loading ? (
					<div className="text-center py-8 text-muted-foreground">Loading...</div>
				) : history.length === 0 ? (
					<div className="text-center py-8 text-muted-foreground">
						No sessions found.
					</div>
				) : (
					<div className="max-h-[300px] overflow-y-auto space-y-1 mb-4">
						{history.map((s) => (
							<label
								key={s.id}
								className="flex items-start gap-2 p-2 rounded hover:bg-muted/50 cursor-pointer"
							>
								<input
									type="checkbox"
									checked={selectedSessions.includes(s.id)}
									onChange={() => toggleSession(s.id)}
									className="mt-1"
								/>
								<div className="flex-1 min-w-0">
									<p className="text-sm truncate">
										{s.prompt.substring(0, 80)}
										{s.prompt.length > 80 ? '...' : ''}
									</p>
									<p className="text-xs text-muted-foreground">
										{new Date(s.created_at).toLocaleDateString()} · {s.status}
									</p>
								</div>
							</label>
						))}
					</div>
				)}

				<label className="flex items-center gap-2 mb-4 text-sm">
					<input
						type="checkbox"
						checked={eraseLongTerm}
						onChange={(e) => setEraseLongTerm(e.target.checked)}
					/>
					Also erase long-term AI memory (embeddings) for these projects
				</label>

				<div className="flex items-center justify-between">
					<p className="text-xs text-destructive">This cannot be undone.</p>
					<div className="flex gap-2">
						<button
							onClick={onClose}
							className="px-4 py-2 text-sm border rounded-md hover:bg-muted"
						>
							Cancel
						</button>
						<button
							onClick={handleErase}
							disabled={selectedSessions.length === 0}
							className="px-4 py-2 text-sm bg-destructive text-destructive-foreground rounded-md hover:opacity-90 disabled:opacity-50"
						>
							Erase Selected
						</button>
					</div>
				</div>
			</div>
		</div>
	);
}
