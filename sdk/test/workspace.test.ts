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

	it('applies file_deleted and emits delete', () => {
		const ws = new WorkspaceStore();
		const changes: Array<{ type: string; path?: string }> = [];
		ws.onChange((c) => changes.push(c));
		ws.applyWsMessage({ type: 'file_generated', file: { filePath: 'src/gone.ts', fileContents: 'bye' } } as any);
		ws.applyWsMessage({ type: 'file_deleted', filePath: 'src/gone.ts' } as any);
		expect(ws.read('src/gone.ts')).toBe(null);
		expect(ws.paths()).toEqual([]);
		expect(changes.some((c) => c.type === 'delete' && c.path === 'src/gone.ts')).toBe(true);
	});
});
