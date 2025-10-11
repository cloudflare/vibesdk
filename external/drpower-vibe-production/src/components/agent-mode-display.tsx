import { Zap } from 'lucide-react';
import { type AgentMode } from './agent-mode-toggle';

interface AgentModeDisplayProps {
  mode: AgentMode;
  className?: string;
}

export function AgentModeDisplay({ 
  mode, 
  className = '' 
}: AgentModeDisplayProps) {
  return (
    <div className={`flex items-center gap-1.5 px-2.5 py-1 bg-slate-50 dark:bg-slate-800/50 rounded-md border border-slate-200 dark:border-slate-700 ${className}`}>
      {mode === 'smart' ? (
        <>
          <Zap className="size-2.5 text-violet-500" />
          <span className="text-xs font-medium text-violet-700 dark:text-violet-400">Smart</span>
        </>
      ) : (
        <>
          <div className="size-1.5 rounded-full bg-emerald-500" />
          <span className="text-xs font-medium text-emerald-700 dark:text-emerald-400">Reliable</span>
        </>
      )}
    </div>
  );
}