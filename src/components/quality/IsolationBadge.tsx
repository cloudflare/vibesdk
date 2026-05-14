import { memo } from 'react';
import { ShieldCheck } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

export interface IsolationBadgeProps {
    readonly className?: string;
}

/**
 * Static trust-signal badge surfacing vibesdk's DO-per-session isolation guarantee.
 *
 * Counter-marketing rationale (run024 Cycle 6 features research):
 *   Wiz and similar tools surface security as a visible badge ("Scanned by Wiz").
 *   vibesdk's BOLA immunity is architectural (DO isolation), not scan-based.
 *   This badge makes the guarantee discoverable for security-conscious users.
 *
 * No API calls, no state — renders identically on every mount.
 */
export const IsolationBadge = memo(function IsolationBadge({
    className,
}: IsolationBadgeProps) {
    return (
        <Tooltip>
            <TooltipTrigger asChild>
                <div
                    className={cn(
                        'flex items-center gap-1 rounded-md px-2 py-0.5',
                        'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
                        'border border-emerald-500/20 cursor-default select-none',
                        'text-xs font-medium',
                        className,
                    )}
                    aria-label="Isolated by Architecture — each session runs in its own Cloudflare Durable Object"
                >
                    <ShieldCheck className="h-3 w-3 shrink-0" aria-hidden="true" />
                    <span>Isolated</span>
                </div>
            </TooltipTrigger>
            <TooltipContent
                side="bottom"
                className="max-w-xs text-xs leading-relaxed"
            >
                <p className="font-semibold mb-1">Isolated by Architecture</p>
                <p>
                    This session runs in its own Cloudflare Durable Object — a single-tenant,
                    isolated compute unit. Your code is never mixed with other users' projects
                    at the infrastructure level, not just by policy.
                </p>
            </TooltipContent>
        </Tooltip>
    );
});
