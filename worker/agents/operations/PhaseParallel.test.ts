/**
 * Unit tests for PhaseParallel — ADR-007 Option A primitives.
 *
 * Tests cover:
 *   - validateDisjointFiles: null on disjoint, conflict info on overlap
 *   - buildParallelPhaseGroup: ownership map construction
 *   - executeParallelPhaseGroup: parallel path, sequential fallback, metrics
 *   - getSerializationRate / shouldEscalateToOptionB
 */

import { describe, it, expect, vi } from 'vitest';
import {
    validateDisjointFiles,
    buildParallelPhaseGroup,
    executeParallelPhaseGroup,
    getSerializationRate,
    shouldEscalateToOptionB,
} from './PhaseParallel';
import type { PhaseConceptType } from '../schemas';
import type { ParallelGroupMetrics } from './PhaseParallel';

vi.mock('../../logger', () => ({
    createLogger: () => ({
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
    }),
}));

// ── Fixtures ──────────────────────────────────────────────────────────────────

function phase(name: string, ...filePaths: string[]): PhaseConceptType {
    return {
        name,
        description: `Phase: ${name}`,
        files: filePaths.map((path) => ({ path, purpose: 'test', changes: null })),
        lastPhase: false,
    };
}

function metrics(total = 0, serialized = 0): ParallelGroupMetrics {
    return { total, serialized };
}

// ── validateDisjointFiles ─────────────────────────────────────────────────────

describe('validateDisjointFiles', () => {
    it('returns null for two phases with completely different files', () => {
        const phases = [
            phase('auth', 'auth/login.ts', 'auth/register.ts'),
            phase('ui', 'components/Header.tsx', 'components/Footer.tsx'),
        ];
        expect(validateDisjointFiles(phases)).toBeNull();
    });

    it('returns null for a single phase (trivially disjoint)', () => {
        const phases = [phase('auth', 'auth/login.ts')];
        expect(validateDisjointFiles(phases)).toBeNull();
    });

    it('returns null for empty phases array', () => {
        expect(validateDisjointFiles([])).toBeNull();
    });

    it('returns null for phases with empty file lists', () => {
        const phases = [phase('auth'), phase('ui')];
        expect(validateDisjointFiles(phases)).toBeNull();
    });

    it('returns conflict info when two phases share a file', () => {
        const phases = [
            phase('auth', 'auth/login.ts', 'index.ts'),
            phase('ui', 'components/Header.tsx', 'index.ts'),
        ];
        const result = validateDisjointFiles(phases);
        expect(result).not.toBeNull();
        expect(result!.conflictingFile).toBe('index.ts');
        expect(result!.phases).toContain('auth');
        expect(result!.phases).toContain('ui');
    });

    it('returns the FIRST conflict found (stable detection order)', () => {
        const phases = [
            phase('a', 'shared.ts', 'config.ts'),
            phase('b', 'shared.ts', 'config.ts'),
        ];
        const result = validateDisjointFiles(phases);
        // Either 'shared.ts' or 'config.ts' — whichever comes first in phase 'a'
        expect(result!.conflictingFile).toBe('shared.ts');
    });

    it('handles three or more phases — detects cross-phase conflict', () => {
        const phases = [
            phase('auth', 'auth/login.ts'),
            phase('ui', 'components/Header.tsx'),
            phase('api', 'auth/login.ts'), // conflict with phase 'auth'
        ];
        const result = validateDisjointFiles(phases);
        expect(result).not.toBeNull();
        expect(result!.conflictingFile).toBe('auth/login.ts');
        expect(result!.phases[0]).toBe('auth');
        expect(result!.phases[1]).toBe('api');
    });

    it('is not fooled by similar-but-different paths', () => {
        const phases = [
            phase('a', 'src/index.ts'),
            phase('b', 'src/index.tsx'), // different extension
        ];
        expect(validateDisjointFiles(phases)).toBeNull();
    });
});

// ── buildParallelPhaseGroup ───────────────────────────────────────────────────

describe('buildParallelPhaseGroup', () => {
    it('builds ownership map from all phases', () => {
        const phases = [
            phase('auth', 'auth/login.ts', 'auth/register.ts'),
            phase('ui', 'components/Header.tsx'),
        ];
        const group = buildParallelPhaseGroup(phases);
        expect(group.fileOwnership['auth/login.ts']).toBe('auth');
        expect(group.fileOwnership['auth/register.ts']).toBe('auth');
        expect(group.fileOwnership['components/Header.tsx']).toBe('ui');
    });

    it('freezes the fileOwnership object', () => {
        const group = buildParallelPhaseGroup([phase('a', 'a.ts')]);
        expect(Object.isFrozen(group.fileOwnership)).toBe(true);
    });

    it('preserves phase references', () => {
        const p1 = phase('auth', 'a.ts');
        const p2 = phase('ui', 'b.ts');
        const group = buildParallelPhaseGroup([p1, p2]);
        expect(group.phases[0]).toBe(p1);
        expect(group.phases[1]).toBe(p2);
    });
});

// ── executeParallelPhaseGroup ─────────────────────────────────────────────────

describe('executeParallelPhaseGroup', () => {
    it('runs phases in parallel when no conflict', async () => {
        const phases = [
            phase('auth', 'auth/login.ts'),
            phase('ui', 'components/Header.tsx'),
        ];
        const executionOrder: string[] = [];
        const m = metrics();

        await executeParallelPhaseGroup(
            phases,
            async (p) => { executionOrder.push(p.name); return p.name; },
            m,
        );

        expect(executionOrder).toHaveLength(2);
        expect(executionOrder).toContain('auth');
        expect(executionOrder).toContain('ui');
        expect(m.total).toBe(1);
        expect(m.serialized).toBe(0);
    });

    it('falls back to sequential when file conflict detected', async () => {
        const phases = [
            phase('auth', 'index.ts'),
            phase('ui', 'index.ts'), // conflict
        ];
        const executionOrder: string[] = [];
        const m = metrics();

        await executeParallelPhaseGroup(
            phases,
            async (p) => { executionOrder.push(p.name); return p.name; },
            m,
        );

        // Sequential: 'auth' before 'ui'
        expect(executionOrder).toEqual(['auth', 'ui']);
        expect(m.total).toBe(1);
        expect(m.serialized).toBe(1);
    });

    it('returns results in phase order', async () => {
        const phases = [
            phase('auth', 'a.ts'),
            phase('api', 'b.ts'),
            phase('ui', 'c.ts'),
        ];
        const m = metrics();

        const results = await executeParallelPhaseGroup(
            phases,
            async (p) => p.name,
            m,
        );

        expect(results).toEqual(['auth', 'api', 'ui']);
    });

    it('handles single phase without validation overhead', async () => {
        const phases = [phase('solo', 'solo.ts')];
        const m = metrics();

        const results = await executeParallelPhaseGroup(
            phases,
            async (p) => p.name,
            m,
        );

        // Single phase: no validation, direct run, metrics.total NOT incremented for groups
        expect(results).toEqual(['solo']);
    });

    it('handles empty phases array', async () => {
        const m = metrics();
        const results = await executeParallelPhaseGroup([], async (p) => p.name, m);
        expect(results).toEqual([]);
        // Empty array: total incremented (group attempted), serialized 0
        expect(m.total).toBe(1);
    });
});

// ── getSerializationRate / shouldEscalateToOptionB ────────────────────────────

describe('getSerializationRate', () => {
    it('returns 0 when no groups dispatched', () => {
        expect(getSerializationRate(metrics(0, 0))).toBe(0);
    });

    it('returns 0 when none serialized', () => {
        expect(getSerializationRate(metrics(10, 0))).toBe(0);
    });

    it('returns 1 when all serialized', () => {
        expect(getSerializationRate(metrics(5, 5))).toBe(1);
    });

    it('returns fractional rate', () => {
        expect(getSerializationRate(metrics(10, 2))).toBeCloseTo(0.2);
    });
});

describe('shouldEscalateToOptionB', () => {
    it('returns false when total < 10 (insufficient sample)', () => {
        expect(shouldEscalateToOptionB(metrics(5, 3))).toBe(false);
    });

    it('returns false when rate <= 10%', () => {
        expect(shouldEscalateToOptionB(metrics(100, 10))).toBe(false);
    });

    it('returns true when total >= 10 AND rate > 10%', () => {
        expect(shouldEscalateToOptionB(metrics(10, 2))).toBe(true); // 20% > 10%
    });

    it('threshold is strict (>10% not >=10%)', () => {
        expect(shouldEscalateToOptionB(metrics(100, 10))).toBe(false); // exactly 10%, not >
        expect(shouldEscalateToOptionB(metrics(100, 11))).toBe(true);  // 11% > 10%
    });
});
