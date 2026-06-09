import { describe, expect, it } from 'bun:test';

import { WorkspaceStore } from '../src/workspace';

const minimalState = (files: Record<string, string>) => ({
	generatedFilesMap: Object.fromEntries(
		Object.entries(files).map(([filePath, fileContents]) => [filePath, { filePath, fileContents }]),
	),
} as any);

describe('WorkspaceStore', () => {
	it('applies agent_connected state snapshot', () => {
		const ws = new WorkspaceStore();
		ws.applyWsMessage({ type: 'agent_connected', state: minimalState({ 'a.txt': 'hi' }), templateDetails: {} } as any);
		expect(ws.read('a.txt')).toBe('hi');
	});

	it('applies cf_agent_state snapshot as reset', () => {
		const ws = new WorkspaceStore();
		ws.applyWsMessage({ type: 'cf_agent_state', state: minimalState({ 'a.txt': 'hi' }) } as any);
		ws.applyWsMessage({ type: 'cf_agent_state', state: minimalState({ 'b.txt': 'yo' }) } as any);
		expect(ws.read('a.txt')).toBe(null);
		expect(ws.read('b.txt')).toBe('yo');
	});

	it('applies file_generated upsert', () => {
		const ws = new WorkspaceStore();
		ws.applyWsMessage({ type: 'cf_agent_state', state: minimalState({}) } as any);
		ws.applyWsMessage({ type: 'file_generated', file: { filePath: 'src/x.ts', fileContents: '1' } } as any);
		expect(ws.read('src/x.ts')).toBe('1');
	});
});
