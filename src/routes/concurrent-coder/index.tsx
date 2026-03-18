import { useState, useEffect, useCallback } from 'react';
import { Timeline } from './components/timeline';
import { SkillsManager } from './components/skills-manager';
import { EraseModal } from './components/erase-modal';

const API_BASE = '/api/cc';

interface TimelineEvent {
	id: string;
	sessionId: string;
	agent: string;
	action: string;
	detail: string;
	timestamp: string;
}

interface SessionStatus {
	id: string;
	prompt: string;
	status: string;
	created_at: string;
}

export default function ConcurrentCoderDashboard() {
	const [prompt, setPrompt] = useState('');
	const [sessionId, setSessionId] = useState<string | null>(null);
	const [status, setStatus] = useState<SessionStatus | null>(null);
	const [events, setEvents] = useState<TimelineEvent[]>([]);
	const [autoMode, setAutoMode] = useState(false);
	const [showEraseModal, setShowEraseModal] = useState(false);
	const [activeTab, setActiveTab] = useState<'timeline' | 'skills'>('timeline');
	const [submitting, setSubmitting] = useState(false);

	// Poll timeline + status while session is running
	const pollSession = useCallback(async () => {
		if (!sessionId) return;

		try {
			const [timelineRes, statusRes] = await Promise.all([
				fetch(`${API_BASE}/timeline?sessionId=${sessionId}`),
				fetch(`${API_BASE}/status?sessionId=${sessionId}`),
			]);

			const timelineData = await timelineRes.json();
			const statusData = await statusRes.json();

			setEvents(timelineData);
			setStatus(statusData);
		} catch {
			// ignore polling errors
		}
	}, [sessionId]);

	useEffect(() => {
		if (!sessionId) return;

		pollSession();
		const interval = setInterval(pollSession, 2000);
		return () => clearInterval(interval);
	}, [sessionId, pollSession]);

	// Start a new session
	const handleStart = async () => {
		if (!prompt.trim()) return;
		setSubmitting(true);

		try {
			const res = await fetch(`${API_BASE}/run`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ prompt }),
			});
			const data = await res.json();
			setSessionId(data.sessionId);
			setEvents([]);
			setStatus(null);
		} catch {
			// ignore
		} finally {
			setSubmitting(false);
		}
	};

	// Stop (abort)
	const handleStop = async () => {
		if (!sessionId) return;
		await fetch(`${API_BASE}/stop`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ sessionId }),
		});
		await pollSession();
	};

	// Toggle auto mode
	const handleAutoToggle = async () => {
		if (!sessionId) return;
		const newValue = !autoMode;
		await fetch(`${API_BASE}/auto`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ sessionId, enabled: newValue }),
		});
		setAutoMode(newValue);
	};

	const isRunning = status?.status === 'running';
	const isPaused = status?.status === 'paused';

	return (
		<div className="flex flex-col h-full max-w-5xl mx-auto p-4 gap-4">
			{/* Header */}
			<div className="flex items-center justify-between">
				<div>
					<h1 className="text-2xl font-bold">Concurrent Coder</h1>
					<p className="text-sm text-muted-foreground">
						AI swarm coding assistant — 6 specialist agents
					</p>
				</div>
				<button
					onClick={() => setShowEraseModal(true)}
					className="px-3 py-2 text-sm bg-destructive text-destructive-foreground rounded-md hover:opacity-90"
				>
					Erase History
				</button>
			</div>

			{/* Prompt input */}
			<div className="flex gap-2">
				<textarea
					value={prompt}
					onChange={(e) => setPrompt(e.target.value)}
					placeholder="Describe the app you want to build..."
					rows={3}
					className="flex-1 px-4 py-3 rounded-lg border bg-background text-sm resize-none"
					disabled={isRunning}
				/>
				<div className="flex flex-col gap-2">
					<button
						onClick={handleStart}
						disabled={!prompt.trim() || isRunning || submitting}
						className="px-6 py-2 text-sm bg-primary text-primary-foreground rounded-md hover:opacity-90 disabled:opacity-50"
					>
						{submitting ? 'Starting...' : 'Build'}
					</button>
				</div>
			</div>

			{/* Controls */}
			{sessionId && (
				<div className="flex items-center gap-3">
					<button
						onClick={handleStop}
						disabled={!isRunning && !isPaused}
						className="px-4 py-2 text-sm border border-destructive text-destructive rounded-md hover:bg-destructive/10 disabled:opacity-50"
					>
						&#9209; Stop
					</button>
					<button
						onClick={handleAutoToggle}
						className={`px-4 py-2 text-sm rounded-md border ${
							autoMode
								? 'bg-primary text-primary-foreground border-primary'
								: 'border-border hover:bg-muted'
						}`}
					>
						&#128260; Auto {autoMode ? 'ON' : 'OFF'}
					</button>
					{status && (
						<span className="ml-auto text-sm text-muted-foreground">
							Status:{' '}
							<span
								className={`font-semibold ${
									isRunning
										? 'text-green-500'
										: isPaused
											? 'text-yellow-500'
											: status.status === 'completed'
												? 'text-blue-500'
												: status.status === 'aborted' || status.status === 'failed'
													? 'text-red-500'
													: ''
								}`}
							>
								{status.status}
							</span>
						</span>
					)}
				</div>
			)}

			{/* Tabs */}
			<div className="flex border-b">
				<button
					onClick={() => setActiveTab('timeline')}
					className={`px-4 py-2 text-sm border-b-2 -mb-px ${
						activeTab === 'timeline'
							? 'border-primary text-foreground'
							: 'border-transparent text-muted-foreground hover:text-foreground'
					}`}
				>
					Live Timeline
				</button>
				<button
					onClick={() => setActiveTab('skills')}
					className={`px-4 py-2 text-sm border-b-2 -mb-px ${
						activeTab === 'skills'
							? 'border-primary text-foreground'
							: 'border-transparent text-muted-foreground hover:text-foreground'
					}`}
				>
					Skills Manager
				</button>
			</div>

			{/* Content */}
			<div className="flex-1 border rounded-lg overflow-hidden">
				{activeTab === 'timeline' ? (
					<Timeline events={events} />
				) : (
					<SkillsManager apiBase={API_BASE} />
				)}
			</div>

			{/* Erase Modal */}
			<EraseModal
				apiBase={API_BASE}
				open={showEraseModal}
				onClose={() => setShowEraseModal(false)}
			/>
		</div>
	);
}
