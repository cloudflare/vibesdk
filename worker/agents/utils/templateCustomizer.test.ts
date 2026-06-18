import { describe, it, expect } from 'vitest';
import { generateBootstrapScript } from './templateCustomizer';

describe('generateBootstrapScript', () => {
	const script = generateBootstrapScript('demo', ['bun add react react-dom']);

	it('does not shell out', () => {
		expect(script).not.toContain('execSync');
		expect(script).toContain('execFileSync');
		expect(script).toContain('shell: false');
	});

	it('emits argv arrays, not raw command strings', () => {
		// Each command is embedded as a JSON argv array, e.g. ["bun","add","react","react-dom"].
		expect(script).toMatch(/"bun",\s*"add",\s*"react",\s*"react-dom"/);
	});

	it('enforces a runtime executable allowlist', () => {
		expect(script).toContain("new Set(['npm', 'yarn', 'pnpm', 'bun'])");
	});

	it('strips trust escalations from package.json on bootstrap (VEC-B)', () => {
		expect(script).toContain('delete pkg.trustedDependencies');
	});
});
