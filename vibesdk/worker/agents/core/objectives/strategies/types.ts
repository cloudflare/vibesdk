import type { ExportOptions, ExportResult } from '../../types';
import type { BaseProjectState } from '../../state';
import type { StructuredLogger } from 'worker/logger';
import type { WebSocketMessageType, WebSocketMessageData } from 'worker/api/websocketTypes';

export interface ExportContext {
	env: Env;
	logger: StructuredLogger;
	agentId: string;
	state: BaseProjectState;
	broadcast: <T extends WebSocketMessageType>(type: T, data?: WebSocketMessageData<T>) => void;
}

export interface AdditionalExportStrategy {
	getSupportedKinds(): ExportOptions['kind'][];
	export(options: ExportOptions, ctx: ExportContext): Promise<ExportResult>;
}
