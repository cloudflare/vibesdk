/**
 * Swarm Toggle Component
 * Switches between single agent mode and swarm (multi-agent) mode
 */

import { useState } from 'react';
import { Users, User, ChevronDown, Settings } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { 
  DropdownMenu, 
  DropdownMenuContent, 
  DropdownMenuItem, 
  DropdownMenuTrigger 
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';

export interface SwarmConfig {
  enabled: boolean;
  mode: 'parallel' | 'specialized' | 'horizontal';
  workerCount: number;
  workerModel: string;
}

interface SwarmToggleProps {
  value: SwarmConfig;
  onChange: (config: SwarmConfig) => void;
  disabled?: boolean;
}

const SWARM_MODES = [
  { 
    value: 'parallel', 
    label: 'Parallel', 
    description: 'Workers handle different phases concurrently' 
  },
  { 
    value: 'specialized', 
    label: 'Specialized', 
    description: 'Each worker has a role (plan → build → fix → test)' 
  },
  { 
    value: 'horizontal', 
    label: 'Horizontal', 
    description: 'Multiple workers do the same task, results merged' 
  },
] as const;

const WORKER_COUNT_OPTIONS = [2, 3, 4, 5] as const;

export function SwarmToggle({ value, onChange, disabled }: SwarmToggleProps) {
  const isEnabled = value.enabled;

  const handleToggle = (checked: boolean) => {
    onChange({
      ...value,
      enabled: checked,
      // Reset to defaults when enabling
      mode: checked ? 'parallel' : value.mode,
      workerCount: checked ? 3 : value.workerCount,
    });
  };

  const handleModeChange = (mode: SwarmConfig['mode']) => {
    onChange({ ...value, mode });
  };

  const handleWorkerCountChange = (count: number) => {
    onChange({ ...value, workerCount: count });
  };

  return (
    <div className={cn("space-y-4 p-4 border rounded-lg bg-card", isEnabled && "border-primary")}>
      {/* Main Toggle */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          {isEnabled ? (
            <Users className="w-5 h-5 text-primary" />
          ) : (
            <User className="w-5 h-5 text-muted-foreground" />
          )}
          <div>
            <Label className="text-sm font-medium">
              {isEnabled ? 'Swarm Mode Active' : 'Single Agent Mode'}
            </Label>
            <p className="text-xs text-muted-foreground">
              {isEnabled 
                ? `${value.workerCount} workers, ${SWARM_MODES.find(m => m.value === value.mode)?.label} mode`
                : 'Toggle on to enable multi-agent swarm'
              }
            </p>
          </div>
        </div>
        <Switch
          checked={isEnabled}
          onCheckedChange={handleToggle}
          disabled={disabled}
        />
      </div>

      {/* Swarm Options - Only show when enabled */}
      {isEnabled && (
        <div className="space-y-4 pt-2 border-t">
          {/* Mode Selection */}
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">Execution Mode</Label>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="w-full justify-between">
                  <span>{SWARM_MODES.find(m => m.value === value.mode)?.label}</span>
                  <ChevronDown className="w-4 h-4 ml-2" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="w-72">
                {SWARM_MODES.map((mode) => (
                  <DropdownMenuItem
                    key={mode.value}
                    onClick={() => handleModeChange(mode.value)}
                    className={cn(
                      "flex flex-col items-start gap-1 p-3",
                      value.mode === mode.value && "bg-accent"
                    )}
                  >
                    <span className="font-medium">{mode.label}</span>
                    <span className="text-xs text-muted-foreground">{mode.description}</span>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          {/* Worker Count */}
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">Worker Count</Label>
            <div className="flex gap-2">
              {WORKER_COUNT_OPTIONS.map((count) => (
                <Button
                  key={count}
                  variant={value.workerCount === count ? "default" : "outline"}
                  size="sm"
                  onClick={() => handleWorkerCountChange(count)}
                  className="flex-1"
                >
                  {count}
                </Button>
              ))}
            </div>
          </div>

          {/* Info */}
          <div className="text-xs text-muted-foreground bg-muted p-2 rounded">
            <strong>Tip:</strong> Toggle off to revert to single agent with one model.
          </div>
        </div>
      )}
    </div>
  );
}
