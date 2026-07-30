import { describe, expect, it } from 'vitest';
import type { ToolEvent } from './message-helpers';
import {
	getGroupStatus,
	getToolGroupSummary,
	getToolSummary,
	shortenPath,
} from './tool-display';

function event(
	partial: Partial<ToolEvent> & Pick<ToolEvent, 'name' | 'status'>,
): ToolEvent {
	return {
		timestamp: 1,
		...partial,
	};
}

describe('getToolSummary', () => {
	it('uses progressive tense while running', () => {
		expect(
			getToolSummary(
				event({
					name: 'read',
					status: 'start',
					args: { path: 'src/App.tsx' },
				}),
			),
		).toBe('Reading src/App.tsx…');
	});

	it('uses past tense on success', () => {
		expect(
			getToolSummary(
				event({
					name: 'read',
					status: 'success',
					args: { path: 'src/App.tsx' },
				}),
			),
		).toBe('Read src/App.tsx');
	});

	it('uses failed phrasing on error', () => {
		expect(
			getToolSummary(
				event({
					name: 'edit',
					status: 'error',
					args: { path: 'src/foo.ts' },
				}),
			),
		).toBe('Failed to edit src/foo.ts');
	});

	it('handles missing args', () => {
		expect(getToolSummary(event({ name: 'read', status: 'start' }))).toBe(
			'Reading…',
		);
	});

	it('summarizes grep and commit', () => {
		expect(
			getToolSummary(
				event({
					name: 'grep',
					status: 'success',
					args: { query: 'useState', include: '*.tsx' },
				}),
			),
		).toBe('Searched "useState" in *.tsx');

		expect(
			getToolSummary(
				event({
					name: 'commit',
					status: 'success',
					args: { message: 'Add login form' },
				}),
			),
		).toBe('Committed "Add login form"');
	});
});

describe('getToolGroupSummary', () => {
	it('collapses multiple reads', () => {
		const events = [
			event({ name: 'read', status: 'success', args: { path: 'a.ts' } }),
			event({ name: 'read', status: 'success', args: { path: 'b.ts' } }),
			event({ name: 'read', status: 'start', args: { path: 'c.ts' } }),
		];
		expect(getToolGroupSummary(events)).toBe('Reading 3 files…');
		expect(getGroupStatus(events)).toBe('start');
	});

	it('shows past tense when all done', () => {
		const events = [
			event({ name: 'edit', status: 'success', args: { path: 'a.ts' } }),
			event({ name: 'edit', status: 'success', args: { path: 'b.ts' } }),
		];
		expect(getToolGroupSummary(events)).toBe('Edited 2 files');
		expect(getGroupStatus(events)).toBe('success');
	});
});

describe('shortenPath', () => {
	it('keeps short paths intact', () => {
		expect(shortenPath('src/App.tsx')).toBe('src/App.tsx');
	});

	it('truncates long paths to last segments', () => {
		const long = 'very/long/nested/directory/structure/src/components/Button.tsx';
		const result = shortenPath(long, 30);
		expect(result.startsWith('…/')).toBe(true);
		expect(result.length).toBeLessThanOrEqual(30);
	});
});
