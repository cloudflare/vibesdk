import { Database } from 'bun:sqlite';
import { createHash } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import {
  SimpleError,
  StoredError,
  StoredLog,
  LogLevel,
  ErrorSummary,
  ErrorStoreOptions,
  LogStoreOptions,
  LogFilter,
  LogCursor,
  LogRetrievalResponse,
  Result,
  getErrorDbPath,
  getLogDbPath,
  ERROR_HASH_ALGORITHM,
  DEFAULT_STORAGE_OPTIONS,
  DEFAULT_LOG_STORE_OPTIONS
} from './types.js';

export interface ProcessLog {
  readonly instanceId: string;
  readonly processId: string;
  readonly level: LogLevel;
  readonly message: string;
  readonly stream: 'stdout' | 'stderr';
  readonly source?: string;
  readonly metadata?: Record<string, unknown>;
}

/**
 * Unified storage manager with shared database connections and optimized operations
 */
export class StorageManager {
  private errorDb: Database;
  private logDb: Database;
  private errorStorage: ErrorStorage;
  private logStorage: LogStorage;
  private options: {
    error: Required<ErrorStoreOptions>;
    log: Required<LogStoreOptions>;
  };

  constructor(
    errorDbPath: string = getErrorDbPath(),
    logDbPath: string = getLogDbPath(),
    options: { error?: ErrorStoreOptions; log?: LogStoreOptions } = {}
  ) {
    this.options = {
      error: { ...DEFAULT_STORAGE_OPTIONS, ...options.error } as Required<ErrorStoreOptions>,
      log: { ...DEFAULT_LOG_STORE_OPTIONS, ...options.log } as Required<LogStoreOptions>
    };

    this.ensureDataDirectory(errorDbPath);
    if (errorDbPath !== logDbPath) {
      this.ensureDataDirectory(logDbPath);
    }

    this.errorDb = this.initializeDatabase(errorDbPath);
    this.logDb = errorDbPath === logDbPath ? this.errorDb : this.initializeDatabase(logDbPath);

    this.errorStorage = new ErrorStorage(this.errorDb, this.options.error);
    this.logStorage = new LogStorage(this.logDb, this.options.log);

    this.setupMaintenanceTasks();
  }

  private ensureDataDirectory(dbPath: string): void {
    const dir = path.dirname(dbPath);

    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  private initializeDatabase(dbPath: string): Database {
    
    try {
      const dbExists = fs.existsSync(dbPath);
      
      const db = new Database(dbPath);
      
      if (!dbExists) {
        try {
          db.exec('PRAGMA journal_mode = WAL');
          db.exec('PRAGMA synchronous = NORMAL');
          db.exec('PRAGMA cache_size = 10000');
          db.exec('PRAGMA temp_store = memory');
        } catch (error) {
          console.warn('Database pragma setup failed (this is okay if database already initialized):', error);
        }
      }
      
      return db;
    } catch (error) {
      console.error('Failed to initialize database at', dbPath, error);
      throw new Error(`Failed to initialize database: ${error}`);
    }
  }

  private maintenanceInterval?: ReturnType<typeof setInterval>;

  private setupMaintenanceTasks(): void {
    // Run maintenance every hour - cleanup old data based on retention settings
    this.maintenanceInterval = setInterval(() => {
      try {
        if (this.logStorage) {
          this.logStorage.cleanupOldLogs();
        }
      } catch (error) {
        console.warn('Maintenance task failed:', error);
      }
    }, 60 * 60 * 1000);
  }

  private toError(error: unknown, defaultMessage = 'Unknown error'): Error {
    return error instanceof Error ? error : new Error(String(error) || defaultMessage);
  }

  /**
   * Wrapper for retry operations
   */
  private retryOperation<T>(operation: () => Result<T>, maxRetries: number = 3): Result<T> {
    let attempt = 0;
    let lastResult: Result<T> = operation();

    while (!lastResult.success && attempt < maxRetries - 1) {
      attempt += 1;
      lastResult = operation();
    }

    return lastResult;
  }

  private wrapRetryOperation<T>(operation: () => Result<T>): Result<T> {
    try {
      return this.retryOperation(operation);
    } catch (error) {
      return { success: false, error: this.toError(error) };
    }
  }

  public storeError(instanceId: string, processId: string, error: SimpleError): Result<boolean> {
    return this.wrapRetryOperation(() => this.errorStorage.storeError(instanceId, processId, error));
  }

  public getErrors(instanceId: string): Result<StoredError[]> {
    return this.errorStorage.getErrors(instanceId);
  }

  public getErrorSummary(instanceId: string): Result<ErrorSummary> {
    return this.errorStorage.getErrorSummary(instanceId);
  }

  public clearErrors(instanceId: string): Result<{ clearedCount: number }> {
    return this.errorStorage.clearErrors(instanceId);
  }

  public storeLogs(logs: ProcessLog[]): Result<number[]> {
    return this.logStorage.storeLogs(logs);
  }

  public getLogs(filter: LogFilter = {}): Result<LogRetrievalResponse> {
    return this.logStorage.getLogs(filter);
  }

  public clearLogs(instanceId: string): Result<{ clearedCount: number }> {
    return this.logStorage.clearLogs(instanceId);
  }

  public getLogStats(instanceId: string): Result<{
    totalLogs: number;
    logsByLevel: Record<LogLevel, number>;
    logsByStream: Record<'stdout' | 'stderr', number>;
    oldestLog?: Date;
    newestLog?: Date;
  }> {
    return this.logStorage.getLogStats(instanceId);
  }

  public transaction<T>(operation: () => T): T {
    // Use error database for transaction coordination
    const transaction = this.errorDb.transaction(operation);
    return transaction();
  }

  /**
   * Close all database connections and cleanup
   */
  public close(): void {
    try {
      // Clear maintenance interval to prevent memory leaks
      if (this.maintenanceInterval) {
        clearInterval(this.maintenanceInterval);
        this.maintenanceInterval = undefined;
      }

      this.errorStorage.close();
      this.logStorage.close();

      if (this.errorDb !== this.logDb) {
        this.logDb.close();
      }
      this.errorDb.close();
    } catch (error) {
      console.error('Error closing storage manager:', error);
    }
  }
}

class ErrorStorage {
  private db: Database;
  private options: Required<ErrorStoreOptions>;

  // Prepared statements
  private insertErrorStmt: ReturnType<Database['query']>;
  private selectErrorsStmt: ReturnType<Database['query']>;
  private countErrorsStmt: ReturnType<Database['query']>;
  private deleteErrorsStmt: ReturnType<Database['query']>;
  private deleteOldErrorsStmt: ReturnType<Database['query']>;

  private errorResult<T>(error: unknown, defaultMessage: string): Result<T> {
    return {
      success: false,
      error: error instanceof Error ? error : new Error(defaultMessage)
    };
  }

  private successResult<T>(data: T): Result<T> {
    return { success: true, data };
  }

  constructor(db: Database, options: Required<ErrorStoreOptions>) {
    if (!db) {
      throw new Error('Database instance is required for ErrorStorage');
    }
    this.db = db;
    this.options = options;
    this.initializeSchema();
    this.prepareStatements();
  }

  private initializeSchema(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS simple_errors (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        instance_id TEXT NOT NULL,
        process_id TEXT NOT NULL,
        error_hash TEXT NOT NULL,
        timestamp TEXT NOT NULL,
        level INTEGER NOT NULL,
        message TEXT NOT NULL,
        raw_output TEXT NOT NULL,
        occurrence_count INTEGER DEFAULT 1,
        created_at TEXT DEFAULT (datetime('now'))
      );

      CREATE INDEX IF NOT EXISTS idx_simple_instance ON simple_errors(instance_id);
      CREATE INDEX IF NOT EXISTS idx_simple_hash ON simple_errors(error_hash);
      CREATE INDEX IF NOT EXISTS idx_simple_timestamp ON simple_errors(timestamp DESC);
      CREATE INDEX IF NOT EXISTS idx_simple_level ON simple_errors(level);
    `);
  }

  private prepareStatements(): void {
    this.insertErrorStmt = this.db.query(`
      INSERT INTO simple_errors (
        instance_id, process_id, error_hash, timestamp, level, message, raw_output
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    this.selectErrorsStmt = this.db.query(`
      WITH deduplicated AS (
        SELECT 
          MAX(id) as id,
          instance_id,
          process_id,
          error_hash,
          MAX(timestamp) as latest_timestamp,
          level,
          message,
          MAX(raw_output) as raw_output,
          SUM(occurrence_count) AS total_occurrences,
          MIN(created_at) AS first_seen
        FROM simple_errors 
        WHERE instance_id = ?
        GROUP BY error_hash
      )
      SELECT 
        id,
        instance_id,
        process_id,
        error_hash AS errorHash,
        latest_timestamp as timestamp,
        level,
        message,
        raw_output AS rawOutput,
        total_occurrences AS occurrenceCount,
        first_seen AS createdAt
      FROM deduplicated
      ORDER BY latest_timestamp DESC
    `);
    
    this.countErrorsStmt = this.db.query(`
      SELECT COUNT(*) as count FROM simple_errors WHERE instance_id = ?
    `);
    
    this.deleteErrorsStmt = this.db.query(`
      DELETE FROM simple_errors WHERE instance_id = ?
    `);
    
    this.deleteOldErrorsStmt = this.db.query(`
      DELETE FROM simple_errors 
      WHERE datetime(created_at) < datetime('now', '-' || ? || ' days')
    `);
  }

  public storeError(instanceId: string, processId: string, error: SimpleError): Result<boolean> {
    try {
        const cleanedMessage = this.cleanMessageForHashing(error.message);
      
      const errorHash = createHash(ERROR_HASH_ALGORITHM)
        .update(cleanedMessage)
        .update(String(error.level))
        .digest('hex');

      const existing = this.db.query(`
        SELECT id, occurrence_count FROM simple_errors 
        WHERE error_hash = ? AND instance_id = ?
        ORDER BY timestamp DESC
        LIMIT 1
      `).get(errorHash, instanceId) as { id: number; occurrence_count: number } | null;

      if (existing) {
        this.db.query(`
          UPDATE simple_errors 
          SET 
            occurrence_count = occurrence_count + 1,
            timestamp = ?,
            raw_output = ?
          WHERE id = ?
        `).run(error.timestamp, error.rawOutput, existing.id);
      } else {
        this.insertErrorStmt.run(
          instanceId, processId, errorHash, error.timestamp, 
          error.level, error.message, error.rawOutput
        );
      }
      
      return this.successResult(true);
    } catch (error) {
      return this.errorResult<boolean>(error, 'Unknown error storing error');
    }
  }

  public getErrors(instanceId: string): Result<StoredError[]> {
    try {
      const errors = this.selectErrorsStmt.all(instanceId) as StoredError[];
      return this.successResult(errors);
    } catch (error) {
      return this.errorResult<StoredError[]>(error, 'Unknown error retrieving errors');
    }
  }

  public getErrorSummary(instanceId: string): Result<ErrorSummary> {
    try {
      const errors = this.selectErrorsStmt.all(instanceId) as StoredError[];
      
      if (errors.length === 0) {
        return {
          success: true,
          data: {
            totalErrors: 0,
            errorsByLevel: {} as Record<number, number>,
            uniqueErrors: 0,
            repeatedErrors: 0,
            latestError: undefined,
            oldestError: undefined
          }
        };
      }

      const errorsByLevel = {} as Record<number, number>;
      const uniqueHashes = new Set<string>();
      let totalOccurrences = 0;
      
      for (const error of errors) {
        errorsByLevel[error.level] = (errorsByLevel[error.level] || 0) + error.occurrenceCount;
        uniqueHashes.add(error.errorHash);
        totalOccurrences += error.occurrenceCount;
      }

      const summary: ErrorSummary = {
        totalErrors: totalOccurrences,
        uniqueErrors: uniqueHashes.size,
        repeatedErrors: totalOccurrences - errors.length,
        errorsByLevel,
        latestError: new Date(errors[0].timestamp),
        oldestError: new Date(errors[errors.length - 1].timestamp)
      };

      return this.successResult(summary);
    } catch (error) {
      return this.errorResult<ErrorSummary>(error, 'Unknown error getting summary');
    }
  }

  public clearErrors(instanceId: string): Result<{ clearedCount: number }> {
    try {
      const countResult = this.countErrorsStmt.get(instanceId) as { count: number };
      const clearedCount = countResult?.count || 0;
      
      this.deleteErrorsStmt.run(instanceId);
      
      return this.successResult({ clearedCount });
    } catch (error) {
      return this.errorResult<{ clearedCount: number }>(error, 'Unknown error clearing errors');
    }
  }
  
  private cleanMessageForHashing(message: string): string {
    let cleaned = message;
    
    cleaned = cleaned.replace(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z/g, 'TIMESTAMP');
    
    cleaned = cleaned.replace(/\b\d{13}\b/g, 'UNIX_TIME');
    
    cleaned = cleaned.replace(/:\d{4,5}\b/g, ':PORT');
    
    cleaned = cleaned.replace(/(:\d+):(\d+)/g, ':LINE:COL');
    
    cleaned = cleaned.replace(/\?v=[a-f0-9]+/g, '?v=HASH');
    
    cleaned = cleaned.replace(/\s+/g, ' ').trim();
    
    if (cleaned.length > 500) {
      cleaned = cleaned.substring(0, 500);
    }
    
    return cleaned;
  }

  public close(): void {
    // Prepared statements are automatically cleaned up
  }
}

class LogStorage {
  private db: Database;
  private options: Required<LogStoreOptions>;

  // Prepared statements
  private insertLogStmt: ReturnType<Database['query']>;
  private selectLogsStmt: ReturnType<Database['query']>;
  private countLogsStmt: ReturnType<Database['query']>;
  private deleteOldLogsStmt: ReturnType<Database['query']>;
  private getLastSequenceStmt: ReturnType<Database['query']>;
  private deleteAllLogsStmt: ReturnType<Database['query']>;

  private sequenceCounter = 0;

  constructor(db: Database, options: Required<LogStoreOptions>) {
    this.db = db;
    this.options = options;
    this.initializeSchema();
    this.prepareStatements();
    this.initializeSequenceCounter();
  }

  private initializeSchema(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS process_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        instance_id TEXT NOT NULL,
        process_id TEXT NOT NULL,
        level TEXT NOT NULL,
        message TEXT NOT NULL,
        timestamp TEXT NOT NULL,
        stream TEXT NOT NULL,
        source TEXT,
        metadata TEXT,
        sequence INTEGER UNIQUE NOT NULL,
        created_at TEXT DEFAULT (datetime('now'))
      );

      CREATE INDEX IF NOT EXISTS idx_instance_logs ON process_logs(instance_id);
      CREATE INDEX IF NOT EXISTS idx_sequence ON process_logs(sequence);
      CREATE INDEX IF NOT EXISTS idx_timestamp ON process_logs(timestamp DESC);
      CREATE INDEX IF NOT EXISTS idx_level ON process_logs(level);
      CREATE INDEX IF NOT EXISTS idx_instance_sequence ON process_logs(instance_id, sequence);
    `);
  }

  private prepareStatements(): void {
    this.insertLogStmt = this.db.query(`
      INSERT INTO process_logs (
        instance_id, process_id, level, message, timestamp, 
        stream, source, metadata, sequence
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    this.selectLogsStmt = this.db.query(`
      SELECT * FROM process_logs
      WHERE instance_id = ?
      ORDER BY sequence DESC
      LIMIT ? OFFSET ?
    `);

    this.countLogsStmt = this.db.query(`
      SELECT COUNT(*) as count FROM process_logs WHERE instance_id = ?
    `);

    this.deleteOldLogsStmt = this.db.query(`
      DELETE FROM process_logs 
      WHERE datetime(timestamp) < datetime('now', '-' || ? || ' hours')
    `);

    this.getLastSequenceStmt = this.db.query(`
      SELECT MAX(sequence) as maxSequence FROM process_logs
    `);

    this.deleteAllLogsStmt = this.db.query(`
      DELETE FROM process_logs WHERE instance_id = ?
    `);
  }

  private initializeSequenceCounter(): void {
    const result = this.getLastSequenceStmt.get() as { maxSequence: number | null };
    this.sequenceCounter = (result?.maxSequence || 0) + 1;
  }

  public storeLog(log: ProcessLog): Result<number> {
    try {
      const sequence = this.sequenceCounter++;
      const now = new Date().toISOString();
      
      this.insertLogStmt.run(
        log.instanceId, log.processId, log.level, log.message, now,
        log.stream, log.source || null, 
        log.metadata ? JSON.stringify(log.metadata) : null, sequence
      );


      return { success: true, data: sequence };
    } catch (error) {
      return { 
        success: false, 
        error: error instanceof Error ? error : new Error('Unknown error storing log') 
      };
    }
  }

  public storeLogs(logs: ProcessLog[]): Result<number[]> {
    try {
      const sequences: number[] = [];
      const transaction = this.db.transaction(() => {
        for (const log of logs) {
          const result = this.storeLog(log);
          if (!result.success) {
            if ('error' in result) {
              throw result.error;
            }
            throw new Error('Unknown error storing log');
          }
          sequences.push(result.data);
        }
      });

      transaction();
      return { success: true, data: sequences };
    } catch (error) {
      return { 
        success: false, 
        error: error instanceof Error ? error : new Error('Unknown error storing logs') 
      };
    }
  }

  public getLogs(filter: LogFilter = {}): Result<LogRetrievalResponse> {
    try {
      const instanceId = filter.instanceId || '';
      const limit = filter.limit || 100;
      const offset = filter.offset || 0;

      const logs = this.selectLogsStmt.all(instanceId, limit, offset) as StoredLog[];
      const countResult = this.countLogsStmt.get(instanceId) as { count: number };
      const totalCount = countResult?.count || 0;

      const lastSequence = logs.length > 0 ? Math.max(...logs.map(l => l.sequence)) : 0;
      const cursor: LogCursor = {
        instanceId,
        lastSequence,
        lastRetrieved: new Date()
      };

      const hasMore = offset + logs.length < totalCount;

      return {
        success: true,
        data: {
          success: true,
          logs,
          cursor,
          hasMore,
          totalCount
        }
      };
    } catch (error) {
      return { 
        success: false, 
        error: error instanceof Error ? error : new Error('Unknown error retrieving logs') 
      };
    }
  }


  public clearLogs(instanceId: string): Result<{ clearedCount: number }> {
    try {
      const countResult = this.countLogsStmt.get(instanceId) as { count: number };
      const clearedCount = countResult?.count || 0;
      
      this.deleteAllLogsStmt.run(instanceId);

      return { success: true, data: { clearedCount } };
    } catch (error) {
      return { 
        success: false, 
        error: error instanceof Error ? error : new Error('Unknown error clearing logs') 
      };
    }
  }

  public getLogStats(instanceId: string): Result<{
    totalLogs: number;
    logsByLevel: Record<LogLevel, number>;
    logsByStream: Record<'stdout' | 'stderr', number>;
    oldestLog?: Date;
    newestLog?: Date;
  }> {
    try {
      const stats = this.db.query(`
        SELECT 
          COUNT(*) as total,
          level,
          stream,
          MIN(timestamp) as oldest,
          MAX(timestamp) as newest
        FROM process_logs 
        WHERE instance_id = ?
        GROUP BY level, stream
      `).all(instanceId) as Array<{
        total: number;
        level: LogLevel;
        stream: 'stdout' | 'stderr';
        oldest: string;
        newest: string;
      }>;

      const logsByLevel: Record<string, number> = {};
      const logsByStream: Record<string, number> = {};
      let totalLogs = 0;
      let oldestLog: Date | undefined;
      let newestLog: Date | undefined;

      for (const stat of stats) {
        totalLogs += stat.total;
        logsByLevel[stat.level] = (logsByLevel[stat.level] || 0) + stat.total;
        logsByStream[stat.stream] = (logsByStream[stat.stream] || 0) + stat.total;
        
        const oldest = new Date(stat.oldest);
        const newest = new Date(stat.newest);
        
        if (!oldestLog || oldest < oldestLog) oldestLog = oldest;
        if (!newestLog || newest > newestLog) newestLog = newest;
      }

      return {
        success: true,
        data: {
          totalLogs,
          logsByLevel: logsByLevel as Record<LogLevel, number>,
          logsByStream: logsByStream as Record<'stdout' | 'stderr', number>,
          oldestLog,
          newestLog
        }
      };
    } catch (error) {
      return { 
        success: false, 
        error: error instanceof Error ? error : new Error('Unknown error getting log stats') 
      };
    }
  }

  public cleanupOldLogs(): Result<number> {
    try {
      const result = this.deleteOldLogsStmt.run(this.options.retentionHours);
      return { success: true, data: result.changes };
    } catch (error) {
      return { 
        success: false, 
        error: error instanceof Error ? error : new Error('Unknown error cleaning up logs') 
      };
    }
  }

  public close(): void {
    // Database connection is managed by StorageManager
  }
}
