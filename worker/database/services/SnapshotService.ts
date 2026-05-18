/**
 * SnapshotService — persistence layer for ADR-010 session snapshots.
 *
 * Writes on REVIEWING→IDLE completion. Reads serve the degraded-mode
 * banner endpoint. All writes are best-effort so a D1 outage cannot
 * block generation completion.
 */

import { eq } from 'drizzle-orm';
import { BaseService } from './BaseService';
import { apps, sessionSnapshots } from '../schema';
import type { SessionSnapshotRow } from '../schema';
import { generateId } from '../../utils/idGenerator';

export interface WriteSnapshotParams {
    sessionId: string;
    projectName: string;
    filesCount: number;
    templateName: string;
    snapshotJson?: Record<string, unknown>;
}

export class SnapshotService extends BaseService {
    /**
     * Upsert a snapshot for a completed session. Best-effort — catches
     * all errors so a DB outage cannot block generation completion.
     */
    async writeSnapshot(params: WriteSnapshotParams): Promise<void> {
        try {
            await this.database
                .insert(sessionSnapshots)
                .values({
                    id: generateId(),
                    sessionId: params.sessionId,
                    projectName: params.projectName,
                    filesCount: params.filesCount,
                    templateName: params.templateName,
                    snapshotJson: params.snapshotJson ?? {},
                })
                .onConflictDoUpdate({
                    target: sessionSnapshots.sessionId,
                    set: {
                        projectName: params.projectName,
                        filesCount: params.filesCount,
                        templateName: params.templateName,
                        snapshotJson: params.snapshotJson ?? {},
                        createdAt: new Date(),
                    },
                })
                .run();
        } catch (err) {
            this.logger.error('SnapshotService.writeSnapshot failed (best-effort, ignored)', {
                sessionId: params.sessionId,
                error: err instanceof Error ? err.message : String(err),
            });
        }
    }

    /**
     * Return the snapshot for a session, or null if not found / on error.
     */
    async getSnapshot(sessionId: string): Promise<SessionSnapshotRow | null> {
        try {
            const row = await this.database
                .select()
                .from(sessionSnapshots)
                .where(eq(sessionSnapshots.sessionId, sessionId))
                .get();
            return row ?? null;
        } catch (err) {
            this.logger.error('SnapshotService.getSnapshot failed', {
                sessionId,
                error: err instanceof Error ? err.message : String(err),
            });
            return null;
        }
    }

    /**
     * Resolve the userId that owns the session via the apps table.
     * Returns null when the session does not exist.
     */
    async getSessionOwnerUserId(sessionId: string): Promise<string | null> {
        const row = await this.database
            .select({ userId: apps.userId })
            .from(apps)
            .where(eq(apps.id, sessionId))
            .get();
        return row?.userId ?? null;
    }
}
