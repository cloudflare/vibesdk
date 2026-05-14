import { memo } from 'react';
import { Globe, Loader2 } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

export interface DeployBadgeProps {
    /**
     * Public deployment URL returned by deployToCloudflare().
     * Empty string = project not yet deployed.
     */
    readonly deploymentUrl: string;
    /** True while a Cloudflare Workers deploy is in progress. */
    readonly isDeploying: boolean;
    /** Optional click handler to open the live URL in a new tab. */
    readonly onOpen?: () => void;
    readonly className?: string;
}

type DeployState = 'idle' | 'deploying' | 'live';

function getDeployState(deploymentUrl: string, isDeploying: boolean): DeployState {
    if (isDeploying) return 'deploying';
    if (deploymentUrl) return 'live';
    return 'idle';
}

const STATE_LABELS: Record<DeployState, string> = {
    idle: 'Not deployed',
    deploying: 'Deploying…',
    live: 'Live',
};

const STATE_STYLES: Record<DeployState, string> = {
    idle: 'bg-gray-500/10 text-gray-500 dark:text-gray-400 border-gray-500/20 cursor-default',
    deploying: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20 cursor-default',
    live: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20 cursor-pointer hover:bg-emerald-500/20 transition-colors',
};

/**
 * Compact deployment-status chip for the chat header badge row.
 *
 * Three states:
 *   idle     — grey globe "Not deployed"  (project exists but never deployed)
 *   deploying — amber spinner "Deploying…" (CLOUDFLARE_DEPLOYMENT_STARTED in flight)
 *   live      — emerald globe "Live"       (CLOUDFLARE_DEPLOYMENT_COMPLETED, URL available)
 *
 * The "Live" state is clickable — opens deploymentUrl in a new tab.
 * Tooltip in all states shows the full URL or a contextual explanation.
 *
 * DEC-033-F: surfaces the already-wired Cloudflare Workers deploy in the header
 * badge row (next to IsolationBadge, CostPreviewBadge, PhaseQualityBadge).
 */
export const DeployBadge = memo(function DeployBadge({
    deploymentUrl,
    isDeploying,
    onOpen,
    className,
}: DeployBadgeProps) {
    const state = getDeployState(deploymentUrl, isDeploying);
    const isLive = state === 'live';

    function handleClick() {
        if (isLive) {
            onOpen?.();
            if (deploymentUrl) {
                window.open(deploymentUrl, '_blank', 'noopener,noreferrer');
            }
        }
    }

    return (
        <Tooltip>
            <TooltipTrigger asChild>
                <div
                    role={isLive ? 'link' : undefined}
                    tabIndex={isLive ? 0 : undefined}
                    onClick={handleClick}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') handleClick(); }}
                    className={cn(
                        'flex items-center gap-1 rounded-md px-2 py-0.5',
                        'border text-xs font-medium select-none',
                        STATE_STYLES[state],
                        className,
                    )}
                    aria-label={
                        isLive
                            ? `Open live deployment: ${deploymentUrl}`
                            : STATE_LABELS[state]
                    }
                    data-testid="deploy-badge"
                    data-state={state}
                >
                    {state === 'deploying' ? (
                        <Loader2 className="h-3 w-3 shrink-0 animate-spin" aria-hidden="true" />
                    ) : (
                        <Globe className="h-3 w-3 shrink-0" aria-hidden="true" />
                    )}
                    <span>{STATE_LABELS[state]}</span>
                </div>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="max-w-xs text-xs leading-relaxed">
                {state === 'idle' && (
                    <>
                        <p className="font-semibold mb-1">Not deployed</p>
                        <p>
                            Use the Deploy button below to publish this project to
                            Cloudflare Workers. You'll get a permanent public URL.
                        </p>
                    </>
                )}
                {state === 'deploying' && (
                    <>
                        <p className="font-semibold mb-1">Deploying to Cloudflare Workers…</p>
                        <p>Publishing your project to the global edge network. This takes 15-30 seconds.</p>
                    </>
                )}
                {state === 'live' && (
                    <>
                        <p className="font-semibold mb-1">Live on Cloudflare Workers</p>
                        <p className="break-all text-emerald-400">{deploymentUrl}</p>
                        <p className="mt-1 text-text-primary/60">Click to open in a new tab.</p>
                    </>
                )}
            </TooltipContent>
        </Tooltip>
    );
});
