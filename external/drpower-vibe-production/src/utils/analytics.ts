/**
 * Analytics utilities for consistent data handling and display
 */

import type { UserAnalyticsResponseData, AgentAnalyticsResponseData } from '@/api-types';

/**
 * Standardized analytics display props interface
 * Used consistently across all cost display components
 */
export interface AnalyticsDisplayProps {
  cost?: number;
  tokensIn?: number;
  tokensOut?: number;
  totalRequests?: number;
  lastUpdated?: string;
}

/**
 * Extract standardized analytics props from user analytics data
 * Centralizes property mapping and ensures consistency
 */
export function extractUserAnalyticsProps(analytics: UserAnalyticsResponseData | null): AnalyticsDisplayProps {
  if (!analytics) {
    return {
      cost: 0,
      tokensIn: 0,
      tokensOut: 0,
      totalRequests: 0,
      lastUpdated: undefined
    };
  }

  return {
    cost: analytics.totalCost,
    tokensIn: analytics.tokensIn,
    tokensOut: analytics.tokensOut,
    totalRequests: analytics.totalRequests,
    lastUpdated: analytics.lastRequestAt || undefined
  };
}

/**
 * Extract standardized analytics props from agent analytics data
 * Centralizes property mapping and ensures consistency
 */
export function extractAgentAnalyticsProps(analytics: AgentAnalyticsResponseData | null): AnalyticsDisplayProps {
  if (!analytics) {
    return {
      cost: 0,
      tokensIn: 0,
      tokensOut: 0,
      totalRequests: 0,
      lastUpdated: undefined
    };
  }

  return {
    cost: analytics.totalCost,
    tokensIn: analytics.tokensIn,
    tokensOut: analytics.tokensOut,
    totalRequests: analytics.totalRequests,
    lastUpdated: analytics.lastRequestAt || undefined
  };
}

/**
 * Format cost for display with consistent formatting rules
 */
export function formatCost(amount?: number): string {
  if (typeof amount !== 'number' || isNaN(amount)) return '$0.00';
  if (amount === 0) return '$0.00';
  if (amount < 0.01) return '<$0.01';
  return `$${amount.toFixed(amount < 1 ? 3 : 2)}`;
}

/**
 * Format numbers for display with consistent formatting rules
 */
export function formatNumber(num?: number): string {
  if (typeof num !== 'number' || isNaN(num)) return '0';
  if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
  if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
  return num.toLocaleString();
}

/**
 * Get appropriate badge variant based on cost amount
 */
export function getCostBadgeVariant(cost?: number): 'default' | 'secondary' | 'destructive' {
  const safeCost = typeof cost === 'number' && !isNaN(cost) ? cost : 0;
  if (safeCost === 0) return 'secondary';
  if (safeCost > 1) return 'destructive';
  return 'default';
}