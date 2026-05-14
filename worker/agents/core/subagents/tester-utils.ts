/**
 * TesterAgent — pure conversion utilities.
 *
 * Extracted from TesterAgent private methods so they can be unit-tested
 * without instantiating a DurableObject. All functions are pure (no I/O).
 */

import type { RuntimeError, CodeIssue, LintSeverity } from '../../../services/sandbox/sandboxTypes';
import type { RuntimeErrorReport, StaticIssueReport } from './contracts';

/**
 * Convert a sandbox RuntimeError (log line) to the agent's RuntimeErrorReport.
 * File/line are not available in runtime log entries — only the message and raw log.
 */
export function runtimeErrorToReport(err: RuntimeError): RuntimeErrorReport {
    return {
        message: err.message,
        stackTrace: err.rawOutput,
    };
}

/**
 * Convert a sandbox CodeIssue (lint or typecheck) to StaticIssueReport.
 * 'info' severity is not part of StaticIssueReport — downgraded to 'warning'.
 */
export function codeIssueToReport(issue: CodeIssue): StaticIssueReport {
    const severity: StaticIssueReport['severity'] =
        issue.severity === 'error' ? 'error' : 'warning';
    return {
        file: issue.filePath,
        line: issue.line,
        severity,
        rule: issue.ruleId ?? (issue.source ?? 'lint'),
        message: issue.message,
    };
}

/**
 * Filter a list of CodeIssues to only those in the changed files set.
 * changedFiles paths must exactly match CodeIssue.filePath strings.
 */
export function filterIssuesToChangedFiles(
    issues: readonly CodeIssue[],
    changedFiles: readonly string[],
): readonly CodeIssue[] {
    if (changedFiles.length === 0) return [];
    const changedSet = new Set(changedFiles);
    return issues.filter((issue) => changedSet.has(issue.filePath));
}

/**
 * Merge lint and typecheck issues from a static analysis result.
 * Returns a flat array — duplicates are NOT removed (lint and tsc
 * may report the same file/line with different messages; both are useful).
 */
export function mergeAnalysisIssues(
    lint: readonly CodeIssue[],
    typecheck: readonly CodeIssue[],
): readonly CodeIssue[] {
    return [...lint, ...typecheck];
}
