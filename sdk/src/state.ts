import { TypedEmitter } from './emitter';
import type { AgentWsServerMessage, WsMessageOf } from './types';

export type GenerationState =
	| { status: 'idle' }
	| { status: 'running'; totalFiles?: number }
	| { status: 'stopped'; instanceId?: string }
	| { status: 'complete'; instanceId?: string; previewURL?: string };

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
	conversationState?: ConversationState;
	lastConversationResponse?: WsMessageOf<'conversation_response'>;
	generation: GenerationState;
	phase: PhaseState;

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
	generation: { status: 'idle' },
	phase: { status: 'idle' },
	preview: { status: 'idle' },
	cloudflare: { status: 'idle' },
};

function extractPhaseInfo(msg: {
	phase?: { name?: string; description?: string };
}): { name?: string; description?: string } {
	return {
		name: msg.phase?.name,
		description: msg.phase?.description,
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
				this.setState({ generation: { status: 'running', totalFiles: m.totalFiles } });
				break;
			}
			case 'generation_complete': {
				const m = msg as WsMessageOf<'generation_complete'>;
				const previewURL = (m as { previewURL?: string }).previewURL;
				this.setState({
					generation: {
						status: 'complete',
						instanceId: m.instanceId,
						previewURL,
					},
					...(previewURL ? { previewUrl: previewURL } : {}),
				});
				break;
			}
			case 'generation_stopped': {
				const m = msg as WsMessageOf<'generation_stopped'>;
				this.setState({ generation: { status: 'stopped', instanceId: m.instanceId } });
				break;
			}
			case 'generation_resumed': {
				this.setState({ generation: { status: 'running' } });
				break;
			}

			case 'phase_generating': {
				const m = msg as WsMessageOf<'phase_generating'>;
				this.setState({ phase: { status: 'generating', ...extractPhaseInfo(m as any) } });
				break;
			}
			case 'phase_generated': {
				const m = msg as WsMessageOf<'phase_generated'>;
				this.setState({ phase: { status: 'generated', ...extractPhaseInfo(m as any) } });
				break;
			}
			case 'phase_implementing': {
				const m = msg as WsMessageOf<'phase_implementing'>;
				this.setState({ phase: { status: 'implementing', ...extractPhaseInfo(m as any) } });
				break;
			}
			case 'phase_implemented': {
				const m = msg as WsMessageOf<'phase_implemented'>;
				this.setState({ phase: { status: 'implemented', ...extractPhaseInfo(m as any) } });
				break;
			}
			case 'phase_validating': {
				const m = msg as WsMessageOf<'phase_validating'>;
				this.setState({ phase: { status: 'validating', ...extractPhaseInfo(m as any) } });
				break;
			}
			case 'phase_validated': {
				const m = msg as WsMessageOf<'phase_validated'>;
				this.setState({ phase: { status: 'validated', ...extractPhaseInfo(m as any) } });
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
}
