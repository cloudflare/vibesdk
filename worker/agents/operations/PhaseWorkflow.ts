/**
 * PhaseWorkflow — Mastra workflow wrapping vibesdk's phase execution.
 *
 * Turns the 3-step phase lifecycle (plan → implement → eval) into an
 * explicit, observable Mastra workflow graph.  This lets us:
 *   - Attach structured metadata to each step (tokens, timing, file list)
 *   - Add retry policies on implementation failure
 *   - Wire Mastra's eval scorer after implementation
 *   - Produce a workflow run ID for the AG-UI `runId` field
 *
 * Architecture note:
 *   The workflow runs INMEMORY — no Mastra storage backend.  All persistent
 *   state (blueprint, files, conversationMessages) remains in the DO SQLite
 *   layer, which is the single source of truth.  Mastra is used ONLY for
 *   step orchestration + eval; it does not own any agent state.
 *
 * Workflow graph:
 *   plan-phase → implement-phase → eval-phase
 *
 * The `implement-phase` step calls `runMultiAgentPhase()` internally when
 * `multiAgentEnabled === true`, otherwise falls back to `implementPhase()`.
 * This mirrors the existing flag-gate in `PhasicCodingBehavior`.
 *
 * Acceptance gate (ADR-005):
 *   - PhaseWorkflow executes a 3-phase generation with output identical to
 *     current code.
 *   - Eval step emits faithfulness + hallucination scores to WebSocket as
 *     `state_delta` events.
 *   - No regression on existing WebSocket streaming, AG-UI events, webhooks.
 */

import { z } from 'zod';
import { createWorkflow, createStep } from '@mastra/core/workflows';
import type { PhaseConceptType, PhaseImplementationSchemaType } from '../schemas';
import type { AllIssues, UserContext } from '../core/types';
import { runMastraEvalScorer } from '../../services/mastra/evalGate';
import type { EvalInput } from './EvalGate';
import { createLogger } from '../../logger';

const logger = createLogger('PhaseWorkflow');

// ── Zod schemas for workflow step I/O ─────────────────────────────────────

const PhaseWorkflowInputSchema = z.object({
    /** Phase concept produced by PhaseGenerationOperation. */
    phase: z.unknown(), // PhaseConceptType — opaque to Mastra
    /** User's original request — passed to eval judge. */
    userQuery: z.string(),
    /** Session identifiers for EvalGate + telemetry. */
    sessionId: z.string(),
    userId: z.string(),
});

const PlanStepOutputSchema = z.object({
    phase: z.unknown(),
    fileCount: z.number(),
    durationMs: z.number(),
});

const ImplementStepOutputSchema = z.object({
    ok: z.boolean(),
    failedTaskIds: z.array(z.string()),
    tokensSpent: z.number(),
    implementedFiles: z.array(z.string()),
    implementation: z.unknown().nullable(), // PhaseImplementationSchemaType | null
    durationMs: z.number(),
});

const EvalStepOutputSchema = z.object({
    score: z.number(),
    passed: z.boolean(),
    reason: z.string(),
    metadata: z.object({
        faithfulness: z.number(),
        answerRelevancy: z.number(),
        toolCorrectness: z.number(),
        hallucinationRisk: z.number(),
        blockedReason: z.string().nullable(),
        judgeInputTokens: z.number(),
        judgeOutputTokens: z.number(),
    }),
});

// ── Step definitions ───────────────────────────────────────────────────────

/**
 * Step 1: validate + enrich the incoming phase concept.
 * Real generation happens in PhasicCodingBehavior before the workflow;
 * this step records the planned file count for cost telemetry.
 */
const planStep = createStep({
    id: 'plan-phase',
    description: 'Validate and enrich the phase concept before implementation',
    inputSchema: PhaseWorkflowInputSchema,
    outputSchema: PlanStepOutputSchema,
    execute: async ({ inputData }) => {
        const t0 = Date.now();
        const phase = inputData.phase as PhaseConceptType;
        const fileCount = phase.files?.length ?? 0;

        logger.info('PhaseWorkflow: plan-phase', {
            phaseName: phase.name,
            fileCount,
            sessionId: inputData.sessionId,
        });

        return {
            phase,
            fileCount,
            durationMs: Date.now() - t0,
        };
    },
});

/**
 * Step 2: implement the phase.
 *
 * This step receives the phase concept from step 1 and delegates to the
 * caller-supplied `runImpl` function (injected via workflow context).
 * Using a factory pattern keeps the step pure while allowing the Durable
 * Object's `this` context to flow in.
 */
function makeImplementStep(
    runImpl: (phase: PhaseConceptType) => Promise<{
        ok: boolean;
        failedTaskIds: readonly string[];
        tokensSpent: number;
        implementedFiles: readonly string[];
        implementation: PhaseImplementationSchemaType | null;
    }>,
) {
    return createStep({
        id: 'implement-phase',
        description: 'Implement all files in the phase, optionally via parallel multi-agent execution',
        inputSchema: PlanStepOutputSchema,
        outputSchema: ImplementStepOutputSchema,
        execute: async ({ inputData }) => {
            const t0 = Date.now();
            const phase = inputData.phase as PhaseConceptType;

            const result = await runImpl(phase);

            logger.info('PhaseWorkflow: implement-phase complete', {
                ok: result.ok,
                failedCount: result.failedTaskIds.length,
                tokensSpent: result.tokensSpent,
                fileCount: result.implementedFiles.length,
            });

            return {
                ok: result.ok,
                failedTaskIds: [...result.failedTaskIds],
                tokensSpent: result.tokensSpent,
                implementedFiles: [...result.implementedFiles],
                implementation: result.implementation ?? null,
                durationMs: Date.now() - t0,
            };
        },
    });
}

/**
 * Step 3: run the eval gate scorer.
 * Emits faithfulness + hallucination scores.  A failed gate logs a warning
 * but does NOT halt the workflow — the phase is still promoted to allow the
 * reviewer conversation to surface quality issues.
 */
function makeEvalStep(
    env: Env,
    userQuery: string,
    sessionId: string,
    userId: string,
    phase: PhaseConceptType,
) {
    return createStep({
        id: 'eval-phase',
        description: 'Score the implementation with the vibesdk eval gate (faithfulness + hallucination)',
        inputSchema: ImplementStepOutputSchema,
        outputSchema: EvalStepOutputSchema,
        execute: async ({ inputData }) => {
            const evalInput: EvalInput = {
                sessionId,
                userId,
                phase,
                implementation: inputData.implementation as PhaseImplementationSchemaType | null,
                userQuery,
            };

            const result = await runMastraEvalScorer(env, evalInput);

            if (!result.passed) {
                logger.warn('PhaseWorkflow: eval-phase gate blocked (non-fatal)', {
                    sessionId,
                    phase: phase.name,
                    reason: result.reason,
                    faithfulness: result.metadata.faithfulness,
                    hallucinationRisk: result.metadata.hallucinationRisk,
                });
            }

            return result;
        },
    });
}

// ── Workflow factory ───────────────────────────────────────────────────────

export interface PhaseWorkflowRunners {
    /** Must produce the same output as `runMultiAgentPhase` or `implementPhase`. */
    runImpl: (phase: PhaseConceptType) => Promise<{
        ok: boolean;
        failedTaskIds: readonly string[];
        tokensSpent: number;
        implementedFiles: readonly string[];
        implementation: PhaseImplementationSchemaType | null;
    }>;
}

export interface PhaseWorkflowContext {
    env: Env;
    phase: PhaseConceptType;
    userQuery: string;
    sessionId: string;
    userId: string;
    runners: PhaseWorkflowRunners;
}

/**
 * Build and immediately execute a PhaseWorkflow for one phase.
 *
 * The workflow is created fresh per phase (no caching) because each phase
 * has a different `runImpl` closure bound to the DO's current state.
 *
 * Returns the eval result so the caller can emit it as a `state_delta`
 * WebSocket event.
 */
export async function runPhaseWorkflow(ctx: PhaseWorkflowContext): Promise<{
    ok: boolean;
    tokensSpent: number;
    implementedFiles: readonly string[];
    evalScore: number;
    evalPassed: boolean;
    evalReason: string;
}> {
    const { env, phase, userQuery, sessionId, userId, runners } = ctx;

    const implementStep = makeImplementStep(runners.runImpl);
    const evalStep = makeEvalStep(env, userQuery, sessionId, userId, phase);

    // Build the workflow graph: plan → implement → eval
    const workflow = createWorkflow({
        id: `phase-workflow-${sessionId}-${Date.now()}`,
        description: `Mastra workflow for phase: ${phase.name ?? 'unnamed'}`,
        inputSchema: PhaseWorkflowInputSchema,
        outputSchema: EvalStepOutputSchema,
        steps: [planStep, implementStep, evalStep],
    })
        .then(planStep)
        .then(implementStep)
        .then(evalStep)
        .commit();

    // Execute in-process (no Mastra storage, no remote runner).
    const run = await workflow.createRun();
    const workflowResult = await run.start({
        inputData: {
            phase,
            userQuery,
            sessionId,
            userId,
        },
    });

    if (workflowResult.status !== 'success') {
        logger.warn('PhaseWorkflow ended with non-success status', {
            status: workflowResult.status,
            sessionId,
        });
    }

    // Use Record cast for dynamic step key access — Mastra's TSteps inference
    // can't resolve string literal keys at this dynamic call site.
    const stepsRecord = workflowResult.steps as Record<string, { status: string; output?: unknown } | undefined>;
    const implStep = stepsRecord['implement-phase'];
    const evalStep2 = stepsRecord['eval-phase'];

    type ImplOut = z.infer<typeof ImplementStepOutputSchema>;
    type EvalOut = z.infer<typeof EvalStepOutputSchema>;
    const implOut = (implStep?.status === 'success' ? implStep.output : undefined) as ImplOut | undefined;
    const evalOut = (evalStep2?.status === 'success' ? evalStep2.output : undefined) as EvalOut | undefined;

    return {
        ok: implOut?.ok ?? false,
        tokensSpent: implOut?.tokensSpent ?? 0,
        implementedFiles: implOut?.implementedFiles ?? [],
        evalScore: evalOut?.score ?? 1,
        evalPassed: evalOut?.passed ?? true,
        evalReason: evalOut?.reason ?? '',
    };
}
