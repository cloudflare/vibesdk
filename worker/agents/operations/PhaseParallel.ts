/**
 * PhaseParallel — ADR-007 Option A: Phase Independence Constraint primitives.
 *
 * Exposes the core data types and validation logic for running multiple
 * PhaseConceptType instances concurrently with zero merge conflicts.
 *
 * Strategy: enforce at plan time that no two parallel phases are assigned
 * files that could conflict. Each file is assigned to exactly one phase
 * (its owner). If a file appears in two phases, the group is rejected and
 * execution falls back to sequential.
 *
 * ADR reference: docs/redesign/ADR-007-parallel-subagent-merge-strategy.md
 * Upgrade path: if `parallel_groups_serialized / parallel_groups_total > 0.10`,
 *               escalate to ADR-007 Option B (LLM-Mediated Merge, S11).
 */

import type { PhaseConceptType } from '../schemas';
import { createLogger } from '../../logger';

const logger = createLogger('PhaseParallel');

// ── Types ─────────────────────────────────────────────────────────────────────

/**
 * A group of phases that are safe to execute concurrently because their
 * file sets are guaranteed to be disjoint.
 *
 * Built by `buildParallelPhaseGroup()` after `validateDisjointFiles()` returns null.
 */
export interface ParallelPhaseGroup {
    /**
     * Phases that can execute simultaneously. All file sets MUST be disjoint.
     * Invariant enforced by `validateDisjointFiles` before construction.
     */
    phases: readonly PhaseConceptType[];
    /**
     * Ownership map: filePath → phaseName.
     * Derived from `phases[*].files[*].path`.
     * Enforces the disjoint assignment at a single source of truth.
     */
    fileOwnership: Readonly<Record<string, string>>;
}

/** Describes a file ownership conflict between two phases. */
export interface FileConflictInfo {
    /** The file path that appears in both phases. */
    conflictingFile: string;
    /** The names of the two conflicting phases: [first claimant, second claimant]. */
    phases: [string, string];
}

/** Counters for the parallel-vs-serialized metric (ADR-007 escalation threshold). */
export interface ParallelGroupMetrics {
    total: number;
    serialized: number;
}

// ── Core validation ───────────────────────────────────────────────────────────

/**
 * Validates that all phases in the group have disjoint file sets.
 *
 * Time complexity: O(N × F) where N = number of phases, F = files per phase.
 * Negligible at vibesdk scale (N ≤ 10, F ≤ 30 per phase).
 *
 * @returns null if all file sets are disjoint (safe to run in parallel)
 * @returns FileConflictInfo describing the first detected conflict otherwise
 */
export function validateDisjointFiles(
    phases: readonly PhaseConceptType[],
): FileConflictInfo | null {
    const seen = new Map<string, string>(); // filePath → phaseName (first claimant)

    for (const phase of phases) {
        for (const file of phase.files ?? []) {
            const prior = seen.get(file.path);
            if (prior !== undefined) {
                return {
                    conflictingFile: file.path,
                    phases: [prior, phase.name],
                };
            }
            seen.set(file.path, phase.name);
        }
    }

    return null;
}

// ── Group construction ────────────────────────────────────────────────────────

/**
 * Builds a `ParallelPhaseGroup` from a validated set of phases.
 *
 * PRECONDITION: `validateDisjointFiles(phases)` must return null before
 * calling this function. Violating this invariant will produce an ownership
 * map where the last writer wins — silently incorrect.
 *
 * In practice, callers should follow the pattern:
 * ```ts
 * const conflict = validateDisjointFiles(phases);
 * if (conflict) { // sequential fallback }
 * const group = buildParallelPhaseGroup(phases);
 * ```
 */
export function buildParallelPhaseGroup(phases: readonly PhaseConceptType[]): ParallelPhaseGroup {
    const fileOwnership: Record<string, string> = {};
    for (const phase of phases) {
        for (const file of phase.files ?? []) {
            fileOwnership[file.path] = phase.name;
        }
    }
    return { phases, fileOwnership: Object.freeze(fileOwnership) };
}

// ── Parallel dispatch helper ──────────────────────────────────────────────────

/**
 * Execute a group of phases in parallel (ADR-007 Option A).
 *
 * 1. Validates that all phases have disjoint file sets.
 * 2a. If no conflict → runs all phases via `Promise.all`.
 * 2b. If conflict detected → falls back to sequential execution, logs a warning.
 *
 * The serialization fallback preserves correctness at the cost of throughput.
 * If `metrics.serialized / metrics.total > 0.10`, escalate to Option B (LLM merge).
 *
 * @param phases    - Phases to execute concurrently or sequentially
 * @param runPhase  - Async function that executes a single phase (injected by caller)
 * @param metrics   - Mutable counter — mutated in-place so callers can accumulate
 * @returns         Array of results in the same order as `phases`
 */
export async function executeParallelPhaseGroup<TResult>(
    phases: readonly PhaseConceptType[],
    runPhase: (phase: PhaseConceptType) => Promise<TResult>,
    metrics: ParallelGroupMetrics,
): Promise<readonly TResult[]> {
    metrics.total += 1;

    if (phases.length === 0) {
        return [];
    }
    if (phases.length === 1) {
        // Single phase — skip validation overhead, run directly.
        const result = await runPhase(phases[0]);
        return [result];
    }

    const conflict = validateDisjointFiles(phases);

    if (conflict !== null) {
        logger.warn('Parallel phase group has file conflict — serializing', {
            conflictingFile: conflict.conflictingFile,
            phases: conflict.phases,
        });
        metrics.serialized += 1;

        // Sequential fallback: maintain order, accumulate results.
        const results: TResult[] = [];
        for (const phase of phases) {
            results.push(await runPhase(phase));
        }
        return results;
    }

    // No conflict: dispatch in parallel.
    logger.info('Dispatching parallel phase group', {
        phaseCount: phases.length,
        phaseNames: phases.map((p) => p.name),
    });
    return Promise.all(phases.map(runPhase));
}

// ── Metrics helpers ───────────────────────────────────────────────────────────

/**
 * Returns the serialization rate for a set of metrics.
 * If the rate exceeds 0.10, the caller should escalate to ADR-007 Option B.
 */
export function getSerializationRate(metrics: ParallelGroupMetrics): number {
    if (metrics.total === 0) return 0;
    return metrics.serialized / metrics.total;
}

/**
 * Returns true if the serialization threshold has been exceeded and
 * the team should escalate to Option B (LLM-Mediated Merge).
 */
export function shouldEscalateToOptionB(metrics: ParallelGroupMetrics): boolean {
    return metrics.total >= 10 && getSerializationRate(metrics) > 0.10;
}
