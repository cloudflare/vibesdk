import { vi } from 'vitest';

import type { FileOutputType, PhaseConceptType } from '../schemas';
import type { TemplateDetails } from '../../services/sandbox/sandboxTypes';
import type { InferenceContext } from '../inferutils/config.types';

const mocked = vi.hoisted(() => ({
	runMock: vi.fn(),
	constructorShouldThrow: false,
}));

vi.mock('../assistants/realtimeCodeFixer', () => {
	return {
		RealtimeCodeFixer: class {
			constructor() {
				if (mocked.constructorShouldThrow) {
					throw new Error('RealtimeCodeFixer constructor failed');
				}
			}

			run = mocked.runMock;
		},
	};
});

import { detectPreDeploySafetyFindings, runPreDeploySafetyGate } from './preDeploySafetyGate';

type PreDeploySafetyGateArgs = Parameters<typeof runPreDeploySafetyGate>[0];

function makeFile(partial: Partial<FileOutputType> & Pick<FileOutputType, 'filePath' | 'fileContents'>): FileOutputType {
	return {
		filePath: partial.filePath,
		fileContents: partial.fileContents,
		filePurpose: partial.filePurpose ?? 'test',
	};
}

function makeArgs(files: FileOutputType[]): PreDeploySafetyGateArgs {
	return {
		files,
		env: {} as unknown as PreDeploySafetyGateArgs['env'],
		inferenceContext: {} as InferenceContext,
		query: 'test query',
		template: { name: 'template', allFiles: {} } as unknown as TemplateDetails,
		phase: { name: 'phase', description: 'desc', files: [] } as unknown as PhaseConceptType,
	};
}

function makeSeededRng(seed: number) {
	let state = seed >>> 0;
	return () => {
		// LCG (deterministic, fast)
		state = (1664525 * state + 1013904223) >>> 0;
		return state / 0xffffffff;
	};
}

function randomAscii(rng: () => number, length: number) {
	const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_(){}[];,:.<>+-=*/\"\'\n\t ';
	let out = '';
	for (let i = 0; i < length; i++) {
		out += chars[Math.floor(rng() * chars.length)];
	}
	return out;
}

describe('runPreDeploySafetyGate', () => {
	let warnSpy: ReturnType<typeof vi.spyOn>;

	beforeEach(() => {
		mocked.runMock.mockReset();
		mocked.constructorShouldThrow = false;
		warnSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
	});

	afterEach(() => {
		warnSpy.mockRestore();
	});

	it('never throws on empty input', async () => {
		await expect(runPreDeploySafetyGate(makeArgs([]))).resolves.toEqual([]);
	});

	it('passes through non-script files without invoking fixer', async () => {
		const input = [makeFile({ filePath: 'README.md', fileContents: '# hi' })];
		const out = await runPreDeploySafetyGate(makeArgs(input));
		expect(out).toEqual(input);
		expect(mocked.runMock).not.toHaveBeenCalled();
	});

	it('detects selector object literal findings', () => {
		const findings = detectPreDeploySafetyFindings("const x = useOS(s => ({ a: s.a }));");
		expect(findings.length).toBeGreaterThan(0);
	});

	it('invokes fixer for use* selector returning object literal', async () => {
		mocked.runMock.mockImplementation(async (file: FileOutputType) => {
			return { ...file, fileContents: 'export const a = useOS(s => s.a);' };
		});

		const input = [
			makeFile({
				filePath: 'src/App.tsx',
				fileContents: "const x = useOS(s => ({ a: s.a }));\nexport default function App() { return null }",
			}),
		];

		const out = await runPreDeploySafetyGate(makeArgs(input));
		expect(out[0].fileContents).toContain('useOS');
		expect(out[0].fileContents).toContain('s => s.a');
		expect(mocked.runMock).toHaveBeenCalledTimes(1);
	});

	it('deterministically splits destructured object selector without invoking fixer', async () => {
		const input = [
			makeFile({
				filePath: 'src/App.tsx',
				fileContents:
					"const { a, b } = useOS(s => ({ a: s.a, b: s.b }));\nexport default function App() { return <div>{a + b}</div> }",
			}),
		];

		const out = await runPreDeploySafetyGate(makeArgs(input));
		expect(out[0].fileContents).toContain('const a = useOS');
		expect(out[0].fileContents).toContain('const b = useOS');
		expect(out[0].fileContents).not.toContain('=> ({');
		expect(mocked.runMock).not.toHaveBeenCalled();
	});

	it('invokes fixer for setState in render body', async () => {
		mocked.runMock.mockImplementation(async (file: FileOutputType) => file);

		const input = [
			makeFile({
				filePath: 'src/App.tsx',
				fileContents:
					"import { useState } from 'react';\nexport function App() { const [x, setX] = useState(0); setX(1); return <div>{x}</div>; }",
			}),
		];

		await expect(runPreDeploySafetyGate(makeArgs(input))).resolves.toBeTruthy();
		expect(mocked.runMock).toHaveBeenCalledTimes(1);
	});

	it('invokes fixer for useEffect missing deps when setting state', async () => {
		mocked.runMock.mockImplementation(async (file: FileOutputType) => file);

		const input = [
			makeFile({
				filePath: 'src/App.tsx',
				fileContents:
					"import { useEffect, useState } from 'react';\nexport function App() { const [x,setX] = useState(0); useEffect(() => { setX(1); }); return <div>{x}</div> }",
			}),
		];

		await expect(runPreDeploySafetyGate(makeArgs(input))).resolves.toBeTruthy();
		expect(mocked.runMock).toHaveBeenCalledTimes(1);
	});

	it('never throws if RealtimeCodeFixer constructor throws', async () => {
		mocked.constructorShouldThrow = true;

		const input = [
			makeFile({
				filePath: 'src/App.tsx',
				fileContents: "const x = useOS(s => ({ a: s.a }));\nexport default function App() { return null }",
			}),
		];

		const out = await runPreDeploySafetyGate(makeArgs(input));
		expect(out).toHaveLength(1);
		expect(out[0].filePath).toBe('src/App.tsx');
		expect(mocked.runMock).not.toHaveBeenCalled();
		expect(warnSpy).toHaveBeenCalled();
	});

	it('never throws if fixer run rejects; returns original', async () => {
		mocked.runMock.mockRejectedValueOnce(new Error('fixer failed'));

		const input = [
			makeFile({
				filePath: 'src/App.tsx',
				fileContents: "const x = useOS(s => ({ a: s.a }));\nexport default function App() { return null }",
			}),
		];

		const out = await runPreDeploySafetyGate(makeArgs(input));
		expect(out[0].fileContents).toBe(input[0].fileContents);
		expect(warnSpy).toHaveBeenCalled();
	});

	it('never throws if fixer run throws; returns original', async () => {
		mocked.runMock.mockImplementationOnce(() => {
			throw new Error('fixer threw');
		});

		const input = [
			makeFile({
				filePath: 'src/App.tsx',
				fileContents: "const x = useOS(s => ({ a: s.a }));\nexport default function App() { return null }",
			}),
		];

		const out = await runPreDeploySafetyGate(makeArgs(input));
		expect(out[0].fileContents).toBe(input[0].fileContents);
		expect(warnSpy).toHaveBeenCalled();
	});

	it('never throws on invalid syntax; still returns files', async () => {
		mocked.runMock.mockImplementation(async (file: FileOutputType) => file);

		const input = [
			makeFile({
				filePath: 'src/App.tsx',
				fileContents: 'export const =',
			}),
		];

		await expect(runPreDeploySafetyGate(makeArgs(input))).resolves.toHaveLength(1);
		expect(warnSpy).toHaveBeenCalled();
	});

	it('fuzz: never throws across random file contents', async () => {
		mocked.runMock.mockImplementation(async (file: FileOutputType) => file);

		const rng = makeSeededRng(123456);
		const files: FileOutputType[] = [];
		for (let i = 0; i < 200; i++) {
			files.push(
				makeFile({
					filePath: `src/Fuzz${i}.tsx`,
					fileContents: randomAscii(rng, 200),
				}),
			);
		}

		const out = await runPreDeploySafetyGate(makeArgs(files));
		expect(out).toHaveLength(200);
	});
});

describe('detectPreDeploySafetyFindings', () => {
	it('never throws on random input', () => {
		const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
		expect(() => detectPreDeploySafetyFindings('<<< not ts >>>')).not.toThrow();
		const out = detectPreDeploySafetyFindings('<<< not ts >>>');
		expect(Array.isArray(out)).toBe(true);
		// Parser should fail and log
		expect(spy).toHaveBeenCalled();
		spy.mockRestore();
	});

	it('fuzz: never throws across random strings', () => {
		const rng = makeSeededRng(424242);
		for (let i = 0; i < 200; i++) {
			expect(() => detectPreDeploySafetyFindings(randomAscii(rng, 200))).not.toThrow();
		}
	});
});
