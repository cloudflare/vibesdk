import { describe, expect, it } from 'bun:test';
import { BuildSession } from '../src/session';
import type { BuildStartEvent, Credentials, VibeClientOptions } from '../src/types';

import { FakeWebSocket } from './fakes';

describe('BuildSession.connect', () => {
	it('injects Authorization header and sends session_init on open', async () => {
		const start: BuildStartEvent = {
			agentId: 'a1',
			websocketUrl: 'ws://localhost/ws',
			behaviorType: 'phasic',
			projectType: 'app',
		};

		const creds: Credentials = { providers: { openai: { apiKey: 'sk-test' } } };

		let capturedHeaders: Record<string, string> | undefined;
		const ws = new FakeWebSocket();

		const opts: VibeClientOptions = {
			baseUrl: 'http://localhost:5173',
			websocketOrigin: undefined,
		};

		const session = new BuildSession(opts, start, {
			getAuthToken: () => 'ACCESS_TOKEN',
			defaultCredentials: creds,
		});

		session.connect({
			webSocketFactory: (_url, _protocols, headers) => {
				capturedHeaders = headers;
				return ws;
			},
		});

		expect(capturedHeaders?.Authorization).toBe('Bearer ACCESS_TOKEN');

		ws.emitOpen();

		const sent = ws.sent.map((s) => JSON.parse(s) as { type: string });
		expect(sent[0]?.type).toBe('session_init');
		expect(sent[1]?.type).toBe('get_conversation_state');
	});

	it('waitUntilReady resolves on generation_started (phasic)', async () => {
		const start: BuildStartEvent = {
			agentId: 'a1',
			websocketUrl: 'ws://localhost/ws',
			behaviorType: 'phasic',
			projectType: 'app',
		};

		const ws = new FakeWebSocket();
		const session = new BuildSession({ baseUrl: 'x' }, start);
		session.connect({ webSocketFactory: () => ws });
		ws.emitOpen();

		const ready = session.waitUntilReady({ timeoutMs: 5_000 });
		ws.emitMessageJson({ type: 'generation_started', message: 'start', totalFiles: 1 });
		await ready;
	});

	it('waitUntilReady resolves on generation_started (agentic)', async () => {
		const start: BuildStartEvent = {
			agentId: 'a1',
			websocketUrl: 'ws://localhost/ws',
			behaviorType: 'agentic',
			projectType: 'general',
		};

		const ws = new FakeWebSocket();
		const session = new BuildSession({ baseUrl: 'x' }, start);
		session.connect({ webSocketFactory: () => ws });
		ws.emitOpen();

		const ready = session.waitUntilReady({ timeoutMs: 5_000 });
		ws.emitMessageJson({ type: 'generation_started', message: 'start', totalFiles: 1 });
		await ready;
	});

	it('onMessageType triggers for specific message type', async () => {
		const start: BuildStartEvent = {
			agentId: 'a1',
			websocketUrl: 'ws://localhost/ws',
			behaviorType: 'phasic',
			projectType: 'app',
		};

		const ws = new FakeWebSocket();
		const session = new BuildSession({ baseUrl: 'x' }, start);
		session.connect({ webSocketFactory: () => ws });
		ws.emitOpen();

		let called = 0;
		session.onMessageType('agent_connected', () => {
			called += 1;
		});

		ws.emitMessageJson({ type: 'agent_connected', state: {}, templateDetails: {} } as any);
		expect(called).toBe(1);
	});

	it('waitForMessageType resolves with matching message', async () => {
		const start: BuildStartEvent = {
			agentId: 'a1',
			websocketUrl: 'ws://localhost/ws',
			behaviorType: 'phasic',
			projectType: 'app',
		};

		const ws = new FakeWebSocket();
		const session = new BuildSession({ baseUrl: 'x' }, start);
		session.connect({ webSocketFactory: () => ws });
		ws.emitOpen();

		const p = session.waitForMessageType('deployment_completed', 5_000);
		ws.emitMessageJson({
			type: 'deployment_completed',
			previewURL: 'https://preview',
			tunnelURL: 'https://tunnel',
			instanceId: 'i1',
			message: 'done',
		} as any);

		const msg = await p;
		expect((msg as any).type).toBe('deployment_completed');
	});

	it('queues messages sent before ws open', async () => {
		const start: BuildStartEvent = {
			agentId: 'a1',
			websocketUrl: 'ws://localhost/ws',
			behaviorType: 'phasic',
			projectType: 'app',
		};

		const ws = new FakeWebSocket();
		const session = new BuildSession({ baseUrl: 'x' }, start);
		session.connect({ webSocketFactory: () => ws });

		session.startGeneration();
		expect(ws.sent.length).toBe(0);

		ws.emitOpen();
		const sent = ws.sent.map((s) => JSON.parse(s) as { type: string });
		expect(sent[0]?.type).toBe('get_conversation_state');
		expect(sent[1]?.type).toBe('generate_all');
	});

	it('wait.deployable resolves on phase_validated for phasic', async () => {
		const start: BuildStartEvent = {
			agentId: 'a1',
			websocketUrl: 'ws://localhost/ws',
			behaviorType: 'phasic',
			projectType: 'app',
		};

		const ws = new FakeWebSocket();
		const session = new BuildSession({ baseUrl: 'x' }, start);
		session.connect({ webSocketFactory: () => ws });
		ws.emitOpen();

		const p = session.wait.deployable({ timeoutMs: 5_000 });
		ws.emitMessageJson({
			type: 'phase_validated',
			message: 'ok',
			phase: { name: 'Phase 1', description: 'd', files: [] },
		} as any);

		const result = await p;
		expect(result.reason).toBe('phase_validated');
	});

	it('reconnects and re-sends init messages', async () => {
		const start: BuildStartEvent = {
			agentId: 'a1',
			websocketUrl: 'ws://localhost/ws',
			behaviorType: 'phasic',
			projectType: 'app',
		};

		const creds: Credentials = { providers: { openai: { apiKey: 'sk-test' } } };

		const ws1 = new FakeWebSocket();
		const ws2 = new FakeWebSocket();
		const sockets: FakeWebSocket[] = [];

		const session = new BuildSession({ baseUrl: 'x' }, start, { defaultCredentials: creds });
		session.connect({
			retry: { initialDelayMs: 1, maxDelayMs: 1 },
			webSocketFactory: () => {
				const ws = sockets.length === 0 ? ws1 : ws2;
				sockets.push(ws);
				return ws;
			},
		});

		ws1.emitOpen();
		ws1.close();

		// Wait for reconnect timer to create the next socket
		await new Promise((r) => setTimeout(r, 5));
		expect(sockets.length).toBeGreaterThanOrEqual(2);

		ws2.emitOpen();
		const sent2 = ws2.sent.map((s) => JSON.parse(s) as { type: string });
		expect(sent2[0]?.type).toBe('session_init');
		expect(sent2[1]?.type).toBe('get_conversation_state');
	});
});
