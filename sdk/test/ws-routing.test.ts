import { describe, expect, it } from 'bun:test';
import { createAgentConnection } from '../src/ws';

import { FakeWebSocket } from './fakes';

describe('createAgentConnection', () => {
	it('routes message types into sugar events', async () => {
		const ws = new FakeWebSocket();
		const conn = createAgentConnection('ws://localhost/ws', {
			webSocketFactory: () => ws,
		});

		let phaseCount = 0;
		let convoCount = 0;
		conn.on('phase', () => {
			phaseCount += 1;
		});
		conn.on('conversation', () => {
			convoCount += 1;
		});

		ws.emitMessageJson({ type: 'phase_generating' });
		ws.emitMessageJson({ type: 'conversation_response' });

		expect(phaseCount).toBe(1);
		expect(convoCount).toBe(1);
	});
});
