/**
 * Unit tests for tester-utils — pure conversion functions used by TesterAgent.
 *
 * All functions are pure (no I/O), so no mocking needed.
 */

import { describe, it, expect } from 'vitest';
import {
    runtimeErrorToReport,
    codeIssueToReport,
    filterIssuesToChangedFiles,
    mergeAnalysisIssues,
} from './tester-utils';
import type { RuntimeError, CodeIssue } from '../../../services/sandbox/sandboxTypes';

// ── Fixtures ──────────────────────────────────────────────────────────────────

function runtimeError(msg: string, raw = '{"msg":"raw"}'): RuntimeError {
    return {
        timestamp: '2026-05-14T21:00:00Z',
        level: 50,
        message: msg,
        rawOutput: raw,
    };
}

function codeIssue(
    filePath: string,
    severity: 'error' | 'warning' | 'info',
    message = 'test issue',
    ruleId?: string,
    source?: string,
): CodeIssue {
    return { filePath, line: 10, column: 5, severity, message, ruleId, source };
}

// ── runtimeErrorToReport ─────────────────────────────────────────────────────

describe('runtimeErrorToReport', () => {
    it('maps message field', () => {
        const report = runtimeErrorToReport(runtimeError('Cannot read property x'));
        expect(report.message).toBe('Cannot read property x');
    });

    it('maps rawOutput to stackTrace', () => {
        const raw = '{"msg":"Cannot read property x","level":50}';
        const report = runtimeErrorToReport(runtimeError('msg', raw));
        expect(report.stackTrace).toBe(raw);
    });

    it('does not set file or line (runtime errors are log lines)', () => {
        const report = runtimeErrorToReport(runtimeError('err'));
        expect(report.file).toBeUndefined();
        expect(report.line).toBeUndefined();
    });

    it('handles empty rawOutput gracefully', () => {
        const report = runtimeErrorToReport(runtimeError('msg', ''));
        expect(report.stackTrace).toBe('');
    });
});

// ── codeIssueToReport ─────────────────────────────────────────────────────────

describe('codeIssueToReport', () => {
    it('maps filePath to file', () => {
        const report = codeIssueToReport(codeIssue('src/app.ts', 'error'));
        expect(report.file).toBe('src/app.ts');
    });

    it('maps line number', () => {
        const report = codeIssueToReport(codeIssue('src/app.ts', 'error'));
        expect(report.line).toBe(10);
    });

    it('maps error severity', () => {
        expect(codeIssueToReport(codeIssue('f.ts', 'error')).severity).toBe('error');
    });

    it('maps warning severity', () => {
        expect(codeIssueToReport(codeIssue('f.ts', 'warning')).severity).toBe('warning');
    });

    it('downgrades info severity to warning', () => {
        expect(codeIssueToReport(codeIssue('f.ts', 'info')).severity).toBe('warning');
    });

    it('uses ruleId as rule when present', () => {
        const report = codeIssueToReport(codeIssue('f.ts', 'warning', 'msg', 'no-console'));
        expect(report.rule).toBe('no-console');
    });

    it('falls back to source when ruleId is absent', () => {
        const report = codeIssueToReport(codeIssue('f.ts', 'warning', 'msg', undefined, 'eslint'));
        expect(report.rule).toBe('eslint');
    });

    it('falls back to "lint" when both ruleId and source are absent', () => {
        const report = codeIssueToReport(codeIssue('f.ts', 'warning', 'msg'));
        expect(report.rule).toBe('lint');
    });

    it('maps message', () => {
        const report = codeIssueToReport(codeIssue('f.ts', 'error', 'Unexpected token'));
        expect(report.message).toBe('Unexpected token');
    });
});

// ── filterIssuesToChangedFiles ────────────────────────────────────────────────

describe('filterIssuesToChangedFiles', () => {
    it('returns only issues in changedFiles', () => {
        const issues = [
            codeIssue('src/a.ts', 'error'),
            codeIssue('src/b.ts', 'warning'),
            codeIssue('src/c.ts', 'error'),
        ];
        const filtered = filterIssuesToChangedFiles(issues, ['src/a.ts', 'src/c.ts']);
        expect(filtered).toHaveLength(2);
        expect(filtered.map((i) => i.filePath)).toEqual(['src/a.ts', 'src/c.ts']);
    });

    it('returns empty when changedFiles is empty', () => {
        const issues = [codeIssue('src/a.ts', 'error')];
        expect(filterIssuesToChangedFiles(issues, [])).toHaveLength(0);
    });

    it('returns empty when no issues match changedFiles', () => {
        const issues = [codeIssue('src/z.ts', 'error')];
        expect(filterIssuesToChangedFiles(issues, ['src/a.ts'])).toHaveLength(0);
    });

    it('returns all issues when all are in changedFiles', () => {
        const issues = [
            codeIssue('a.ts', 'error'),
            codeIssue('b.ts', 'warning'),
        ];
        expect(filterIssuesToChangedFiles(issues, ['a.ts', 'b.ts'])).toHaveLength(2);
    });

    it('returns empty for empty input issues', () => {
        expect(filterIssuesToChangedFiles([], ['src/a.ts'])).toHaveLength(0);
    });

    it('does exact path match (no prefix match)', () => {
        const issues = [codeIssue('src/abc.ts', 'error')];
        const filtered = filterIssuesToChangedFiles(issues, ['src/ab.ts']);
        expect(filtered).toHaveLength(0);
    });
});

// ── mergeAnalysisIssues ───────────────────────────────────────────────────────

describe('mergeAnalysisIssues', () => {
    it('concatenates lint and typecheck issues', () => {
        const lint = [codeIssue('a.ts', 'warning', 'lint msg')];
        const typecheck = [codeIssue('b.ts', 'error', 'tsc msg')];
        const merged = mergeAnalysisIssues(lint, typecheck);
        expect(merged).toHaveLength(2);
        expect(merged[0].message).toBe('lint msg');
        expect(merged[1].message).toBe('tsc msg');
    });

    it('handles empty lint', () => {
        const typecheck = [codeIssue('b.ts', 'error')];
        expect(mergeAnalysisIssues([], typecheck)).toHaveLength(1);
    });

    it('handles empty typecheck', () => {
        const lint = [codeIssue('a.ts', 'warning')];
        expect(mergeAnalysisIssues(lint, [])).toHaveLength(1);
    });

    it('handles both empty', () => {
        expect(mergeAnalysisIssues([], [])).toHaveLength(0);
    });

    it('does not deduplicate (same file/line from both sources is preserved)', () => {
        const issue = codeIssue('a.ts', 'error', 'same issue');
        const merged = mergeAnalysisIssues([issue], [issue]);
        // Both lint and tsc may report the same error — both carry distinct context.
        expect(merged).toHaveLength(2);
    });
});
