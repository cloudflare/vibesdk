/**
 * Jun-8 Anthropic BYOK trigger banner.
 *
 * Shows when ALL of these conditions are true:
 *   1. Current date is within [Jun 8 2026, Jun 22 2026]
 *   2. Banner has not been dismissed (localStorage flag)
 *
 * Dismisses to localStorage permanently.
 * Links to BYOK modal via `onOpenByok` callback.
 *
 * Ship by Jun 3 2026 — fires 5 days after deploy, 14 days visible.
 * Copy from BYOK-ONBOARDING-COPY.md §Upgrade Prompt Addition.
 */

import { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';

const BANNER_DISMISS_KEY = 'vibesdk_byok_jun8_banner_dismissed';

// Jun 8 2026 00:00:00 UTC
const JUN_8_2026_UTC = new Date('2026-06-08T00:00:00Z').getTime();
// Jun 22 2026 23:59:59 UTC (14-day window)
const JUN_22_2026_UTC = new Date('2026-06-22T23:59:59Z').getTime();

function isWithinBannerWindow(now: number = Date.now()): boolean {
    return now >= JUN_8_2026_UTC && now <= JUN_22_2026_UTC;
}

function isBannerDismissed(): boolean {
    try {
        return localStorage.getItem(BANNER_DISMISS_KEY) === 'true';
    } catch {
        return false;
    }
}

function dismissBanner(): void {
    try {
        localStorage.setItem(BANNER_DISMISS_KEY, 'true');
    } catch {
        // localStorage unavailable — ignore
    }
}

interface ByokAnthropicBannerProps {
    /** Called when user clicks "Connect my key" — should open the BYOK modal. */
    onOpenByok: () => void;
}

export function ByokAnthropicBanner({ onOpenByok }: ByokAnthropicBannerProps) {
    const [visible, setVisible] = useState(false);

    useEffect(() => {
        // Evaluate visibility on mount only (static per session)
        if (isWithinBannerWindow() && !isBannerDismissed()) {
            setVisible(true);
        }
    }, []);

    if (!visible) return null;

    function handleDismiss() {
        dismissBanner();
        setVisible(false);
    }

    function handleConnect() {
        dismissBanner();
        setVisible(false);
        onOpenByok();
    }

    return (
        <div
            role="banner"
            aria-label="Anthropic pricing notification"
            className="relative w-full border-b border-accent/20 bg-accent/10 px-4 py-3"
        >
            <div className="mx-auto flex max-w-4xl items-center justify-between gap-4">
                <p className="text-sm text-text-primary">
                    <span className="font-medium">Seeing Anthropic&apos;s new pricing email?</span>{' '}
                    With BYOK, you pay Anthropic directly at their rates — vibesdk adds nothing on
                    top.{' '}
                </p>
                <div className="flex shrink-0 items-center gap-2">
                    <Button
                        variant="default"
                        size="sm"
                        onClick={handleConnect}
                        className="whitespace-nowrap"
                    >
                        Connect my key
                    </Button>
                    <button
                        type="button"
                        aria-label="Dismiss"
                        onClick={handleDismiss}
                        className="rounded p-1 text-text-primary/50 transition-colors hover:text-text-primary"
                    >
                        <X className="size-4" />
                    </button>
                </div>
            </div>
        </div>
    );
}

// Export for tests
export { isWithinBannerWindow, BANNER_DISMISS_KEY, JUN_8_2026_UTC, JUN_22_2026_UTC };
