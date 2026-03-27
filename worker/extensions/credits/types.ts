/**
 * Credit System Types
 *
 * Defines the data structures for the credit tracking and management system.
 * See docs/GAP_ANALYSIS_AND_IMPLEMENTATION_GUIDE.md Section 5.1 for full spec.
 */

export type CreditEntryType = 'grant' | 'debit' | 'refund' | 'expire' | 'purchase';
export type CreditReferenceType = 'session' | 'purchase' | 'plan_grant' | 'promo' | 'admin';
export type PurchaseStatus = 'pending' | 'completed' | 'failed' | 'refunded';
export type CreditPhase = 'blueprint' | 'implementation' | 'code_fix' | 'conversation' | 'other';

export interface CreditLedgerEntry {
    id: string;
    tenantId: string;
    entryType: CreditEntryType;
    amount: number;         // positive for grants, negative for debits
    balanceAfter: number;   // running balance after this entry
    description?: string;
    referenceId?: string;   // links to session_id, purchase_id, etc.
    referenceType?: CreditReferenceType;
    createdAt: number;
}

export interface CreditBalance {
    tenantId: string;
    totalBalance: number;
    planCredits: number;
    purchasedCredits: number;
    promoCredits: number;
    updatedAt: number;
}

export interface CreditPurchase {
    id: string;
    tenantId: string;
    amount: number;
    priceCents: number;
    currency: string;
    stripePaymentId?: string;
    status: PurchaseStatus;
    createdAt: number;
}

export interface SessionCreditUsage {
    id: string;
    tenantId: string;
    sessionId: string;
    appId?: string;
    creditsUsed: number;
    inputTokens: number;
    outputTokens: number;
    model?: string;
    provider?: string;
    phase?: CreditPhase;
    createdAt: number;
}

export interface BudgetCheckResult {
    canProceed: boolean;
    balance: number;
    warningThreshold: boolean;  // true if balance < 20% of soft limit
    hardLimitReached: boolean;
}

export interface UsageHistoryFilter {
    period?: 'day' | 'week' | 'month' | 'all';
    projectId?: string;
    type?: CreditEntryType;
    limit?: number;
    offset?: number;
}

export interface UsageHistoryResult {
    entries: CreditLedgerEntry[];
    total: number;
    periodTotal: number;
    currentBalance: number;
}
