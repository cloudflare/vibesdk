import type { Server, ServerWebSocket } from 'bun';

export type TestClient = ServerWebSocket<{ id: string }>;

export type TestServerOptions = {
	port?: number;
};

export type TestServer = {
	url: string;
	wsUrl: string;
	port: number;
	/** Send a message to all connected clients */
	broadcast: (msg: object) => void;
	/** Send a message to a specific client */
	send: (client: TestClient, msg: object) => void;
	/** Get all connected clients */
	clients: () => TestClient[];
	/** Get messages received from clients */
	received: () => Array<{ client: TestClient; data: object }>;
	/** Clear received messages */
	clearReceived: () => void;
	/** Close the server */
	close: () => void;
};

let clientIdCounter = 0;

/**
 * Start a test server that simulates the agent protocol.
 * 
 * HTTP endpoints:
 * - POST /api/ws-ticket - Returns a ticket for WebSocket auth
 * 
 * WebSocket:
 * - Accepts connections at /ws?ticket=<ticket>
 * - Validates ticket before accepting
 * - Sends agent_connected on connection
 */
export function startTestServer(options: TestServerOptions = {}): TestServer {
	const port = options.port ?? 0; // 0 = random available port
	const clients = new Set<TestClient>();
	const received: Array<{ client: TestClient; data: object }> = [];
	const validTickets = new Set<string>();

	const server: Server = Bun.serve({
		port,
		fetch(req, server) {
			const url = new URL(req.url);

			// HTTP: Ticket endpoint
			if (req.method === 'POST' && url.pathname === '/api/ws-ticket') {
				const ticket = `tk_test_${Date.now()}_${Math.random().toString(36).slice(2)}`;
				validTickets.add(ticket);
				// Expire ticket after 15 seconds
				setTimeout(() => validTickets.delete(ticket), 15000);

				return Response.json({
					success: true,
					data: {
						ticket,
						expiresIn: 15,
						expiresAt: new Date(Date.now() + 15000).toISOString(),
					},
				});
			}

			// WebSocket upgrade
			if (url.pathname === '/ws') {
				const ticket = url.searchParams.get('ticket');

				if (!ticket || !validTickets.has(ticket)) {
					return new Response('Invalid or expired ticket', { status: 401 });
				}

				// Consume the ticket (single-use)
				validTickets.delete(ticket);

				const upgraded = server.upgrade(req, {
					data: { id: `client_${++clientIdCounter}` },
				});

				if (!upgraded) {
					return new Response('WebSocket upgrade failed', { status: 500 });
				}

				return undefined;
			}

			return new Response('Not Found', { status: 404 });
		},

		websocket: {
			open(ws: TestClient) {
				clients.add(ws);
				// Send agent_connected message on connection
				ws.send(JSON.stringify({
					type: 'agent_connected',
					state: {
						behaviorType: 'phasic',
						projectType: 'app',
					},
					templateDetails: {},
				}));
			},

			message(ws: TestClient, message: string | Buffer) {
				const data = JSON.parse(typeof message === 'string' ? message : message.toString());
				received.push({ client: ws, data });
			},

			close(ws: TestClient) {
				clients.delete(ws);
			},
		},
	});

	const actualPort = server.port;
	const baseUrl = `http://localhost:${actualPort}`;
	const wsUrl = `ws://localhost:${actualPort}/ws`;

	return {
		url: baseUrl,
		wsUrl,
		port: actualPort,
		broadcast: (msg: object) => {
			const data = JSON.stringify(msg);
			for (const client of clients) {
				client.send(data);
			}
		},
		send: (client: TestClient, msg: object) => {
			client.send(JSON.stringify(msg));
		},
		clients: () => Array.from(clients),
		received: () => [...received],
		clearReceived: () => {
			received.length = 0;
		},
		close: () => {
			server.stop(true);
		},
	};
}

/**
 * Wait for the server to have at least N connected clients.
 */
export async function waitForClients(
	server: TestServer,
	count: number,
	timeoutMs = 5000
): Promise<void> {
	const start = Date.now();
	while (server.clients().length < count) {
		if (Date.now() - start > timeoutMs) {
			throw new Error(`Timeout waiting for ${count} clients (have ${server.clients().length})`);
		}
		await new Promise((r) => setTimeout(r, 10));
	}
}

/**
 * Wait for the server to receive at least N messages.
 */
export async function waitForMessages(
	server: TestServer,
	count: number,
	timeoutMs = 5000
): Promise<void> {
	const start = Date.now();
	while (server.received().length < count) {
		if (Date.now() - start > timeoutMs) {
			throw new Error(`Timeout waiting for ${count} messages (have ${server.received().length})`);
		}
		await new Promise((r) => setTimeout(r, 10));
	}
}
