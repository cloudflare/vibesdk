import { useEffect, useState } from 'react';
import type { PlatformStatusData } from '@/api-types';
import { apiClient } from '@/lib/api-client';

const defaultStatus: PlatformStatusData = {
    globalUserMessage: '',
    changeLogs: '',
    hasActiveMessage: false,
};

let cachedStatus: PlatformStatusData | null = null;
let inFlightRequest: Promise<void> | null = null;

async function fetchStatus(): Promise<void> {
    try {
        const response = await apiClient.getPlatformStatus(true);
        if (response.success && response.data) {
            cachedStatus = response.data;
            return;
        }
    } catch (error) {
        console.debug('Failed to load platform status', error);
    }

    if (!cachedStatus) {
        cachedStatus = defaultStatus;
    }
}

export function usePlatformStatus() {
    const [status, setStatus] = useState<PlatformStatusData>(cachedStatus ?? defaultStatus);

    useEffect(() => {
        let disposed = false;

        if (!cachedStatus) {
            if (!inFlightRequest) {
                inFlightRequest = fetchStatus().finally(() => {
                    inFlightRequest = null;
                });
            }

            inFlightRequest
                .then(() => {
                    if (!disposed && cachedStatus) {
                        setStatus(cachedStatus);
                    }
                })
                .catch(() => {
                    if (!disposed) {
                        setStatus(defaultStatus);
                    }
                });
        } else {
            setStatus(cachedStatus);
        }

        return () => {
            disposed = true;
        };
    }, []);

    return {
        status,
    };
}
