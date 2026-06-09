import { describe, expect, it, beforeEach, afterEach } from 'bun:test';
import { createAgentConnection } from '../src/ws';
import { startTestServer, waitForClients, type TestServer } from './test-server';

describe('createAgentConnection', () => {
	let server: TestServer;

	beforeEach(() => {
		server = startTestServer();
	});

	afterEach(() => {
		server.close();
	});

	it('routes message types into sugar events', async () => {
		const conn = createAgentConnection(async () => {
			const resp = await fetch(`${server.url}/api/ws-ticket`, { method: 'POST' });
			const { data } = await resp.json() as { data: { ticket: string } };
			return `${server.wsUrl}?ticket=${data.ticket}`;
		});

		await waitForClients(server, 1);

		let phaseCount = 0;
		let convoCount = 0;
		conn.on('phase', () => {
			phaseCount += 1;
		});
		conn.on('conversation', () => {
			convoCount += 1;
		});

		server.broadcast({ type: 'phase_generating' });
		server.broadcast({ type: 'conversation_response' });

		await new Promise((r) => setTimeout(r, 100));

		expect(phaseCount).toBe(1);
		expect(convoCount).toBe(1);

		conn.close();
	});

	it('emits ws:open and connected events', async () => {
		let openCount = 0;
		let connectedCount = 0;

		const conn = createAgentConnection(async () => {
			const resp = await fetch(`${server.url}/api/ws-ticket`, { method: 'POST' });
			const { data } = await resp.json() as { data: { ticket: string } };
			return `${server.wsUrl}?ticket=${data.ticket}`;
		});

		conn.on('ws:open', () => {
			openCount += 1;
		});
		conn.on('connected', () => {
			connectedCount += 1;
		});

		await waitForClients(server, 1);
		await new Promise((r) => setTimeout(r, 50));

		expect(openCount).toBe(1);
		expect(connectedCount).toBe(1);

		conn.close();
	});

	it('sends messages to server', async () => {
		const conn = createAgentConnection(async () => {
			const resp = await fetch(`${server.url}/api/ws-ticket`, { method: 'POST' });
			const { data } = await resp.json() as { data: { ticket: string } };
			return `${server.wsUrl}?ticket=${data.ticket}`;
		});

		// Wait for open
		await new Promise<void>((resolve) => {
			conn.on('ws:open', () => resolve());
		});

		server.clearReceived();

		conn.send({ type: 'generate_all' });
		conn.send({ type: 'user_suggestion', message: 'hello' });

		await new Promise((r) => setTimeout(r, 100));

		const received = server.received();
		const types = received.map((r) => (r.data as { type: string }).type);

		expect(types).toContain('generate_all');
		expect(types).toContain('user_suggestion');

		conn.close();
	});

	it('emits error event on invalid ticket', async () => {
		let errorCount = 0;

		const conn = createAgentConnection(async () => {
			// Return invalid ticket
			return `${server.wsUrl}?ticket=invalid-ticket`;
		}, { retry: { enabled: false } });

		conn.on('ws:error', () => {
			errorCount += 1;
		});

		await new Promise((r) => setTimeout(r, 200));

		expect(errorCount).toBeGreaterThan(0);

		conn.close();
	});
});
