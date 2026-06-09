import { describe, expect, it } from 'bun:test';

import { SessionStateStore } from '../src/state';
import type { PhaseInfo, PhaseTimelineEvent } from '../src/types';

/**
 * Helper to create a minimal phasic agent state for testing.
 */
function createPhasicState(options: {
	shouldBeGenerating?: boolean;
	generatedPhases?: Array<{
		name: string;
		description: string;
		files: { path: string; purpose: string }[];
		completed: boolean;
	}>;
	generatedFilesMap?: Record<string, { filePath: string; fileContents: string }>;
	query?: string;
	projectName?: string;
}) {
	return {
		behaviorType: 'phasic' as const,
		projectType: 'app' as const,
		shouldBeGenerating: options.shouldBeGenerating ?? false,
		generatedPhases: options.generatedPhases ?? [],
		generatedFilesMap: options.generatedFilesMap ?? {},
		query: options.query ?? 'Test query',
		projectName: options.projectName ?? 'test-project',
	};
}

describe('SessionStateStore', () => {
	describe('agent_connected', () => {
		it('seeds phase timeline from agent_connected with completed phases', () => {
			const store = new SessionStateStore();

			store.applyWsMessage({
				type: 'agent_connected',
				previewUrl: 'https://preview.example.com',
				state: createPhasicState({
					shouldBeGenerating: false,
					generatedPhases: [
						{
							name: 'Core Setup',
							description: 'Set up core infrastructure',
							files: [
								{ path: 'src/index.ts', purpose: 'Entry point' },
								{ path: 'src/utils.ts', purpose: 'Utilities' },
							],
							completed: true,
						},
						{
							name: 'Authentication',
							description: 'Add auth',
							files: [{ path: 'src/auth.ts', purpose: 'Auth module' }],
							completed: true,
						},
					],
					generatedFilesMap: {
						'src/index.ts': { filePath: 'src/index.ts', fileContents: '// entry' },
						'src/utils.ts': { filePath: 'src/utils.ts', fileContents: '// utils' },
						'src/auth.ts': { filePath: 'src/auth.ts', fileContents: '// auth' },
					},
				}),
				templateDetails: {},
			} as any);

			const state = store.get();
			expect(state.phases.length).toBe(2);
			expect(state.phases[0]!.name).toBe('Core Setup');
			expect(state.phases[0]!.status).toBe('completed');
			expect(state.phases[0]!.files.length).toBe(2);
			expect(state.phases[0]!.files[0]!.status).toBe('completed');
			expect(state.phases[1]!.name).toBe('Authentication');
			expect(state.phases[1]!.status).toBe('completed');
			expect(state.previewUrl).toBe('https://preview.example.com');
			expect(state.query).toBe('Test query');
			expect(state.projectName).toBe('test-project');
		});

		it('marks incomplete phases as cancelled when not generating', () => {
			const store = new SessionStateStore();

			store.applyWsMessage({
				type: 'agent_connected',
				state: createPhasicState({
					shouldBeGenerating: false,
					generatedPhases: [
						{
							name: 'Core Setup',
							description: 'Set up core infrastructure',
							files: [{ path: 'src/index.ts', purpose: 'Entry point' }],
							completed: true,
						},
						{
							name: 'Incomplete Phase',
							description: 'Was in progress',
							files: [{ path: 'src/pending.ts', purpose: 'Pending' }],
							completed: false,
						},
					],
					generatedFilesMap: {
						'src/index.ts': { filePath: 'src/index.ts', fileContents: '// done' },
					},
				}),
				templateDetails: {},
			} as any);

			const state = store.get();
			expect(state.phases[0]!.status).toBe('completed');
			expect(state.phases[1]!.status).toBe('cancelled');
			expect(state.phases[1]!.files[0]!.status).toBe('cancelled');
		});

		it('marks incomplete phases as generating when shouldBeGenerating is true', () => {
			const store = new SessionStateStore();

			store.applyWsMessage({
				type: 'agent_connected',
				state: createPhasicState({
					shouldBeGenerating: true,
					generatedPhases: [
						{
							name: 'In Progress',
							description: 'Currently generating',
							files: [
								{ path: 'src/done.ts', purpose: 'Done' },
								{ path: 'src/pending.ts', purpose: 'Pending' },
							],
							completed: false,
						},
					],
					generatedFilesMap: {
						'src/done.ts': { filePath: 'src/done.ts', fileContents: '// done' },
					},
				}),
				templateDetails: {},
			} as any);

			const state = store.get();
			expect(state.phases[0]!.status).toBe('generating');
			expect(state.phases[0]!.files[0]!.status).toBe('completed');
			expect(state.phases[0]!.files[1]!.status).toBe('pending');
			expect(state.generation.status).toBe('running');
		});

		it('seeds behaviorType and projectType from agent state', () => {
			const store = new SessionStateStore();

			store.applyWsMessage({
				type: 'agent_connected',
				state: createPhasicState({}),
				templateDetails: {},
			} as any);

			const state = store.get();
			expect(state.behaviorType).toBe('phasic');
			expect(state.projectType).toBe('app');
		});
	});

	describe('phase events', () => {
		it('adds new phase on phase_generating', () => {
			const store = new SessionStateStore();

			store.applyWsMessage({
				type: 'phase_generating',
				message: 'Generating phase',
				phase: {
					name: 'New Phase',
					description: 'A new phase',
					files: [{ path: 'src/new.ts', purpose: 'New file' }],
				},
			} as any);

			const state = store.get();
			expect(state.phases.length).toBe(1);
			expect(state.phases[0]!.name).toBe('New Phase');
			expect(state.phases[0]!.status).toBe('generating');
			expect(state.phase.status).toBe('generating');
		});

		it('updates phase status through lifecycle', () => {
			const store = new SessionStateStore();
			const phaseData = {
				name: 'Lifecycle Phase',
				description: 'Testing lifecycle',
				files: [{ path: 'src/file.ts', purpose: 'File' }],
			};

			// phase_generating
			store.applyWsMessage({
				type: 'phase_generating',
				message: '',
				phase: phaseData,
			} as any);
			expect(store.get().phases[0]!.status).toBe('generating');

			// phase_generated -> implementing
			store.applyWsMessage({
				type: 'phase_generated',
				message: '',
				phase: phaseData,
			} as any);
			expect(store.get().phases[0]!.status).toBe('implementing');

			// phase_implementing
			store.applyWsMessage({
				type: 'phase_implementing',
				message: '',
				phase: phaseData,
			} as any);
			expect(store.get().phases[0]!.status).toBe('implementing');

			// phase_implemented -> validating
			store.applyWsMessage({
				type: 'phase_implemented',
				message: '',
				phase: phaseData,
			} as any);
			expect(store.get().phases[0]!.status).toBe('validating');

			// phase_validating
			store.applyWsMessage({
				type: 'phase_validating',
				message: '',
				phase: phaseData,
			} as any);
			expect(store.get().phases[0]!.status).toBe('validating');

			// phase_validated -> completed
			store.applyWsMessage({
				type: 'phase_validated',
				message: '',
				phase: phaseData,
			} as any);
			expect(store.get().phases[0]!.status).toBe('completed');
		});

		it('updates file status on file_generating and file_generated', () => {
			const store = new SessionStateStore();

			// Start with a phase
			store.applyWsMessage({
				type: 'phase_generating',
				message: '',
				phase: {
					name: 'Test Phase',
					description: 'Testing',
					files: [
						{ path: 'src/a.ts', purpose: 'File A' },
						{ path: 'src/b.ts', purpose: 'File B' },
					],
				},
			} as any);

			// File A starts generating
			store.applyWsMessage({
				type: 'file_generating',
				filePath: 'src/a.ts',
				filePurpose: 'File A',
			} as any);
			expect(store.get().phases[0]!.files[0]!.status).toBe('generating');
			expect(store.get().currentFile).toBe('src/a.ts');

			// File A completed
			store.applyWsMessage({
				type: 'file_generated',
				file: { filePath: 'src/a.ts', fileContents: '// a' },
			} as any);
			expect(store.get().phases[0]!.files[0]!.status).toBe('completed');
			expect(store.get().currentFile).toBeUndefined();
		});
	});

	describe('clear', () => {
		it('resets phases on clear', () => {
			const store = new SessionStateStore();

			store.applyWsMessage({
				type: 'phase_generating',
				message: '',
				phase: {
					name: 'Phase',
					description: 'Desc',
					files: [],
				},
			} as any);

			expect(store.get().phases.length).toBe(1);

			store.clear();

			expect(store.get().phases.length).toBe(0);
			expect(store.get().behaviorType).toBeUndefined();
		});
	});

	describe('onPhaseChange', () => {
		it('emits added event when new phase is created', () => {
			const store = new SessionStateStore();
			const events: PhaseTimelineEvent[] = [];

			store.onPhaseChange((event) => events.push(event));

			store.applyWsMessage({
				type: 'phase_generating',
				message: '',
				phase: {
					name: 'New Phase',
					description: 'A new phase',
					files: [{ path: 'src/new.ts', purpose: 'New file' }],
				},
			} as any);

			expect(events.length).toBe(1);
			expect(events[0]!.type).toBe('added');
			expect(events[0]!.phase.name).toBe('New Phase');
			expect(events[0]!.phase.status).toBe('generating');
			expect(events[0]!.allPhases.length).toBe(1);
		});

		it('emits updated event when phase status changes', () => {
			const store = new SessionStateStore();
			const events: PhaseTimelineEvent[] = [];

			// Create phase first
			store.applyWsMessage({
				type: 'phase_generating',
				message: '',
				phase: {
					name: 'Test Phase',
					description: 'Testing',
					files: [{ path: 'src/file.ts', purpose: 'File' }],
				},
			} as any);

			// Subscribe after creation
			store.onPhaseChange((event) => events.push(event));

			// Update phase status
			store.applyWsMessage({
				type: 'phase_generated',
				message: '',
				phase: {
					name: 'Test Phase',
					description: 'Testing',
					files: [{ path: 'src/file.ts', purpose: 'File' }],
				},
			} as any);

			expect(events.length).toBe(1);
			expect(events[0]!.type).toBe('updated');
			expect(events[0]!.phase.name).toBe('Test Phase');
			expect(events[0]!.phase.status).toBe('implementing');
		});

		it('emits updated event when file status changes', () => {
			const store = new SessionStateStore();
			const events: PhaseTimelineEvent[] = [];

			// Create phase first
			store.applyWsMessage({
				type: 'phase_generating',
				message: '',
				phase: {
					name: 'Test Phase',
					description: 'Testing',
					files: [{ path: 'src/file.ts', purpose: 'File' }],
				},
			} as any);

			// Subscribe after creation
			store.onPhaseChange((event) => events.push(event));

			// Update file status
			store.applyWsMessage({
				type: 'file_generating',
				filePath: 'src/file.ts',
				filePurpose: 'File',
			} as any);

			expect(events.length).toBe(1);
			expect(events[0]!.type).toBe('updated');
			expect(events[0]!.phase.files[0]!.status).toBe('generating');
		});

		it('emits multiple events through phase lifecycle', () => {
			const store = new SessionStateStore();
			const events: PhaseTimelineEvent[] = [];

			store.onPhaseChange((event) => events.push(event));

			const phaseData = {
				name: 'Lifecycle Phase',
				description: 'Testing lifecycle',
				files: [{ path: 'src/file.ts', purpose: 'File' }],
			};

			// Go through full lifecycle
			store.applyWsMessage({ type: 'phase_generating', message: '', phase: phaseData } as any);
			store.applyWsMessage({ type: 'phase_generated', message: '', phase: phaseData } as any);
			store.applyWsMessage({ type: 'phase_implementing', message: '', phase: phaseData } as any);
			store.applyWsMessage({ type: 'phase_implemented', message: '', phase: phaseData } as any);
			store.applyWsMessage({ type: 'phase_validating', message: '', phase: phaseData } as any);
			store.applyWsMessage({ type: 'phase_validated', message: '', phase: phaseData } as any);

			// First event is 'added', then 'updated' for each status change
			// Note: phase_implementing doesn't change status (still 'implementing')
			// and phase_validating doesn't change status (still 'validating')
			// So we expect: added (generating) -> updated (implementing) -> updated (validating) -> updated (completed)
			expect(events.length).toBe(4);
			expect(events[0]!.type).toBe('added');
			expect(events[0]!.phase.status).toBe('generating');
			expect(events[1]!.type).toBe('updated');
			expect(events[1]!.phase.status).toBe('implementing');
			expect(events[2]!.type).toBe('updated');
			expect(events[2]!.phase.status).toBe('validating');
			expect(events[3]!.type).toBe('updated');
			expect(events[3]!.phase.status).toBe('completed');
		});

		it('unsubscribes correctly', () => {
			const store = new SessionStateStore();
			const events: PhaseTimelineEvent[] = [];

			const unsubscribe = store.onPhaseChange((event) => events.push(event));

			store.applyWsMessage({
				type: 'phase_generating',
				message: '',
				phase: { name: 'Phase 1', description: '', files: [] },
			} as any);

			expect(events.length).toBe(1);

			// Unsubscribe
			unsubscribe();

			store.applyWsMessage({
				type: 'phase_generating',
				message: '',
				phase: { name: 'Phase 2', description: '', files: [] },
			} as any);

			// Should still be 1 since we unsubscribed
			expect(events.length).toBe(1);
		});

		it('does not emit when phases array is unchanged', () => {
			const store = new SessionStateStore();
			const events: PhaseTimelineEvent[] = [];

			store.onPhaseChange((event) => events.push(event));

			// Non-phase message should not trigger phase change
			store.applyWsMessage({
				type: 'generation_started',
				totalFiles: 10,
			} as any);

			expect(events.length).toBe(0);
		});

		it('emits added events for multiple phases from agent_connected', () => {
			const store = new SessionStateStore();
			const events: PhaseTimelineEvent[] = [];

			store.onPhaseChange((event) => events.push(event));

			store.applyWsMessage({
				type: 'agent_connected',
				state: createPhasicState({
					shouldBeGenerating: false,
					generatedPhases: [
						{
							name: 'Phase 1',
							description: 'First phase',
							files: [{ path: 'src/a.ts', purpose: 'A' }],
							completed: true,
						},
						{
							name: 'Phase 2',
							description: 'Second phase',
							files: [{ path: 'src/b.ts', purpose: 'B' }],
							completed: true,
						},
					],
					generatedFilesMap: {
						'src/a.ts': { filePath: 'src/a.ts', fileContents: '// a' },
						'src/b.ts': { filePath: 'src/b.ts', fileContents: '// b' },
					},
				}),
				templateDetails: {},
			} as any);

			// Should emit 'added' for each phase
			expect(events.length).toBe(2);
			expect(events[0]!.type).toBe('added');
			expect(events[0]!.phase.name).toBe('Phase 1');
			expect(events[1]!.type).toBe('added');
			expect(events[1]!.phase.name).toBe('Phase 2');
		});
	});
});
