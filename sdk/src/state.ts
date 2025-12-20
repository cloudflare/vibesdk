import { TypedEmitter } from './emitter';
import type { AgentWsServerMessage, WsMessageOf } from './types';

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
};

type SessionStateEvents = {
	change: { prev: SessionState; next: SessionState };
};

const INITIAL_STATE: SessionState = {
	connection: 'disconnected',
	generation: { status: 'idle' },
	phase: { status: 'idle' },
	preview: { status: 'idle' },
	cloudflare: { status: 'idle' },
};

function extractPhaseInfo(msg: unknown): { name?: string; description?: string } {
	const phase = (msg as { phase?: { name?: string; description?: string } } | undefined)?.phase;
	return {
		name: phase?.name,
		description: phase?.description,
	};
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
				this.setState({ currentFile: m.filePath });
				break;
			}
			case 'file_generated': {
				const prev = this.state.generation;
				if (prev.status === 'running' || prev.status === 'stopped') {
					this.setState({
						generation: { ...prev, filesGenerated: prev.filesGenerated + 1 },
						currentFile: undefined,
					});
				}
				break;
			}

			case 'phase_generating': {
				const m = msg as WsMessageOf<'phase_generating'>;
				this.setState({ phase: { status: 'generating', ...extractPhaseInfo(m) } });
				break;
			}
			case 'phase_generated': {
				const m = msg as WsMessageOf<'phase_generated'>;
				this.setState({ phase: { status: 'generated', ...extractPhaseInfo(m) } });
				break;
			}
			case 'phase_implementing': {
				const m = msg as WsMessageOf<'phase_implementing'>;
				this.setState({ phase: { status: 'implementing', ...extractPhaseInfo(m) } });
				break;
			}
			case 'phase_implemented': {
				const m = msg as WsMessageOf<'phase_implemented'>;
				this.setState({ phase: { status: 'implemented', ...extractPhaseInfo(m) } });
				break;
			}
			case 'phase_validating': {
				const m = msg as WsMessageOf<'phase_validating'>;
				this.setState({ phase: { status: 'validating', ...extractPhaseInfo(m) } });
				break;
			}
			case 'phase_validated': {
				const m = msg as WsMessageOf<'phase_validated'>;
				this.setState({ phase: { status: 'validated', ...extractPhaseInfo(m) } });
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
				const previewUrl = (m as { previewUrl?: string }).previewUrl;
				if (previewUrl) this.setState({ previewUrl });
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

	private setState(patch: Partial<SessionState>): void {
		const prev = this.state;
		const next: SessionState = { ...prev, ...patch };
		this.state = next;
		this.emitter.emit('change', { prev, next });
	}

	clear(): void {
		this.state = INITIAL_STATE;
		this.emitter.clear();
	}
}
