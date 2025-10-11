import { RuntimeError, StaticAnalysisResponse } from '../../../services/sandbox/sandboxTypes';
import { AllIssues } from '../../core/types';
import { ClientReportedErrorType } from '../../schemas';

/**
 * Immutable report of issues found during code generation
 * Includes runtime errors, static analysis results, and client errors
 */
export class IssueReport {
    constructor(
        public readonly runtimeErrors: RuntimeError[],
        public readonly staticAnalysis: StaticAnalysisResponse,
        public readonly clientErrors: ClientReportedErrorType[]
    ) {
        // Freeze to ensure immutability
        Object.freeze(this);
        Object.freeze(this.runtimeErrors);
        Object.freeze(this.staticAnalysis);
        Object.freeze(this.clientErrors);
    }

    /**
     * Create report from all issues
     */
    static from(issues: AllIssues): IssueReport {
        return new IssueReport(
            issues.runtimeErrors || [],
            issues.staticAnalysis || { success: false, lint: { issues: [] }, typecheck: { issues: [] } },
            issues.clientErrors || []
        );
    }

    /**
     * Check if there are any issues
     */
    hasIssues(): boolean {
        return this.hasRuntimeErrors() || this.hasStaticAnalysisIssues() || this.hasClientErrors();
    }

    /**
     * Check if there are runtime errors
     */
    hasRuntimeErrors(): boolean {
        return this.runtimeErrors.length > 0;
    }

    /**
     * Check if there are static analysis issues
     */
    hasStaticAnalysisIssues(): boolean {
        const lintIssues = this.staticAnalysis.lint?.issues?.length || 0;
        const typecheckIssues = this.staticAnalysis.typecheck?.issues?.length || 0;
        return lintIssues > 0 || typecheckIssues > 0;
    }

    /**
     * Check if there are client errors
     */
    hasClientErrors(): boolean {
        return this.clientErrors.length > 0;
    }

    /**
     * Get total issue count
     */
    getTotalIssueCount(): number {
        const runtimeCount = this.runtimeErrors.length;
        const lintCount = this.staticAnalysis.lint?.issues?.length || 0;
        const typecheckCount = this.staticAnalysis.typecheck?.issues?.length || 0;
        const clientCount = this.clientErrors.length;
        
        return runtimeCount + lintCount + typecheckCount + clientCount;
    }

    /**
     * Get a summary of all issues
     */
    getSummary(): string {
        const parts: string[] = [];
        
        if (this.runtimeErrors.length > 0) {
            parts.push(`${this.runtimeErrors.length} runtime errors`);
        }
        
        const lintCount = this.staticAnalysis.lint?.issues?.length || 0;
        if (lintCount > 0) {
            parts.push(`${lintCount} lint issues`);
        }
        
        const typecheckCount = this.staticAnalysis.typecheck?.issues?.length || 0;
        if (typecheckCount > 0) {
            parts.push(`${typecheckCount} type errors`);
        }
        
        if (this.clientErrors.length > 0) {
            parts.push(`${this.clientErrors.length} client errors`);
        }
        
        return parts.length > 0 ? parts.join(', ') : 'No issues found';
    }

    /**
     * Create an empty issue report
     */
    static empty(): IssueReport {
        return new IssueReport(
            [],
            { success: true, lint: { issues: [] }, typecheck: { issues: [] } },
            []
        );
    }
}