import { useState } from 'react';
import { Zap, Settings } from 'lucide-react';

export type AgentMode = 'deterministic' | 'smart';

interface AgentModeToggleProps {
  value: AgentMode;
  onChange: (mode: AgentMode) => void;
  disabled?: boolean;
  className?: string;
}

export function AgentModeToggle({ value, onChange, disabled = false, className = '' }: AgentModeToggleProps) {
  const [showTooltip, setShowTooltip] = useState(false);

  return (
    <div className={`flex items-center gap-3 ${className}`}>
      <div className="flex items-center gap-2">
        <Settings className="size-3.5 text-slate-600 dark:text-slate-400" />
        <span className="text-xs font-medium text-slate-700 dark:text-slate-300">Mode:</span>
      </div>
      
      <div className="relative">
        <div 
          className="flex bg-slate-100 dark:bg-slate-800/50 rounded-lg p-0.5 border border-slate-200 dark:border-slate-700"
          onMouseEnter={() => setShowTooltip(true)}
          onMouseLeave={() => setShowTooltip(false)}
        >
          <button
            type="button"
            disabled={disabled}
            onClick={() => onChange('deterministic')}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-md transition-all duration-200 ${
              value === 'deterministic'
                ? 'bg-white dark:bg-slate-700 shadow-sm text-emerald-700 dark:text-emerald-400 border border-slate-200 dark:border-slate-600'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
            } ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
          >
            <div className={`size-1.5 rounded-full ${
              value === 'deterministic' 
                ? 'bg-emerald-500' 
                : 'bg-slate-400 dark:bg-slate-500'
            }`} />
            Reliable
          </button>
          <button
            type="button"
            disabled={disabled}
            onClick={() => onChange('smart')}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-md transition-all duration-200 ${
              value === 'smart'
                ? 'bg-white dark:bg-slate-700 shadow-sm text-violet-700 dark:text-violet-400 border border-slate-200 dark:border-slate-600'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
            } ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
          >
            <Zap className={`size-2.5 ${
              value === 'smart' 
                ? 'text-violet-500' 
                : 'text-slate-400 dark:text-slate-500'
            }`} />
            Smart
          </button>
        </div>
        
        {/* Tooltip */}
        {showTooltip && (
          <div className="absolute -top-2 left-1/2 transform -translate-x-1/2 -translate-y-full pointer-events-none transition-opacity duration-200 z-50">
            <div className="bg-slate-900 dark:bg-slate-800 text-white text-xs rounded-lg px-3 py-2 shadow-lg border border-slate-700 max-w-xs">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <div className="size-2 rounded-full bg-emerald-500" />
                  <span className="font-medium text-emerald-300">Reliable:</span>
                  <span className="text-slate-300">Structured & consistent</span>
                </div>
                <div className="flex items-center gap-2">
                  <Zap className="size-3 text-violet-400" />
                  <span className="font-medium text-violet-300">Smart:</span>
                  <span className="text-slate-300">AI-orchestrated & adaptive</span>
                </div>
              </div>
              <div className="absolute top-full left-1/2 transform -translate-x-1/2 w-0 h-0 border-l-2 border-r-2 border-t-2 border-transparent border-t-slate-700"></div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}