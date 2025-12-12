#!/usr/bin/env bun
import { parseArgs } from 'util';
import { StorageManager } from './storage.js';
import { ProcessMonitor } from './process-monitor.js';
import { 
  ProcessRunnerConfig, 
  ProcessInfo, 
  MonitoringOptions,
  LogStoreOptions as LogStoreOptionsType,
  ErrorStoreOptions as ErrorStoreOptionsType,
  LogFilter,
  LogCursor,
  LogLevel,
  StoredError,
  StoredLog,
  SimpleError,
  Result,
  DEFAULT_MONITORING_OPTIONS,
  DEFAULT_STORAGE_OPTIONS,
  DEFAULT_LOG_STORE_OPTIONS,
  getDataDirectory,
  getErrorDbPath,
  getLogDbPath
} from './types.js';

// Instance ID validation pattern - alphanumeric with dashes and underscores
const INSTANCE_ID_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9_-]*$/;
const MAX_INSTANCE_ID_LENGTH = 64;

/**
 * Validate instance ID format to prevent path traversal and other issues
 */
function validateInstanceId(id: string): void {
  if (!id || id.length === 0) {
    throw new Error('Instance ID is required');
  }
  if (id.length > MAX_INSTANCE_ID_LENGTH) {
    throw new Error(`Instance ID must be ${MAX_INSTANCE_ID_LENGTH} characters or less`);
  }
  if (!INSTANCE_ID_PATTERN.test(id)) {
    throw new Error('Instance ID must start with alphanumeric and contain only alphanumeric, dash, or underscore');
  }
}

/**
 * Safely parse integer argument with validation
 */
function parseIntArg(args: Record<string, unknown>, key: string): number | undefined {
  const value = args[key];
  if (value === undefined || value === null) {
    return undefined;
  }
  const parsed = parseInt(String(value), 10);
  if (isNaN(parsed)) {
    throw new Error(`Invalid integer value for --${key}: ${value}`);
  }
  return parsed;
}

class SafeJSON {
  static stringify(data: unknown, space?: number): string {
    try {
      const seen = new WeakSet();
      const json = JSON.stringify(data, (_key, value) => {
        if (typeof value === 'object' && value !== null) {
          if (seen.has(value)) {
            return '[Circular Reference]';
          }
          seen.add(value);
        }
        return value;
      }, space);
      return json;
    } catch {
      // Fallback for any stringify errors
      return JSON.stringify({
        error: 'Failed to serialize data',
        type: typeof data,
        string: String(data).substring(0, 200)
      }, null, space);
    }
  }

  static parse(text: string): unknown {
    try {
      return JSON.parse(text);
    } catch {
      // Return error object for failed parsing
      return {
        success: false,
        error: 'Invalid JSON format',
        rawText: text.substring(0, 200)
      };
    }
  }
}

class SafeCleanup {
  /**
   * Safely close storage manager.
   * Storage.close() is synchronous, so we just wrap it in try-catch.
   */
  static closeStorage(storage: StorageManager | null): void {
    if (!storage) return;

    try {
      storage.close();
    } catch (error) {
      console.warn('Storage close error:', error);
      // Don't throw - we're in cleanup
    }
  }
}

class OutputFormatter {
  static formatOutput(data: unknown, format: 'json' | 'table' | 'raw' = 'json'): void {
    switch (format) {
      case 'json':
        console.log(SafeJSON.stringify(data, 2));
        break;
      case 'raw':
        if (typeof data === 'string') {
          console.log(data);
        } else {
          console.log(String(data));
        }
        break;
      case 'table':
        // Table formatting is handled by specific formatters
        console.log(SafeJSON.stringify(data, 2));
        break;
    }
  }

  static formatError(error: string, additionalData?: Record<string, unknown>): void {
    const errorResponse = {
      success: false,
      error,
      ...additionalData
    };
    console.log(SafeJSON.stringify(errorResponse, 2));
  }

  static formatSuccess(message: string, data?: unknown): void {
    const successResponse: Record<string, unknown> = {
      success: true,
      message
    };
    if (data) {
      successResponse.data = data;
    }
    console.log(SafeJSON.stringify(successResponse, 2));
  }

  static printErrorsTable(errors: readonly StoredError[]): void {
    if (errors.length === 0) {
      console.log('No errors found.');
      return;
    }

    console.log('Timestamp'.padEnd(20) + 'Level'.padEnd(10) + 'Message');
    console.log('-'.repeat(80));

    for (const error of errors) {
      const timestamp = new Date(error.timestamp).toISOString().slice(0, 16).replace('T', ' ');
      const level = `L${error.level}`.padEnd(9);
      const message = error.message.length > 50 ? error.message.substring(0, 47) + '...' : error.message;
      
      console.log(`${timestamp} ${level} ${message}`);
      
      if (error.occurrenceCount > 1) {
        console.log(''.padEnd(30) + `(occurred ${error.occurrenceCount} times)`);
      }
    }
  }

  static printLogsTable(logs: readonly StoredLog[]): void {
    if (logs.length === 0) {
      console.log('No logs found.');
      return;
    }

    console.log('Timestamp'.padEnd(20) + 'Level'.padEnd(8) + 'Stream'.padEnd(8) + 'Source'.padEnd(15) + 'Message');
    console.log('-'.repeat(100));

    for (const log of logs) {
      const timestamp = new Date(log.timestamp).toISOString().slice(0, 16).replace('T', ' ');
      const level = log.level.padEnd(7);
      const stream = log.stream.padEnd(7);
      const source = (log.source || 'unknown').padEnd(14);
      const message = log.message.length > 50 ? log.message.substring(0, 47) + '...' : log.message;
      
      console.log(`${timestamp} ${level} ${stream} ${source} ${message}`);
    }
  }
}

class ProcessCommands {
  private static activeRunners = new Map<string, ProcessRunner>();

  static async start(options: {
    instanceId: string;
    command: string;
    args: string[];
    cwd?: string;
    port?: string;
    healthCheckInterval?: number;
    maxRestarts?: number;
    restartDelay?: number;
    maxErrors?: number;
    retentionDays?: number;
    logRetentionHours?: number;
  }): Promise<void> {
    try {
      // Check if already running
      if (this.activeRunners.has(options.instanceId)) {
        OutputFormatter.formatError(`Process ${options.instanceId} is already running`);
        process.exit(1);
      }

      // Set PORT environment variable if provided
      if (options.port) {
        process.env.PORT = options.port;
      }

      // Build configuration
      const envVars: Record<string, string> = {};
      if (options.port) {
        envVars.PORT = options.port;
      }

      const expectedPort = options.port ? Number.parseInt(options.port, 10) : undefined;
      const hasExpectedPort = Number.isFinite(expectedPort);

      // Default behavior for port-bound dev servers (e.g. Vite):
      // - Probe every 10s
      // - Retry for ~2 minutes (12 * 10s)
      const defaultHealthCheckInterval = hasExpectedPort ? 10000 : DEFAULT_MONITORING_OPTIONS.healthCheckInterval;
      const defaultRestartDelay = hasExpectedPort ? 1000 : DEFAULT_MONITORING_OPTIONS.restartDelay;
      const defaultMaxRestarts = hasExpectedPort ? 120 : DEFAULT_MONITORING_OPTIONS.maxRestarts;

      const monitoring: MonitoringOptions = {
        ...DEFAULT_MONITORING_OPTIONS,
        expectedPort: hasExpectedPort ? expectedPort : undefined,
        healthCheckInterval: options.healthCheckInterval ?? defaultHealthCheckInterval,
        maxRestarts: options.maxRestarts ?? defaultMaxRestarts,
        restartDelay: options.restartDelay ?? defaultRestartDelay,
        env: envVars
      };

      const errorStorage: ErrorStoreOptionsType = {
        ...DEFAULT_STORAGE_OPTIONS,
        maxErrors: options.maxErrors ?? DEFAULT_STORAGE_OPTIONS.maxErrors,
        retentionDays: options.retentionDays ?? DEFAULT_STORAGE_OPTIONS.retentionDays
      };

      const logStorage: LogStoreOptionsType = {
        ...DEFAULT_LOG_STORE_OPTIONS,
        retentionHours: options.logRetentionHours ?? DEFAULT_LOG_STORE_OPTIONS.retentionHours
      };

      const config: ProcessRunnerConfig = {
        instanceId: options.instanceId,
        command: options.command,
        args: options.args,
        cwd: options.cwd || process.cwd(),
        monitoring,
        storage: {
          error: errorStorage,
          log: logStorage
        }
      };

      console.log('Starting Process Monitor:');
      console.log(`  Instance ID: ${options.instanceId}`);
      console.log(`  Command: ${options.command} ${options.args.join(' ')}`);
      console.log(`  Working Directory: ${config.cwd}`);
      console.log(`  Max Restarts: ${monitoring.maxRestarts}`);
      console.log(`  Restart Delay: ${monitoring.restartDelay}ms`);
      console.log(`  Health Check Interval: ${monitoring.healthCheckInterval ?? DEFAULT_MONITORING_OPTIONS.healthCheckInterval}ms`);
      if (monitoring.expectedPort) {
        console.log(`  Expected Port: ${monitoring.expectedPort}`);
      }

      // Create and start ProcessRunner with storage options
      const runner = new ProcessRunner(config, { 
        error: errorStorage, 
        log: logStorage 
      });
      const startResult = await runner.start();

      if (!startResult.success && 'error' in startResult) {
        OutputFormatter.formatError(`Failed to start process: ${startResult.error.message}`);
        process.exit(1);
      }

      // Store active runner
      this.activeRunners.set(options.instanceId, runner);

      if (startResult.success) {
        console.log(`Process monitoring started successfully. PID: ${startResult.data.pid}`);
        console.log('Process is active. Press Ctrl+C to stop.');
      }

      // Setup periodic status reporting
      const statusInterval = setInterval(() => {
        const processInfo = runner.getProcessInfo();
        if (processInfo && processInfo.startTime) {
          const uptime = Math.floor((Date.now() - processInfo.startTime.getTime()) / 1000);
          console.log(`[STATUS] Process ${processInfo.id} running for ${uptime}s (restarts: ${processInfo.restartCount})`);
        } else if (processInfo) {
          console.log(`[STATUS] Process ${processInfo.id} running (restarts: ${processInfo.restartCount})`);
        }
      }, 60000); // Every minute

      // Setup graceful shutdown with race condition protection
      let isShuttingDown = false;
      const gracefulShutdown = async (signal: string) => {
        if (isShuttingDown) {
          console.log(`\nAlready shutting down, ignoring ${signal}`);
          return;
        }
        isShuttingDown = true;
        
        console.log(`\nReceived ${signal}. Initiating graceful shutdown...`);
        clearInterval(statusInterval);
        
        try {
          await runner.stop();
          this.activeRunners.delete(options.instanceId);
          console.log('Graceful shutdown completed');
        } catch (shutdownError) {
          console.error('Error during shutdown:', shutdownError);
        }
        
        process.exit(0);
      };

      process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
      process.on('SIGINT', () => gracefulShutdown('SIGINT'));
      process.on('SIGHUP', () => gracefulShutdown('SIGHUP'));

      // Keep alive (process will exit via signal handlers)
      await new Promise(() => {}); // Never resolves

    } catch (error) {
      OutputFormatter.formatError(`Process start failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      process.exit(1);
    }
  }

  static async stop(options: { instanceId: string; force?: boolean }): Promise<void> {
    try {
      const runner = this.activeRunners.get(options.instanceId);
      if (!runner) {
        OutputFormatter.formatError(`Process ${options.instanceId} is not running`);
        process.exit(1);
      }

      if (runner) {
        const stopResult = await runner.stop(options.force);
        if (!stopResult.success && 'error' in stopResult) {
          OutputFormatter.formatError(`Failed to stop process: ${stopResult.error.message}`);
          process.exit(1);
        }

        this.activeRunners.delete(options.instanceId);
        OutputFormatter.formatSuccess(`Process ${options.instanceId} stopped successfully`);
      }

    } catch (error) {
      OutputFormatter.formatError(`Process stop failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      process.exit(1);
    }
  }

  static async status(options: { instanceId?: string }): Promise<void> {
    try {
      if (options.instanceId) {
        const runner = this.activeRunners.get(options.instanceId);
        if (!runner) {
          OutputFormatter.formatError(`Process ${options.instanceId} is not running`);
          return;
        }

        const stats = runner.getStats();
        OutputFormatter.formatOutput({
          success: true,
          instanceId: options.instanceId,
          status: 'running',
          ...stats
        });
      } else {
        // List all active processes
        const processes = Array.from(this.activeRunners.entries()).map(([instanceId, runner]) => ({
          instanceId,
          stats: runner.getStats()
        }));

        OutputFormatter.formatOutput({
          success: true,
          activeProcesses: processes.length,
          processes
        });
      }
    } catch (error) {
      OutputFormatter.formatError(`Status check failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
}

class ProcessRunner {
  private config: ProcessRunnerConfig;
  private storage: StorageManager;
  private monitor?: ProcessMonitor;
  private isRunning = false;

  constructor(config: ProcessRunnerConfig, storageOptions?: { error?: ErrorStoreOptionsType; log?: LogStoreOptionsType }) {
    this.config = config;
      const options = storageOptions || config.storage || {};
    this.storage = new StorageManager(undefined, undefined, options);
  }

  async start(): Promise<Result<ProcessInfo>> {
    try {
      if (this.isRunning) {
        return { success: false, error: new Error('ProcessRunner is already running') };
      }

      const processInfo: ProcessInfo = {
        id: `proc-${this.config.instanceId}-${Date.now()}`,
        instanceId: this.config.instanceId,
        command: this.config.command,
        args: this.config.args,
        cwd: this.config.cwd,
        status: 'starting',
        startTime: new Date(),
        restartCount: 0
      };

      this.monitor = new ProcessMonitor(processInfo, this.storage, this.config.monitoring);
      this.setupMonitorEventHandlers();

      const startResult = await this.monitor.start();
      if (!startResult.success) {
        return startResult;
      }

      this.isRunning = true;
      return startResult;
    } catch (error) {
      return { 
        success: false, 
        error: error instanceof Error ? error : new Error('Unknown error starting ProcessRunner') 
      };
    }
  }

  async stop(force = false): Promise<Result<boolean>> {
    try {
      if (!this.isRunning || !this.monitor) {
        return { success: true, data: true };
      }

      const stopResult = await this.monitor.stop();
      this.isRunning = false;

      await this.monitor.cleanup();
      this.monitor = undefined;
      this.storage.close();

      // Convert Result<void> to Result<boolean>
      if (stopResult.success) {
        return { success: true, data: true };
      } else if ('error' in stopResult) {
        return { success: false, error: stopResult.error };
      } else {
        return { success: false, error: new Error('Unknown error stopping process') };
      }
    } catch (error) {
      return { 
        success: false, 
        error: error instanceof Error ? error : new Error('Unknown error stopping ProcessRunner') 
      };
    }
  }

  getProcessInfo(): ProcessInfo | null {
    return this.monitor?.getProcessInfo() || null;
  }

  getStats(): Record<string, unknown> {
    if (!this.monitor) {
      return { error: 'Monitor not initialized' };
    }

    const processInfo = this.monitor.getProcessInfo();
    return {
      processId: processInfo.id,
      instanceId: processInfo.instanceId,
      pid: processInfo.pid,
      status: processInfo.status,
      startTime: processInfo.startTime,
      restartCount: processInfo.restartCount,
      config: {
        instanceId: this.config.instanceId,
        command: this.config.command,
        args: this.config.args,
        cwd: this.config.cwd
      }
    };
  }

  private setupMonitorEventHandlers(): void {
    if (!this.monitor) return;

    this.monitor.on('process_started', (event) => {
      console.log(`[${event.timestamp.toISOString()}] Process started: PID ${event.pid}`);
    });

    this.monitor.on('process_stopped', (event) => {
      console.log(`[${event.timestamp.toISOString()}] Process stopped: ${event.reason}`);
    });

    this.monitor.on('error_detected', (event) => {
      const { error } = event;
      console.error(`[${event.timestamp.toISOString()}] Error detected [Level ${error.level}]: ${error.message}`);
    });

    this.monitor.on('process_crashed', (event) => {
      console.error(`[${event.timestamp.toISOString()}] Process crashed: Exit code ${event.exitCode}, Signal: ${event.signal}`);
      if (event.willRestart) {
        console.log('Process will be restarted automatically');
      }
    });
  }
}

class ErrorCommands {
  static async list(options: {
    instanceId: string;
    minLevel?: number;
    maxLevel?: number;
    since?: string;
    until?: string;
    limit?: number;
    offset?: number;
    format?: 'json' | 'table' | 'raw';
    dbPath?: string;
    reset?: boolean;
  }): Promise<void> {
    let storage: StorageManager | null = null;
    
    try {
      storage = new StorageManager(options.dbPath);
      const result = storage.getErrors(options.instanceId);
      
      if (!result.success && 'error' in result) {
        throw result.error;
      }

      let filteredErrors = result.data;

      // Apply filters
      if (options.minLevel !== undefined) {
        filteredErrors = filteredErrors.filter(error => 
          error.level >= options.minLevel!
        );
      }
      
      if (options.maxLevel !== undefined) {
        filteredErrors = filteredErrors.filter(error => 
          error.level <= options.maxLevel!
        );
      }

      if (options.since) {
        const sinceDate = new Date(options.since);
        filteredErrors = filteredErrors.filter(error => 
          new Date(error.timestamp) >= sinceDate
        );
      }

      if (options.until) {
        const untilDate = new Date(options.until);
        filteredErrors = filteredErrors.filter(error => 
          new Date(error.timestamp) <= untilDate
        );
      }

      // Apply pagination
      const offset = options.offset || 0;
      const limit = options.limit || 100;
      const paginatedErrors = filteredErrors.slice(offset, offset + limit);

      const response = {
        success: true,
        errors: paginatedErrors,
        summary: {
          totalErrors: filteredErrors.length,
          errorsByLevel: this.countByField(filteredErrors, 'level'),
          hasMore: offset + paginatedErrors.length < filteredErrors.length
        }
      };

      let resetInfo: { clearedCount: number } | undefined;
      if (options.reset) {
        if (!storage) {
          throw new Error('Storage not initialized for reset operation');
        }

        const clearResult = storage.clearErrors(options.instanceId);
        if (!clearResult.success) {
          if ('error' in clearResult) {
            throw clearResult.error;
          }
          throw new Error('Failed to clear errors');
        }

        resetInfo = { clearedCount: clearResult.data.clearedCount };
      }

      if (options.format === 'table') {
        OutputFormatter.printErrorsTable(paginatedErrors);
        if (resetInfo) {
          console.log(`\nCleared ${resetInfo.clearedCount} stored errors.`);
        }
      } else {
        const outputPayload = resetInfo ? { ...response, reset: resetInfo } : response;
        OutputFormatter.formatOutput(outputPayload, options.format);
      }
      
      // Explicit exit after successful execution
      process.exit(0);

    } catch (error) {
      try {
        OutputFormatter.formatError(
          error instanceof Error ? error.message : String(error),
          { instanceId: options.instanceId }
        );
      } catch (formatError) {
        // Fallback if formatting fails
        console.error(SafeJSON.stringify({ success: false, error: String(error) }));
      }
      process.exit(1);
    } finally {
      // Single cleanup point - close storage only once
      SafeCleanup.closeStorage(storage);
    }
  }

  static async stats(options: { instanceId: string; dbPath?: string }): Promise<void> {
    const storage = new StorageManager(options.dbPath);
    
    try {
      const result = storage.getErrorSummary(options.instanceId);
      if (!result.success && 'error' in result) {
        throw result.error;
      }

      const response = {
        success: true,
        instanceId: options.instanceId,
        ...result.data
      };

      OutputFormatter.formatOutput(response);
      
      // Explicit exit after successful execution
      process.exit(0);

    } catch (error) {
      OutputFormatter.formatError(
        error instanceof Error ? error.message : String(error),
        { instanceId: options.instanceId }
      );
      process.exit(1);
    } finally {
      SafeCleanup.closeStorage(storage);
    }
  }

  static async clear(options: { instanceId: string; confirm: boolean; dbPath?: string }): Promise<void> {
    if (!options.confirm) {
      OutputFormatter.formatError('--confirm flag required to clear errors');
      process.exit(1);
    }

    const storage = new StorageManager(options.dbPath);
    
    try {
      const result = storage.clearErrors(options.instanceId);
      if (!result.success && 'error' in result) {
        throw result.error;
      }

      const response = {
        success: true,
        message: `Cleared ${result.data.clearedCount} errors for instance ${options.instanceId}`,
        clearedCount: result.data.clearedCount
      };

      OutputFormatter.formatOutput(response);
      
      // Explicit exit after successful execution
      process.exit(0);

    } catch (error) {
      OutputFormatter.formatError(
        error instanceof Error ? error.message : String(error),
        { instanceId: options.instanceId }
      );
      process.exit(1);
    } finally {
      SafeCleanup.closeStorage(storage);
    }
  }

  private static countByField(errors: readonly StoredError[], field: keyof StoredError): Record<string, number> {
    const counts: Record<string, number> = {};
    for (const error of errors) {
      const value = String(error[field]);
      counts[value] = (counts[value] || 0) + 1;
    }
    return counts;
  }
}

class LogCommands {
  static async list(options: {
    instanceId: string;
    levels?: LogLevel[];
    streams?: ('stdout' | 'stderr')[];
    since?: string;
    until?: string;
    limit?: number;
    offset?: number;
    format?: 'json' | 'table' | 'raw';
    dbPath?: string;
  }): Promise<void> {
    const storage = new StorageManager(undefined, options.dbPath);
    
    try {
      const filter: LogFilter = {
        instanceId: options.instanceId,
        levels: options.levels,
        streams: options.streams,
        since: options.since ? new Date(options.since) : undefined,
        until: options.until ? new Date(options.until) : undefined,
        limit: options.limit || 100,
        offset: options.offset || 0,
        sortOrder: 'desc'
      };

      const result = storage.getLogs(filter);
      if (!result.success && 'error' in result) {
        throw result.error;
      }

      const response = result.data;

      if (options.format === 'table') {
        OutputFormatter.printLogsTable(response.logs);
      } else if (options.format === 'raw') {
        response.logs.forEach(log => console.log(log.message));
      } else {
        OutputFormatter.formatOutput(response, options.format);
      }
      
      // Explicit exit after successful execution
      process.exit(0);

    } catch (error) {
      OutputFormatter.formatError(
        error instanceof Error ? error.message : String(error),
        { instanceId: options.instanceId }
      );
      process.exit(1);
    } finally {
      SafeCleanup.closeStorage(storage);
    }
  }



  static async get(options: {
    instanceId: string;
    format?: 'json' | 'raw';
    reset?: boolean;
    durationSeconds?: number;
  }): Promise<void> {
    try {
      const { promises: fs } = require('fs');
      const { join } = require('path');
      const { randomUUID } = require('crypto');

      const logFilePath = join(getDataDirectory(), `${options.instanceId}-process.log`);
      const lockFilePath = `${logFilePath}.lock`;
      const tempPath = `${logFilePath}.tmp.${randomUUID()}.${process.pid}`;

      let logs = '';

      const LOCK_STALE_MS = 30000; // Must match FileLock in process-monitor.ts
      const MAX_RETRIES = 10;
      const RETRY_DELAY_MS = 50;

      // File-based locking coordinated with SimpleLogManager
      const acquireLock = async (): Promise<boolean> => {
        for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
          try {
            await fs.writeFile(lockFilePath, `${process.pid}:${Date.now()}`, { flag: 'wx' });
            return true;
          } catch (error: unknown) {
            const fsError = error as { code?: string };
            if (fsError?.code === 'EEXIST') {
              // Lock exists - check if stale
              try {
                const content = await fs.readFile(lockFilePath, 'utf8');
                const [, timestamp] = content.split(':');
                const lockTime = parseInt(timestamp, 10);
                if (Date.now() - lockTime > LOCK_STALE_MS) {
                  // Stale lock - remove and retry
                  await fs.unlink(lockFilePath).catch(() => {});
                  continue;
                }
              } catch {
                // Can't read lock file - try again
              }
              // Wait and retry
              await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS + Math.random() * RETRY_DELAY_MS));
            } else {
              return false;
            }
          }
        }
        return false;
      };

      const releaseLock = async (): Promise<void> => {
        try {
          await fs.unlink(lockFilePath);
        } catch {
          // Ignore lock release errors
        }
      };

      const lockAcquired = await acquireLock();

      if (!lockAcquired) {
        throw new Error('Could not acquire file lock for log operation');
      }

      try {
        if (options.reset) {
          // Reset mode: Atomic operation to read and clear the file
          try {
            await fs.rename(logFilePath, tempPath);

            // Create new empty log file immediately
            await fs.writeFile(logFilePath, '', 'utf8').catch(() => {});

            // Read from temp file and clean up
            try {
              logs = await fs.readFile(tempPath, 'utf8');
              await fs.unlink(tempPath).catch(() => {}); // Clean up temp file
            } catch {
              // If we can't read temp file, at least clean it up
              await fs.unlink(tempPath).catch(() => {});
              logs = '';
            }
          } catch (error: unknown) {
            // File doesn't exist yet, return empty
            const fsError = error as { code?: string };
            if (fsError?.code === 'ENOENT') {
              logs = '';
            } else {
              throw error;
            }
          }
        } else {
          // Read-only mode: Just read the file without resetting
          try {
            logs = await fs.readFile(logFilePath, 'utf8');
          } catch (error: unknown) {
            // File doesn't exist yet, return empty
            const fsError = error as { code?: string };
            if (fsError?.code === 'ENOENT') {
              logs = '';
            } else {
              throw error;
            }
          }
        }
      } finally {
        await releaseLock();
      }
      
      // Filter logs by duration if specified
      if (options.durationSeconds && options.durationSeconds > 0) {
        logs = LogCommands.filterLogsByDuration(logs, options.durationSeconds);
      }
      
      if (options.format === 'raw') {
        console.log(logs);
      } else {
        const response = {
          success: true,
          logs: logs,
          instanceId: options.instanceId
        };
        OutputFormatter.formatOutput(response, options.format);
      }
      
      // Explicit exit after successful execution
      process.exit(0);

    } catch (error) {
      OutputFormatter.formatError(
        error instanceof Error ? error.message : String(error),
        { instanceId: options.instanceId }
      );
      process.exit(1);
    }
  }

  /**
   * Filter logs by duration (keep only logs newer than X seconds ago)
   * Log format: [2025-10-17T05:30:24.985Z] [stdout] content
   */
  static filterLogsByDuration(logs: string, durationSeconds: number): string {
    if (!logs || logs.trim().length === 0) {
      return logs;
    }

    const lines = logs.split('\n');
    const now = Date.now();
    const cutoffTime = now - (durationSeconds * 1000);
    
    const filteredLines = lines.filter(line => {
      // Match log format: [ISO_TIMESTAMP] [stream] content
      const timestampMatch = line.match(/^\[([^\]]+)\]/);
      if (!timestampMatch) {
        // If no timestamp, keep the line (might be continuation of previous log)
        return true;
      }
      
      try {
        const timestamp = new Date(timestampMatch[1]).getTime();
        return timestamp >= cutoffTime;
      } catch (error) {
        // If timestamp parsing fails, keep the line
        return true;
      }
    });
    
    return filteredLines.join('\n');
  }

  static async stats(options: { instanceId: string; dbPath?: string }): Promise<void> {
    const storage = new StorageManager(undefined, options.dbPath);
    
    try {
      const result = storage.getLogStats(options.instanceId);
      if (!result.success && 'error' in result) {
        throw result.error;
      }

      const response = {
        success: true,
        instanceId: options.instanceId,
        ...result.data
      };

      OutputFormatter.formatOutput(response);
      
      // Explicit exit after successful execution
      process.exit(0);

    } catch (error) {
      OutputFormatter.formatError(
        error instanceof Error ? error.message : String(error),
        { instanceId: options.instanceId }
      );
      process.exit(1);
    } finally {
      SafeCleanup.closeStorage(storage);
    }
  }

  static async clear(options: { instanceId: string; confirm: boolean; dbPath?: string }): Promise<void> {
    if (!options.confirm) {
      OutputFormatter.formatError('--confirm flag required to clear logs');
      process.exit(1);
    }

    const storage = new StorageManager(undefined, options.dbPath);
    
    try {
      const result = storage.clearLogs(options.instanceId);
      if (!result.success && 'error' in result) {
        throw result.error;
      }

      const response = {
        success: true,
        message: `Cleared ${result.data.clearedCount} logs for instance ${options.instanceId}`,
        clearedCount: result.data.clearedCount
      };

      OutputFormatter.formatOutput(response);
      
      // Explicit exit after successful execution
      process.exit(0);

    } catch (error) {
      OutputFormatter.formatError(
        error instanceof Error ? error.message : String(error),
        { instanceId: options.instanceId }
      );
      process.exit(1);
    } finally {
      SafeCleanup.closeStorage(storage);
    }
  }
}

function showHelp() {
  console.log(`
Unified Process Monitoring CLI - Comprehensive management for containerized processes

Usage: bun run cli-tools.ts <command> [subcommand] [options]

COMMANDS:

  process                    Process lifecycle management
    start                    Start process monitoring
    stop                     Stop process monitoring  
    status                   Get process status
    
  errors                     Error management
    list                     List runtime errors (optional reset)
    stats                    Get error statistics
    clear                    Clear stored errors
    
  logs                       Log management
    list                     List process logs
    get                      Get process logs with optional reset
    stats                    Get log statistics  
    clear                    Clear stored logs

PROCESS COMMANDS:

  # Start monitoring a development server
  bun run cli-tools.ts process start --instance-id my-app --port 8080 -- bun run dev
  
  # Start with custom restart policy  
  bun run cli-tools.ts process start -i my-app --max-restarts 5 --restart-delay 2000 -- npm start
  
  # Stop monitoring
  bun run cli-tools.ts process stop --instance-id my-app
  
  # Get process status
  bun run cli-tools.ts process status --instance-id my-app

ERROR COMMANDS:

  # List recent errors
  bun run cli-tools.ts errors list --instance-id my-app --limit 50

  # List errors and clear them after retrieval
  bun run cli-tools.ts errors list --instance-id my-app --reset
  
  # Filter by log level (50=error, 60=fatal)
  bun run cli-tools.ts errors list -i my-app --min-level 50 --max-level 60
  
  # Get error statistics
  bun run cli-tools.ts errors stats --instance-id my-app
  
  # Clear all errors
  bun run cli-tools.ts errors clear --instance-id my-app --confirm

LOG COMMANDS:

  # List recent logs
  bun run cli-tools.ts logs list --instance-id my-app --limit 100
  
  # Filter by log level and stream
  bun run cli-tools.ts logs list -i my-app --levels error,warn --streams stderr
  
  # Get all process logs (for SandboxSdkClient)
  bun run cli-tools.ts logs get --instance-id my-app --format raw
  
  # Get all process logs and reset log file
  bun run cli-tools.ts logs get --instance-id my-app --format raw --reset
  
  # Get log statistics
  bun run cli-tools.ts logs stats --instance-id my-app

GLOBAL OPTIONS:

  --instance-id, -i <id>     Instance identifier (required for most commands)
  --format <format>          Output format: json (default), table, raw
  --db-path <path>           Custom database path
  --help, -h                 Show help message

PROCESS START OPTIONS:

  --port, -p <port>          Set PORT environment variable
  --cwd, -c <path>           Working directory (default: current directory)
  --max-restarts <num>       Maximum restart attempts (default: 3)
  --restart-delay <ms>       Delay between restarts in ms (default: 1000)
  --health-check-interval <ms> Health check interval in ms (default: 30000)
  --max-errors <num>         Maximum errors to store (default: 1000)
  --retention-days <days>    Error retention period (default: 7)
  --log-retention-hours <h>  Log retention period in hours (default: 168)

FILTER OPTIONS:

  --levels <levels>          Filter by log levels (comma-separated)
  --streams <streams>        Filter by streams (comma-separated: stdout,stderr)
  --categories <categories>  Filter by error categories (comma-separated)
  --severities <severities>  Filter by error severities (comma-separated)
  --since <date>             Filter since date (ISO format)
  --until <date>             Filter until date (ISO format)
  --limit <number>           Limit number of results (default: 100)
  --offset <number>          Offset for pagination (default: 0)

STATE OPTIONS:

  --reset                    Clear stored data after retrieval where supported

EXAMPLES:

  # Complete workflow: start monitoring, check errors, view logs
  bun run cli-tools.ts process start -i vite-app -- bun run dev
  bun run cli-tools.ts errors list -i vite-app --format table
  bun run cli-tools.ts logs get -i vite-app --format raw
  
  # Monitor production deployment
  bun run cli-tools.ts process start -i prod-api --max-restarts 10 -- node server.js
  
  # Debug specific error patterns
  bun run cli-tools.ts errors list -i my-app --severities fatal,error --since 2024-01-01

Environment Variables:
  INSTANCE_ID               Default instance identifier
  PORT                      Port for the application
  CLI_DATA_DIR              Data directory path (default: ./data)
  CLI_ERROR_DB_PATH         Error database path (default: <CLI_DATA_DIR>/errors.db)
  CLI_LOG_DB_PATH           Log database path (default: <CLI_DATA_DIR>/logs.db)
  
Database Storage:
  Errors: ${getErrorDbPath()} (configurable via CLI_ERROR_DB_PATH)
  Logs:   ${getLogDbPath()} (configurable via CLI_LOG_DB_PATH)
  Data:   ${getDataDirectory()} (configurable via CLI_DATA_DIR)
`);
}

function initializeDataDirectory(): void {
  const fs = require('fs');
  const dataDir = getDataDirectory();
  
  try {
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
      console.log(`Created data directory: ${dataDir}`);
    }
  } catch (error) {
    console.warn(`Failed to create data directory ${dataDir}:`, error);
  }
}

async function main() {
  try {
    // Initialize data directory
    initializeDataDirectory();
    
    const { values: args, positionals } = parseArgs({
      args: process.argv.slice(2),
      options: {
        // Global options
        'instance-id': { type: 'string', short: 'i' },
        'format': { type: 'string' },
        'db-path': { type: 'string' },
        'help': { type: 'boolean', short: 'h' },
        
        // Process options
        'cwd': { type: 'string', short: 'c' },
        'port': { type: 'string', short: 'p' },
        'max-restarts': { type: 'string' },
        'restart-delay': { type: 'string' },
        'health-check-interval': { type: 'string' },
        'max-errors': { type: 'string' },
        'retention-days': { type: 'string' },
        'log-retention-hours': { type: 'string' },
        'force': { type: 'boolean' },
        
        // Filter options
        'levels': { type: 'string' },
        'streams': { type: 'string' },
        'categories': { type: 'string' },
        'severities': { type: 'string' },
        'since': { type: 'string' },
        'until': { type: 'string' },
        'limit': { type: 'string' },
        'offset': { type: 'string' },
        'last-sequence': { type: 'string' },
        'count': { type: 'string' },
        'confirm': { type: 'boolean' },
        'reset': { type: 'boolean' },
        'duration': { type: 'string' },
      },
      allowPositionals: true
    });

    const command = positionals[0];
    const subcommand = positionals[1];

    if (args.help || !command) {
      showHelp();
      process.exit(0);
    }

    // Route to appropriate command handler
    switch (command) {
      case 'process':
        await handleProcessCommand(subcommand, args, positionals.slice(2));
        break;
        
      case 'errors':
        await handleErrorCommand(subcommand, args);
        break;
        
      case 'logs':
        await handleLogCommand(subcommand, args);
        break;
        
      default:
        OutputFormatter.formatError(`Unknown command: ${command}`);
        showHelp();
        process.exit(1);
    }

  } catch (error) {
    OutputFormatter.formatError(`CLI failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    process.exit(1);
  }
}

async function handleProcessCommand(subcommand: string, args: Record<string, unknown>, remainingArgs: string[]) {
  switch (subcommand) {
    case 'start':
      if (remainingArgs.length === 0) {
        OutputFormatter.formatError('No command specified to monitor');
        process.exit(1);
      }

      const instanceId = String(args['instance-id'] || process.env.INSTANCE_ID || `instance-${Date.now()}`);
      validateInstanceId(instanceId);

      await ProcessCommands.start({
        instanceId,
        command: remainingArgs[0],
        args: remainingArgs.slice(1),
        cwd: args.cwd ? String(args.cwd) : undefined,
        port: args.port ? String(args.port) : undefined,
        healthCheckInterval: parseIntArg(args, 'health-check-interval'),
        maxRestarts: parseIntArg(args, 'max-restarts'),
        restartDelay: parseIntArg(args, 'restart-delay'),
        maxErrors: parseIntArg(args, 'max-errors'),
        retentionDays: parseIntArg(args, 'retention-days'),
        logRetentionHours: parseIntArg(args, 'log-retention-hours')
      });
      break;
      
    case 'stop':
      if (!args['instance-id']) {
        OutputFormatter.formatError('--instance-id is required for stop command');
        process.exit(1);
      }
      
      await ProcessCommands.stop({
        instanceId: String(args['instance-id']),
        force: Boolean(args.force)
      });
      break;
      
    case 'status':
      await ProcessCommands.status({
        instanceId: args['instance-id'] ? String(args['instance-id']) : undefined
      });
      break;
      
    default:
      OutputFormatter.formatError(`Unknown process subcommand: ${subcommand}`);
      process.exit(1);
  }
}

async function handleErrorCommand(subcommand: string, args: Record<string, unknown>) {
  switch (subcommand) {
    case 'list':
      if (!args['instance-id']) {
        OutputFormatter.formatError('--instance-id is required for list command');
        process.exit(1);
      }
      validateInstanceId(String(args['instance-id']));

      await ErrorCommands.list({
        instanceId: String(args['instance-id']),
        minLevel: parseIntArg(args, 'min-level'),
        maxLevel: parseIntArg(args, 'max-level'),
        since: args.since ? String(args.since) : undefined,
        until: args.until ? String(args.until) : undefined,
        limit: parseIntArg(args, 'limit'),
        offset: parseIntArg(args, 'offset'),
        format: args.format as 'json' | 'table' | 'raw',
        dbPath: args['db-path'] ? String(args['db-path']) : undefined,
        reset: Boolean(args.reset)
      });
      break;
      
    case 'stats':
      if (!args['instance-id']) {
        OutputFormatter.formatError('--instance-id is required for stats command');
        process.exit(1);
      }
      
      await ErrorCommands.stats({
        instanceId: String(args['instance-id']),
        dbPath: args['db-path'] ? String(args['db-path']) : undefined
      });
      break;
      
    case 'clear':
      if (!args['instance-id']) {
        OutputFormatter.formatError('--instance-id is required for clear command');
        process.exit(1);
      }
      
      await ErrorCommands.clear({
        instanceId: String(args['instance-id']),
        confirm: Boolean(args.confirm),
        dbPath: args['db-path'] ? String(args['db-path']) : undefined
      });
      break;
      
    default:
      OutputFormatter.formatError(`Unknown error subcommand: ${subcommand}`);
      process.exit(1);
  }
}

async function handleLogCommand(subcommand: string, args: Record<string, unknown>) {
  switch (subcommand) {
    case 'list':
      if (!args['instance-id']) {
        OutputFormatter.formatError('--instance-id is required for list command');
        process.exit(1);
      }
      validateInstanceId(String(args['instance-id']));

      await LogCommands.list({
        instanceId: String(args['instance-id']),
        levels: args.levels ? String(args.levels).split(',') as LogLevel[] : undefined,
        streams: args.streams ? String(args.streams).split(',') as ('stdout' | 'stderr')[] : undefined,
        since: args.since ? String(args.since) : undefined,
        until: args.until ? String(args.until) : undefined,
        limit: parseIntArg(args, 'limit'),
        offset: parseIntArg(args, 'offset'),
        format: args.format as 'json' | 'table' | 'raw',
        dbPath: args['db-path'] ? String(args['db-path']) : undefined
      });
      break;

    case 'get':
      if (!args['instance-id']) {
        OutputFormatter.formatError('--instance-id is required for get command');
        process.exit(1);
      }
      validateInstanceId(String(args['instance-id']));

      await LogCommands.get({
        instanceId: String(args['instance-id']),
        format: args.format as 'json' | 'raw',
        reset: Boolean(args.reset),
        durationSeconds: parseIntArg(args, 'duration')
      });
      break;
      
    case 'stats':
      if (!args['instance-id']) {
        OutputFormatter.formatError('--instance-id is required for stats command');
        process.exit(1);
      }
      
      await LogCommands.stats({
        instanceId: String(args['instance-id']),
        dbPath: args['db-path'] ? String(args['db-path']) : undefined
      });
      break;
      
    case 'clear':
      if (!args['instance-id']) {
        OutputFormatter.formatError('--instance-id is required for clear command');
        process.exit(1);
      }
      
      await LogCommands.clear({
        instanceId: String(args['instance-id']),
        confirm: Boolean(args.confirm),
        dbPath: args['db-path'] ? String(args['db-path']) : undefined
      });
      break;
      
    default:
      OutputFormatter.formatError(`Unknown log subcommand: ${subcommand}`);
      process.exit(1);
  }
}

// Run CLI if this file is executed directly
if (process.argv[1] && process.argv[1].endsWith('cli-tools.ts')) {
  main().catch(error => {
    OutputFormatter.formatError(`Unhandled error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    process.exit(1);
  });
}

export { ProcessCommands, ErrorCommands, LogCommands, OutputFormatter };
