import { TypedEmitter } from './emitter';
import type { AgentWsServerMessage, WsMessageOf, PhaseInfo, PhaseFile, BehaviorType, ProjectType, PhaseTimelineEvent, PhaseTimelineChangeType } from './types';
import type { AgentState } from './protocol';

export type ConnectionState = 'disconnected' | 'connecting' | 'connected';

export type GenerationState =
	| { status: 'idle' }
	| { status: 'running'; totalFiles?: number; filesGenerated: number }
	| { status: 'stopped'; instanceId?: string; filesGenerated: number }
	| { status: 'complete'; instanceId?: string; previewURL?: string; filesGenerated: number };

export type PhaseState =
	| { status: 'idle' }
	| {
			status: 'generating' | 'generated' | 'implementing' | 'implemented' | 'validating' | 'validated';
			name?: string;
			description?: string;
	  };

export type PreviewDeploymentState =
	| { status: 'idle' }
	| { status: 'running' }
	| { status: 'failed'; error: string }
	| { status: 'complete'; previewURL: string; tunnelURL: string; instanceId: string };

export type CloudflareDeploymentState =
	| { status: 'idle' }
	| { status: 'running'; instanceId?: string }
	| { status: 'failed'; error: string; instanceId?: string }
	| { status: 'complete'; deploymentUrl: string; instanceId: string; workersUrl?: string };

export type ConversationState = WsMessageOf<'conversation_state'>['state'];

export type SessionState = {
	connection: ConnectionState;
	conversationState?: ConversationState;
	lastConversationResponse?: WsMessageOf<'conversation_response'>;
	generation: GenerationState;
	phase: PhaseState;

	/** Currently generating file path (set on file_generating, cleared on file_generated). */
	currentFile?: string;

	/** Best-known preview url (from agent_connected, generation_complete, deployment_completed). */
	previewUrl?: string;
	preview: PreviewDeploymentState;

	cloudflare: CloudflareDeploymentState;
	lastError?: string;

	// =========================================================================
	// Phase Timeline (seeded from agent_connected, updated on phase events)
	// =========================================================================

	/** Full phase timeline with status and files for each phase. */
	phases: PhaseInfo[];

	// =========================================================================
	// Agent Metadata (seeded from agent_connected)
	// =========================================================================

	/** Behavior type of the agent (phasic or agentic). */
	behaviorType?: BehaviorType;

	/** Project type (app, workflow, presentation, general). */
	projectType?: ProjectType;

	/** Original user query that started this build. */
	query?: string;

	/** Whether the agent should be actively generating. */
	shouldBeGenerating?: boolean;

	/** Project name from the blueprint. */
	projectName?: string;
};

type SessionStateEvents = {
	change: { prev: SessionState; next: SessionState };
	phaseChange: PhaseTimelineEvent;
};

const INITIAL_STATE: SessionState = {
	connection: 'disconnected',
	generation: { status: 'idle' },
	phase: { status: 'idle' },
	preview: { status: 'idle' },
	cloudflare: { status: 'idle' },
	phases: [],
};

function extractPhaseInfo(msg: unknown): { name?: string; description?: string } {
	const phase = (msg as { phase?: { name?: string; description?: string } } | undefined)?.phase;
	return {
		name: phase?.name,
		description: phase?.description,
	};
}

function extractPhaseFiles(
	msg: unknown,
): { path: string; purpose: string }[] | undefined {
	const phase = (msg as { phase?: { files?: { path: string; purpose: string }[] } } | undefined)?.phase;
	return phase?.files;
}

function isPhasicState(state: AgentState): state is AgentState & { generatedPhases: Array<{ name: string; description: string; files: { path: string; purpose: string }[]; completed: boolean }> } {
	return state.behaviorType === 'phasic' && 'generatedPhases' in state;
}

/**
 * Build phase timeline from agent state (used on agent_connected).
 */
function buildPhaseTimelineFromState(
	state: AgentState,
	generatedFilesMap: Record<string, unknown>,
): PhaseInfo[] {
	if (!isPhasicState(state)) return [];

	const isActivelyGenerating = state.shouldBeGenerating === true;

	return state.generatedPhases.map((phase, index) => {
		// Determine phase status based on completion and generation state
		let status: PhaseInfo['status'];
		if (phase.completed) {
			status = 'completed';
		} else if (!isActivelyGenerating) {
			status = 'cancelled';
		} else {
			status = 'generating';
		}

		const files: PhaseFile[] = phase.files.map((f) => {
			const fileExists = f.path in generatedFilesMap;
			let fileStatus: PhaseFile['status'];
			if (fileExists) {
				fileStatus = 'completed';
			} else if (!isActivelyGenerating) {
				fileStatus = 'cancelled';
			} else {
				fileStatus = 'pending';
			}
			return {
				path: f.path,
				purpose: f.purpose,
				status: fileStatus,
			};
		});

		return {
			id: `phase-${index}`,
			name: phase.name,
			description: phase.description,
			status,
			files,
		};
	});
}

export class SessionStateStore {
	private state: SessionState = INITIAL_STATE;
	private emitter = new TypedEmitter<SessionStateEvents>();

	get(): SessionState {
		return this.state;
	}

	onChange(cb: (next: SessionState, prev: SessionState) => void): () => void {
		return this.emitter.on('change', ({ prev, next }) => cb(next, prev));
	}

	/**
	 * Subscribe to phase timeline changes.
	 * Fires when a phase is added or when a phase's status/files change.
	 */
	onPhaseChange(cb: (event: PhaseTimelineEvent) => void): () => void {
		return this.emitter.on('phaseChange', cb);
	}

	setConnection(state: ConnectionState): void {
		this.setState({ connection: state });
	}

	applyWsMessage(msg: AgentWsServerMessage): void {
		switch (msg.type) {
			case 'conversation_state': {
				const m = msg as WsMessageOf<'conversation_state'>;
				this.setState({ conversationState: m.state });
				break;
			}
			case 'conversation_response': {
				const m = msg as WsMessageOf<'conversation_response'>;
				this.setState({ lastConversationResponse: m });
				break;
			}
			case 'generation_started': {
				const m = msg as WsMessageOf<'generation_started'>;
				this.setState({
					generation: { status: 'running', totalFiles: m.totalFiles, filesGenerated: 0 },
					currentFile: undefined,
				});
				break;
			}
			case 'generation_complete': {
				const m = msg as WsMessageOf<'generation_complete'>;
				const previewURL = (m as { previewURL?: string }).previewURL;
				const prev = this.state.generation;
				const filesGenerated = 'filesGenerated' in prev ? prev.filesGenerated : 0;
				this.setState({
					generation: {
						status: 'complete',
						instanceId: m.instanceId,
						previewURL,
						filesGenerated,
					},
					currentFile: undefined,
					...(previewURL ? { previewUrl: previewURL } : {}),
				});
				break;
			}
			case 'generation_stopped': {
				const m = msg as WsMessageOf<'generation_stopped'>;
				const prev = this.state.generation;
				const filesGenerated = 'filesGenerated' in prev ? prev.filesGenerated : 0;
				this.setState({
					generation: { status: 'stopped', instanceId: m.instanceId, filesGenerated },
				});
				break;
			}
			case 'generation_resumed': {
				const prev = this.state.generation;
				const filesGenerated = 'filesGenerated' in prev ? prev.filesGenerated : 0;
				this.setState({ generation: { status: 'running', filesGenerated } });
				break;
			}

			case 'file_generating': {
				const m = msg as WsMessageOf<'file_generating'>;
				// Update file status in phases
				const phasesWithGenerating = this.updateFileStatus(m.filePath, 'generating');
				this.setState({ currentFile: m.filePath, phases: phasesWithGenerating });
				break;
			}
			case 'file_generated': {
				const m = msg as WsMessageOf<'file_generated'>;
				const filePath = (m.file as { filePath?: string })?.filePath;
				const prev = this.state.generation;

				// Update file status in phases
				const phasesWithCompleted = filePath
					? this.updateFileStatus(filePath, 'completed')
					: this.state.phases;

				if (prev.status === 'running' || prev.status === 'stopped') {
					this.setState({
						generation: { ...prev, filesGenerated: prev.filesGenerated + 1 },
						currentFile: undefined,
						phases: phasesWithCompleted,
					});
				} else {
					this.setState({ phases: phasesWithCompleted, currentFile: undefined });
				}
				break;
			}

			case 'phase_generating': {
				const m = msg as WsMessageOf<'phase_generating'>;
				const phaseInfo = extractPhaseInfo(m);
				const phaseFiles = extractPhaseFiles(m);

				// Add or update phase in timeline
				const phases = this.updateOrAddPhase(phaseInfo, 'generating', phaseFiles);

				this.setState({
					phase: { status: 'generating', ...phaseInfo },
					phases,
				});
				break;
			}
			case 'phase_generated': {
				const m = msg as WsMessageOf<'phase_generated'>;
				const phaseInfo = extractPhaseInfo(m);
				const phaseFiles = extractPhaseFiles(m);

				// Update phase status in timeline
				const phases = this.updateOrAddPhase(phaseInfo, 'implementing', phaseFiles);

				this.setState({
					phase: { status: 'generated', ...phaseInfo },
					phases,
				});
				break;
			}
			case 'phase_implementing': {
				const m = msg as WsMessageOf<'phase_implementing'>;
				const phaseInfo = extractPhaseInfo(m);
				const phaseFiles = extractPhaseFiles(m);

				const phases = this.updateOrAddPhase(phaseInfo, 'implementing', phaseFiles);

				this.setState({
					phase: { status: 'implementing', ...phaseInfo },
					phases,
				});
				break;
			}
			case 'phase_implemented': {
				const m = msg as WsMessageOf<'phase_implemented'>;
				const phaseInfo = extractPhaseInfo(m);
				const phaseFiles = extractPhaseFiles(m);

				const phases = this.updateOrAddPhase(phaseInfo, 'validating', phaseFiles);

				this.setState({
					phase: { status: 'implemented', ...phaseInfo },
					phases,
				});
				break;
			}
			case 'phase_validating': {
				const m = msg as WsMessageOf<'phase_validating'>;
				const phaseInfo = extractPhaseInfo(m);
				const phaseFiles = extractPhaseFiles(m);

				const phases = this.updateOrAddPhase(phaseInfo, 'validating', phaseFiles);

				this.setState({
					phase: { status: 'validating', ...phaseInfo },
					phases,
				});
				break;
			}
			case 'phase_validated': {
				const m = msg as WsMessageOf<'phase_validated'>;
				const phaseInfo = extractPhaseInfo(m);
				const phaseFiles = extractPhaseFiles(m);

				// Mark phase as completed
				const phases = this.updateOrAddPhase(phaseInfo, 'completed', phaseFiles);

				this.setState({
					phase: { status: 'validated', ...phaseInfo },
					phases,
				});
				break;
			}

			case 'deployment_started': {
				this.setState({ preview: { status: 'running' } });
				break;
			}
			case 'deployment_failed': {
				const m = msg as WsMessageOf<'deployment_failed'>;
				this.setState({ preview: { status: 'failed', error: m.error } });
				break;
			}
			case 'deployment_completed': {
				const m = msg as WsMessageOf<'deployment_completed'>;
				this.setState({
					previewUrl: m.previewURL,
					preview: {
						status: 'complete',
						previewURL: m.previewURL,
						tunnelURL: m.tunnelURL,
						instanceId: m.instanceId,
					},
				});
				break;
			}

			case 'cloudflare_deployment_started': {
				const m = msg as WsMessageOf<'cloudflare_deployment_started'>;
				this.setState({ cloudflare: { status: 'running', instanceId: m.instanceId } });
				break;
			}
			case 'cloudflare_deployment_error': {
				const m = msg as WsMessageOf<'cloudflare_deployment_error'>;
				this.setState({
					cloudflare: { status: 'failed', error: m.error, instanceId: m.instanceId },
				});
				break;
			}
			case 'cloudflare_deployment_completed': {
				const m = msg as WsMessageOf<'cloudflare_deployment_completed'>;
				this.setState({
					cloudflare: {
						status: 'complete',
						deploymentUrl: m.deploymentUrl,
						workersUrl: (m as { workersUrl?: string }).workersUrl,
						instanceId: m.instanceId,
					},
				});
				break;
			}

			case 'agent_connected': {
				const m = msg as WsMessageOf<'agent_connected'>;
				const agentState = m.state;
				const previewUrl = (m as { previewUrl?: string }).previewUrl;

				// Build phase timeline from agent state
				const phases = buildPhaseTimelineFromState(agentState, agentState.generatedFilesMap ?? {});

				// Determine generation state from agent state
				let generation = this.state.generation;
				if (agentState.shouldBeGenerating) {
					const filesGenerated = Object.keys(agentState.generatedFilesMap ?? {}).length;
					generation = { status: 'running', filesGenerated };
				}

				this.setState({
					previewUrl,
					phases,
					generation,
					behaviorType: agentState.behaviorType,
					projectType: agentState.projectType,
					query: agentState.query,
					shouldBeGenerating: agentState.shouldBeGenerating,
					projectName: agentState.projectName,
				});
				break;
			}

			case 'error': {
				const m = msg as WsMessageOf<'error'>;
				this.setState({ lastError: m.error });
				break;
			}
			default:
				break;
		}
	}

	/**
	 * Update the status of a file in the phase timeline.
	 */
	private updateFileStatus(filePath: string, status: PhaseFile['status']): PhaseInfo[] {
		return this.state.phases.map((phase) => ({
			...phase,
			files: phase.files.map((f) =>
				f.path === filePath ? { ...f, status } : f,
			),
		}));
	}

	/**
	 * Update an existing phase or add a new one to the timeline.
	 */
	private updateOrAddPhase(
		phaseInfo: { name?: string; description?: string },
		status: PhaseInfo['status'],
		phaseFiles?: { path: string; purpose: string }[],
	): PhaseInfo[] {
		const phases = [...this.state.phases];

		// Find existing phase by name
		const existingIndex = phases.findIndex((p) => p.name === phaseInfo.name);

		const files: PhaseFile[] = (phaseFiles ?? []).map((f) => ({
			path: f.path,
			purpose: f.purpose,
			status: status === 'completed' ? 'completed' : 'pending',
		}));

		if (existingIndex >= 0) {
			// Update existing phase
			phases[existingIndex] = {
				...phases[existingIndex]!,
				status,
				description: phaseInfo.description ?? phases[existingIndex]!.description,
				files: files.length > 0 ? files : phases[existingIndex]!.files,
			};
		} else if (phaseInfo.name) {
			// Add new phase
			phases.push({
				id: `phase-${phases.length}`,
				name: phaseInfo.name,
				description: phaseInfo.description ?? '',
				status,
				files,
			});
		}

		return phases;
	}

	private setState(patch: Partial<SessionState>): void {
		const prev = this.state;
		const next: SessionState = { ...prev, ...patch };
		this.state = next;
		this.emitter.emit('change', { prev, next });

		// Emit phase change events if phases array changed
		if (patch.phases && patch.phases !== prev.phases) {
			this.emitPhaseChanges(prev.phases, patch.phases);
		}
	}

	/**
	 * Compare old and new phases arrays and emit change events.
	 */
	private emitPhaseChanges(prevPhases: PhaseInfo[], nextPhases: PhaseInfo[]): void {
		// Check for new phases (added)
		for (const phase of nextPhases) {
			const prevPhase = prevPhases.find((p) => p.id === phase.id);
			if (!prevPhase) {
				// New phase added
				this.emitter.emit('phaseChange', {
					type: 'added',
					phase,
					allPhases: nextPhases,
				});
			} else if (this.hasPhaseChanged(prevPhase, phase)) {
				// Existing phase updated
				this.emitter.emit('phaseChange', {
					type: 'updated',
					phase,
					allPhases: nextPhases,
				});
			}
		}
	}

	/**
	 * Check if a phase has meaningfully changed (status or file statuses).
	 */
	private hasPhaseChanged(prev: PhaseInfo, next: PhaseInfo): boolean {
		if (prev.status !== next.status) return true;
		if (prev.files.length !== next.files.length) return true;
		for (let i = 0; i < prev.files.length; i++) {
			if (prev.files[i]!.status !== next.files[i]!.status) return true;
		}
		return false;
	}

	clear(): void {
		this.state = INITIAL_STATE;
		this.emitter.clear();
	}
}
