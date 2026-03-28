import { useState, useEffect, useCallback } from 'react';
import { Coins, TrendingDown, ChevronDown, ChevronUp, Clock } from 'lucide-react';
import { useAuth } from '@/contexts/auth-context';
import { apiClient } from '@/lib/api-client';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import clsx from 'clsx';

interface CreditBalance {
  balance: number;
  totalEarned: number;
  totalSpent: number;
  transactionsThisMonth: number;
  spentThisMonth: number;
}

interface CreditTransaction {
  id: string;
  amount: number;
  type: string;
  description: string;
  model: string | null;
  balanceAfter: number;
  createdAt: string | null;
}

export function CreditDisplay() {
  const { isAuthenticated } = useAuth();
  const [balance, setBalance] = useState<CreditBalance | null>(null);
  const [transactions, setTransactions] = useState<CreditTransaction[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  const fetchBalance = useCallback(async () => {
    if (!isAuthenticated) return;
    try {
      const response = await apiClient.getCreditBalance();
      if (response.success && response.data) {
        setBalance(response.data as CreditBalance);
      }
    } catch {
      // Silently fail - credits might not be set up
    }
  }, [isAuthenticated]);

  const fetchTransactions = useCallback(async () => {
    if (!isAuthenticated) return;
    setLoading(true);
    try {
      const response = await apiClient.getCreditTransactions(10);
      if (response.success && response.data) {
        setTransactions((response.data as { transactions: CreditTransaction[] }).transactions || []);
      }
    } catch {
      // Silently fail
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated]);

  useEffect(() => {
    fetchBalance();
  }, [fetchBalance]);

  useEffect(() => {
    if (open) fetchTransactions();
  }, [open, fetchTransactions]);

  if (!isAuthenticated || !balance) return null;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-black/5 dark:bg-white/[0.06] hover:bg-black/10 dark:hover:bg-white/10 border border-black/5 dark:border-white/5 text-sm font-medium text-gray-700 dark:text-gray-200 transition-colors"
          data-testid="credit-display-btn"
        >
          <Coins className="size-3.5 text-amber-500" />
          <span>{balance.balance}</span>
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0" align="end">
        <div className="p-4 border-b border-black/5 dark:border-white/5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Credit Balance</h3>
            <span className="text-xl font-bold text-amber-500" data-testid="credit-balance-value">{balance.balance}</span>
          </div>
          <div className="grid grid-cols-2 gap-3 text-xs">
            <div className="flex items-center gap-1.5 text-gray-500 dark:text-gray-400">
              <ChevronUp className="size-3 text-green-500" />
              <span>Earned: {balance.totalEarned}</span>
            </div>
            <div className="flex items-center gap-1.5 text-gray-500 dark:text-gray-400">
              <ChevronDown className="size-3 text-red-400" />
              <span>Spent: {balance.totalSpent}</span>
            </div>
            <div className="flex items-center gap-1.5 text-gray-500 dark:text-gray-400 col-span-2">
              <TrendingDown className="size-3 text-orange-400" />
              <span>This month: {balance.spentThisMonth} credits used ({balance.transactionsThisMonth} generations)</span>
            </div>
          </div>
        </div>

        {/* Cost Guide */}
        <div className="px-4 py-2 border-b border-black/5 dark:border-white/5 bg-black/[0.02] dark:bg-white/[0.02]">
          <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">Cost per generation</p>
          <div className="flex items-center gap-3 text-xs text-gray-600 dark:text-gray-300">
            <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-green-400" />E-1: 1</span>
            <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-yellow-400" />E-1.5: 3</span>
            <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-red-400" />E-2: 5</span>
            <span className="text-gray-400">Ultra: 2x</span>
          </div>
        </div>

        {/* Recent Transactions */}
        <div className="p-4">
          <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2">Recent Activity</p>
          {loading ? (
            <p className="text-xs text-gray-400 text-center py-2">Loading...</p>
          ) : transactions.length === 0 ? (
            <p className="text-xs text-gray-400 text-center py-2">No transactions yet</p>
          ) : (
            <div className="space-y-1.5 max-h-40 overflow-y-auto">
              {transactions.map((tx) => (
                <div key={tx.id} className="flex items-center justify-between text-xs" data-testid={`tx-${tx.id}`}>
                  <div className="flex items-center gap-1.5 min-w-0">
                    <Clock className="size-3 text-gray-400 shrink-0" />
                    <span className="truncate text-gray-600 dark:text-gray-300">{tx.description}</span>
                  </div>
                  <span className={clsx(
                    "font-medium shrink-0 ml-2",
                    tx.amount > 0 ? "text-green-500" : "text-red-400"
                  )}>
                    {tx.amount > 0 ? '+' : ''}{tx.amount}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
