import { describe, expect, it, beforeEach, afterEach } from 'bun:test';
import { BuildSession } from '../src/session';
import { HttpClient } from '../src/http';
import type { BuildStartEvent, Credentials } from '../src/types';
import { startTestServer, waitForClients, waitForMessages, type TestServer } from './test-server';

describe('BuildSession.connect', () => {
	let server: TestServer;

	beforeEach(() => {
		server = startTestServer();
	});

	afterEach(() => {
		server.close();
	});

	function createSession(overrides: Partial<BuildStartEvent> = {}, credentials?: Credentials) {
		const start: BuildStartEvent = {
			agentId: 'test-agent-1',
			websocketUrl: server.wsUrl,
			behaviorType: 'phasic',
			projectType: 'app',
			...overrides,
		};

		const httpClient = new HttpClient({
			baseUrl: server.url,
		});

		return new BuildSession(start, {
			httpClient,
			...(credentials ? { defaultCredentials: credentials } : {}),
		});
	}

	it('sends session_init on open with credentials', async () => {
		const creds: Credentials = { providers: { openai: { apiKey: 'sk-test' } } };
		const session = createSession({}, creds);

		await session.connect();
		await waitForClients(server, 1);

		// Wait for init messages to be sent
		await waitForMessages(server, 2);

		const received = server.received();
		const types = received.map((r) => (r.data as { type: string }).type);

		expect(types[0]).toBe('session_init');
		expect(types[1]).toBe('get_conversation_state');

		session.close();
	});

	it('waitUntilReady resolves on generation_started (phasic)', async () => {
		const session = createSession({ behaviorType: 'phasic' });

		await session.connect();
		await waitForClients(server, 1);

		const ready = session.waitUntilReady({ timeoutMs: 5_000 });

		// Server sends generation_started
		server.broadcast({ type: 'generation_started', message: 'start', totalFiles: 1 });

		await ready;
		session.close();
	});

	it('waitUntilReady resolves on generation_started (agentic)', async () => {
		const session = createSession({ behaviorType: 'agentic', projectType: 'general' });

		await session.connect();
		await waitForClients(server, 1);

		const ready = session.waitUntilReady({ timeoutMs: 5_000 });

		server.broadcast({ type: 'generation_started', message: 'start', totalFiles: 1 });

		await ready;
		session.close();
	});

	it('onMessageType triggers for specific message type', async () => {
		const session = createSession();

		await session.connect();
		await waitForClients(server, 1);

		let called = 0;
		session.onMessageType('file_generated', () => {
			called += 1;
		});

		server.broadcast({ type: 'file_generated', path: 'index.html', content: '<html></html>' });

		await new Promise((r) => setTimeout(r, 100));

		expect(called).toBe(1);
		session.close();
	});

	it('waitForMessageType resolves with matching message', async () => {
		const session = createSession();

		await session.connect();
		await waitForClients(server, 1);

		const p = session.waitForMessageType('deployment_completed', 5_000);

		server.broadcast({
			type: 'deployment_completed',
			previewURL: 'https://preview.example.com',
			tunnelURL: 'https://tunnel.example.com',
			instanceId: 'i1',
			message: 'done',
		});

		const msg = await p;
		expect(msg.type).toBe('deployment_completed');

		session.close();
	});

	it('startGeneration sends generate_all message', async () => {
		const session = createSession();

		await session.connect();
		await waitForClients(server, 1);

		// Clear init messages
		server.clearReceived();

		session.startGeneration();

		await waitForMessages(server, 1);

		const received = server.received();
		const types = received.map((r) => (r.data as { type: string }).type);

		expect(types).toContain('generate_all');

		session.close();
	});

	it('wait.deployable resolves on phase_validated for phasic', async () => {
		const session = createSession({ behaviorType: 'phasic' });

		await session.connect();
		await waitForClients(server, 1);

		const p = session.wait.deployable({ timeoutMs: 5_000 });

		server.broadcast({
			type: 'phase_validated',
			message: 'ok',
			phase: { name: 'Phase 1', description: 'd', files: [] },
		});

		const result = await p;
		expect(result.reason).toBe('phase_validated');

		session.close();
	});

	it('wait.deployable resolves on generation_complete for agentic', async () => {
		const session = createSession({ behaviorType: 'agentic' });

		await session.connect();
		await waitForClients(server, 1);

		const p = session.wait.deployable({ timeoutMs: 5_000 });

		server.broadcast({
			type: 'generation_complete',
			message: 'done',
		});

		const result = await p;
		expect(result.reason).toBe('generation_complete');

		session.close();
	});

	it('reconnects on close and re-sends init messages', async () => {
		const creds: Credentials = { providers: { openai: { apiKey: 'sk-test' } } };
		const session = createSession({}, creds);

		await session.connect({ retry: { initialDelayMs: 50, maxDelayMs: 50 } });
		await waitForClients(server, 1);

		// Get the client before clearing
		const clientsBefore = server.clients();
		expect(clientsBefore.length).toBe(1);
		const client = clientsBefore[0];

		server.clearReceived();

		// Close the connection - this should trigger reconnect
		client.close(1006, 'test disconnect');

		// Wait for reconnection
		await waitForClients(server, 1);
		await waitForMessages(server, 2);

		// Should have received init messages again on reconnect
		const received = server.received();
		const types = received.map((r) => (r.data as { type: string }).type);

		expect(types).toContain('session_init');
		expect(types).toContain('get_conversation_state');

		session.close();
	});

	it('handles server-sent file updates', async () => {
		const session = createSession();

		await session.connect();
		await waitForClients(server, 1);

		server.broadcast({
			type: 'file_generated',
			file: {
				filePath: 'src/app.tsx',
				fileContents: 'export default function App() { return <div>Hello</div>; }',
				filePurpose: 'Main app component',
			},
		});

		await new Promise((r) => setTimeout(r, 100));

		const paths = session.files.listPaths();
		expect(paths).toContain('src/app.tsx');

		const content = session.files.read('src/app.tsx');
		expect(content).toContain('Hello');

		session.close();
	});
});
