import { z } from 'zod';

// ==========================================
// COMMON SCHEMAS AND TYPES
// ==========================================

export const StreamTypeSchema = z.enum(['stdout', 'stderr']);
export type StreamType = z.infer<typeof StreamTypeSchema>;

export const LogLevelSchema = z.enum([
  'debug',    // Detailed diagnostic information
  'info',     // General informational messages
  'warn',     // Warning messages (non-error issues)
  'error',    // Error messages (already handled by error system)
  'output'    // Raw process output (stdout/stderr)
]);
export type LogLevel = z.infer<typeof LogLevelSchema>;

// ==========================================
// SIMPLIFIED ERROR TYPE FOR JSON LOGS
// ==========================================

export const SimpleErrorSchema = z.object({
  timestamp: z.string(),     // ISO timestamp
  level: z.number(),          // Pino log level (50=error, 60=fatal)
  message: z.string(),        // The 'msg' field from JSON log
  rawOutput: z.string()       // The complete raw JSON log line
});
export type SimpleError = z.infer<typeof SimpleErrorSchema>;

// ==========================================
// LOG TYPES
// ==========================================

export interface LogLine {
  readonly content: string;
  readonly timestamp: Date;
  readonly stream: StreamType;
  readonly processId: string;
}

// ==========================================
// STORAGE SCHEMAS - Extend base types
// ==========================================

// StoredError extends SimpleError with storage-specific fields
export const StoredErrorSchema = SimpleErrorSchema.extend({
  id: z.number(),
  instanceId: z.string(),
  processId: z.string(),
  errorHash: z.string(),
  occurrenceCount: z.number(),
  createdAt: z.string()
});
export type StoredError = z.infer<typeof StoredErrorSchema>;

// Base fields shared by stored entities
const StoredEntityBaseSchema = z.object({
  id: z.number(),
  instanceId: z.string(),
  processId: z.string(),
  timestamp: z.string(),
  createdAt: z.string()
});

// StoredLog extends base with log-specific fields
export const StoredLogSchema = StoredEntityBaseSchema.extend({
  level: LogLevelSchema,
  message: z.string(),
  stream: StreamTypeSchema,
  source: z.string().optional(),
  metadata: z.string().nullable(),
  sequence: z.number()
});
export type StoredLog = z.infer<typeof StoredLogSchema>;

// ==========================================
// PROCESS MONITORING TYPES
// ==========================================

export const ProcessStateSchema = z.enum([
  'starting',
  'running',
  'stopping',
  'stopped',
  'crashed'
]);
export type ProcessState = z.infer<typeof ProcessStateSchema>;

export interface ProcessInfo {
  readonly id: string;
  readonly instanceId: string;
  readonly command: string;
  readonly args?: readonly string[];
  readonly cwd: string;
  pid?: number;
  readonly env?: Record<string, string>;
  readonly startTime?: Date;
  readonly status?: ProcessState;
  readonly endTime?: Date;
  readonly exitCode?: number;
  readonly restartCount: number;
  readonly lastError?: string;
}

export interface MonitoringOptions {
  readonly autoRestart?: boolean;
  readonly maxRestarts?: number;
  readonly restartDelay?: number;
  readonly healthCheckInterval?: number;
  readonly errorBufferSize?: number;
  readonly env?: Record<string, string>;
  readonly killTimeout?: number;
  readonly expectedPort?: number; // Port the child process should bind to (for health checks)
}

// ==========================================
// STORAGE OPTIONS
// ==========================================

// Base storage options shared by error and log stores
interface BaseStoreOptions {
  readonly vacuumInterval?: number;  // Hours between cleanup runs
}

export interface ErrorStoreOptions extends BaseStoreOptions {
  readonly maxErrors?: number;
  readonly retentionDays?: number;
}

export interface LogStoreOptions extends BaseStoreOptions {
  readonly maxLogs?: number;
  readonly retentionHours?: number;
  readonly bufferSize?: number;
}

// ==========================================
// FILTER & CURSOR TYPES
// ==========================================

// Base filter options shared by all filters
interface BaseFilter {
  readonly instanceId?: string;
  readonly since?: Date;
  readonly until?: Date;
  readonly limit?: number;
  readonly offset?: number;
  readonly sortOrder?: 'asc' | 'desc';
}

export interface ErrorFilter extends BaseFilter {
  readonly level?: number;
  readonly includeRaw?: boolean;
  readonly sortBy?: 'timestamp' | 'occurrenceCount';
}

export interface LogFilter extends BaseFilter {
  readonly levels?: readonly LogLevel[];
  readonly streams?: readonly StreamType[];
  readonly includeMetadata?: boolean;
  readonly afterSequence?: number;
}

export interface LogCursor {
  readonly instanceId: string;
  readonly lastSequence: number;
  readonly lastRetrieved: Date;
}

// ==========================================
// SUMMARY TYPES
// ==========================================

export interface ErrorSummary {
  readonly totalErrors: number;
  readonly errorsByLevel: Record<number, number>;
  readonly latestError?: Date;
  readonly oldestError?: Date;
  readonly uniqueErrors: number;
  readonly repeatedErrors: number;
}

export interface LogRetrievalResponse {
  readonly success: boolean;
  readonly logs: readonly StoredLog[];
  readonly cursor: LogCursor;
  readonly hasMore: boolean;
  readonly totalCount?: number;
  readonly error?: string;
}

// ==========================================
// MONITORING EVENTS
// ==========================================

export type MonitoringEvent = 
  | {
      type: 'process_started';
      processId: string;
      instanceId: string;
      pid?: number;
      command?: string;
      timestamp: Date;
    }
  | {
      type: 'process_stopped';
      processId: string;
      instanceId: string;
      exitCode?: number | null;
      reason?: string;
      timestamp: Date;
    }
  | {
      type: 'process_exited';
      processId: string;
      instanceId: string;
      code: number | null;
      signal: NodeJS.Signals | null;
      timestamp: Date;
    }
  | {
      type: 'process_error';
      processId: string;
      instanceId: string;
      error: string;
      timestamp: Date;
    }
  | {
      type: 'error_detected';
      processId: string;
      instanceId: string;
      error: SimpleError;
      timestamp: Date;
    }
  | {
      type: 'process_crashed';
      processId: string;
      instanceId: string;
      exitCode?: number | null;
      signal?: string | null;
      willRestart?: boolean;
      timestamp: Date;
    }
  | {
      type: 'restart_failed';
      processId: string;
      instanceId: string;
      attempt: number;
      error?: string;
      timestamp: Date;
    }
  | {
      type: 'health_check_failed';
      processId: string;
      instanceId: string;
      lastActivity: Date;
      timestamp: Date;
    }
  | {
      type: 'state_changed';
      processId: string;
      instanceId: string;
      oldState: ProcessState;
      newState: ProcessState;
      timestamp: Date;
    };
// ==========================================
// CONFIGURATION TYPES
// ==========================================

// Combines ProcessInfo with monitoring and storage config
export interface ProcessRunnerConfig {
  readonly instanceId: string;
  readonly command: string;
  readonly args: readonly string[];
  readonly cwd: string;
  readonly monitoring?: MonitoringOptions;
  readonly storage?: {
    readonly error?: ErrorStoreOptions;
    readonly log?: LogStoreOptions;
  };
}

// ==========================================
// UTILITY TYPES
// ==========================================

export type Result<T, E = Error> = 
  | { readonly success: true; readonly data: T }
  | { readonly success: false; readonly error: E };

// ==========================================
// CONSTANTS
// ==========================================

// Note: expectedPort is optional so we use Omit to exclude it from Required
export const DEFAULT_MONITORING_OPTIONS: Omit<Required<MonitoringOptions>, 'expectedPort'> & { expectedPort?: number } = {
  autoRestart: true,
  maxRestarts: 3,
  restartDelay: 1000,
  errorBufferSize: 100,
  healthCheckInterval: 30000,
  env: {},
  killTimeout: 10000,
  expectedPort: undefined
} as const;

export const DEFAULT_STORAGE_OPTIONS: ErrorStoreOptions = {
  maxErrors: 1000,
  retentionDays: 7,
  vacuumInterval: 24
} as const;

export const DEFAULT_LOG_STORE_OPTIONS: LogStoreOptions = {
  maxLogs: 10000,
  retentionHours: 168, // 7 days
  bufferSize: 1000
} as const;

// Configurable paths - use environment variables or default to ./data directory
export const getDataDirectory = (): string => {
  return process.env.CLI_DATA_DIR || './.data';
};

export const getErrorDbPath = (): string => {
  return process.env.CLI_ERROR_DB_PATH || `${getDataDirectory()}/errors.db`;
};

export const getLogDbPath = (): string => {
  return process.env.CLI_LOG_DB_PATH || `${getDataDirectory()}/logs.db`;
};

// Legacy constants for backward compatibility
export const ERROR_DB_PATH = getErrorDbPath();
export const LOG_DB_PATH = getLogDbPath();
export const ERROR_HASH_ALGORITHM = 'sha256' as const;