import { EventEmitter } from 'events';
import { spawn, ChildProcess } from 'child_process';
import { StorageManager } from './storage.js';
import { promises as fs } from 'fs';
import { join } from 'path';
import { StringDecoder } from 'string_decoder';
import { randomUUID } from 'crypto';
import {
  ProcessInfo,
  ProcessState,
  MonitoringOptions,
  MonitoringEvent,
  LogLine,
  Result,
  SimpleError,
  getDataDirectory,
  DEFAULT_MONITORING_OPTIONS
} from './types.js';

// Type for merged options (all required except expectedPort which is optional)
type ResolvedMonitoringOptions = Omit<Required<MonitoringOptions>, 'expectedPort'> & { expectedPort?: number };

/**
 * Simple mutex for preventing concurrent file operations.
 * Uses a promise queue to ensure only one operation runs at a time.
 */
class SimpleMutex {
  private locked = false;
  private queue: Array<() => void> = [];

  async acquire(): Promise<void> {
    return new Promise((resolve) => {
      if (!this.locked) {
        this.locked = true;
        resolve();
      } else {
        this.queue.push(resolve);
      }
    });
  }

  release(): void {
    const next = this.queue.shift();
    if (next) {
      next();
    } else {
      this.locked = false;
    }
  }

  async tryAcquire(): Promise<boolean> {
    if (!this.locked) {
      this.locked = true;
      return true;
    }
    return false;
  }
}

/**
 * Circular buffer for O(1) push operations with fixed capacity.
 * Replaces array + shift() pattern which is O(n).
 */
class CircularBuffer<T> {
  private buffer: (T | undefined)[];
  private head = 0;
  private tail = 0;
  private size = 0;

  constructor(private capacity: number) {
    this.buffer = new Array(capacity);
  }

  push(item: T): void {
    this.buffer[this.tail] = item;
    this.tail = (this.tail + 1) % this.capacity;
    if (this.size < this.capacity) {
      this.size++;
    } else {
      this.head = (this.head + 1) % this.capacity;
    }
  }

  toArray(): T[] {
    const result: T[] = [];
    for (let i = 0; i < this.size; i++) {
      result.push(this.buffer[(this.head + i) % this.capacity] as T);
    }
    return result;
  }

  slice(start?: number): T[] {
    const arr = this.toArray();
    return start !== undefined ? arr.slice(start) : arr;
  }

  clear(): void {
    this.head = this.tail = this.size = 0;
    this.buffer = new Array(this.capacity);
  }

  get length(): number {
    return this.size;
  }
}
/**
 * File-based locking for cross-process coordination.
 * Both SimpleLogManager and CLI commands use this for mutual exclusion.
 */
class FileLock {
  private lockFilePath: string;
  private acquired = false;
  private static readonly MAX_RETRIES = 10;
  private static readonly RETRY_DELAY_MS = 50;
  private static readonly LOCK_STALE_MS = 30000; // 30 seconds

  constructor(filePath: string) {
    this.lockFilePath = `${filePath}.lock`;
  }

  async acquire(): Promise<boolean> {
    for (let attempt = 0; attempt < FileLock.MAX_RETRIES; attempt++) {
      try {
        // Try to create lock file exclusively
        await fs.writeFile(this.lockFilePath, `${process.pid}:${Date.now()}`, { flag: 'wx' });
        this.acquired = true;
        return true;
      } catch (error: unknown) {
        const fsError = error as { code?: string };
        if (fsError?.code === 'EEXIST') {
          // Lock exists - check if stale
          try {
            const content = await fs.readFile(this.lockFilePath, 'utf8');
            const [, timestamp] = content.split(':');
            const lockTime = parseInt(timestamp, 10);
            if (Date.now() - lockTime > FileLock.LOCK_STALE_MS) {
              // Stale lock - remove and retry
              await fs.unlink(this.lockFilePath).catch(() => {});
              continue;
            }
          } catch {
            // Can't read lock file - try again
          }
          // Wait and retry
          await new Promise(resolve => setTimeout(resolve, FileLock.RETRY_DELAY_MS + Math.random() * FileLock.RETRY_DELAY_MS));
        } else {
          throw error;
        }
      }
    }
    return false;
  }

  async release(): Promise<void> {
    if (!this.acquired) return;
    try {
      await fs.unlink(this.lockFilePath);
    } catch {
      // Ignore - lock file may already be gone
    }
    this.acquired = false;
  }
}

class SimpleLogManager {
  private logFilePath: string;
  private maxLines: number;
  private maxFileSize: number; // in bytes
  private appendCount = 0;
  private static readonly CHECK_INTERVAL = 100; // Check file size every 100 appends
  private static readonly FILE_SIZE_CHECK_THRESHOLD = 50000; // bytes
  private readonly trimMutex = new SimpleMutex();

  constructor(instanceId: string, maxLines: number = 1000, maxFileSize: number = 1024 * 1024) { // 1MB default
    this.logFilePath = join(getDataDirectory(), `${instanceId}-process.log`);
    this.maxLines = maxLines;
    this.maxFileSize = maxFileSize;
  }

  async appendLog(content: string, stream: 'stdout' | 'stderr' | 'monitor'): Promise<void> {
    try {
      const timestamp = new Date().toISOString();
      const logLine = `[${timestamp}] [${stream}] ${content}\n`;

      await fs.appendFile(this.logFilePath, logLine, 'utf8');

      // Only check file size periodically to reduce I/O overhead
      // Note: appendCount increment is not atomic, but that's acceptable for
      // periodic trimming - worst case we trim slightly more/less often
      const currentCount = ++this.appendCount;
      if (currentCount % SimpleLogManager.CHECK_INTERVAL === 0) {
        // Fire and forget - don't await to avoid blocking appends
        this.trimLogIfNeeded().catch((err) => {
          console.warn('Background trim failed:', err);
        });
      }
    } catch (error) {
      console.warn('Failed to append to log file:', error);
    }
  }

  /**
   * Append a monitor-internal log entry.
   * These are distinguished from child process output by the [monitor] stream tag.
   */
  async appendMonitorLog(message: string): Promise<void> {
    return this.appendLog(`[MONITOR] ${message}`, 'monitor');
  }

  async getAllLogsAndReset(): Promise<string> {
    const fileLock = new FileLock(this.logFilePath);
    const lockAcquired = await fileLock.acquire();

    if (!lockAcquired) {
      console.warn('Could not acquire file lock for log reset');
      return '';
    }

    try {
      // Use UUID + PID + timestamp for guaranteed unique temp file
      const tempPath = `${this.logFilePath}.tmp.${randomUUID()}.${process.pid}`;

      try {
        await fs.rename(this.logFilePath, tempPath);
      } catch (error: unknown) {
        const fsError = error as { code?: string };
        if (fsError?.code === 'ENOENT') {
          return '';
        }
        throw error;
      }

      // Create new empty log file
      // Use 'wx' flag to fail if file exists (created by concurrent append)
      try {
        await fs.writeFile(this.logFilePath, '', { flag: 'wx' });
      } catch {
        // File was created by concurrent append between rename and writeFile
        // That's fine - the new file already has fresh data
      }

      try {
        const logs = await fs.readFile(tempPath, 'utf8');
        await fs.unlink(tempPath).catch(() => {});
        return logs;
      } catch (error) {
        // Attempt cleanup of temp file even if read failed
        await fs.unlink(tempPath).catch(() => {});
        console.warn('Failed to read temp log file:', error);
        return '';
      }
    } catch (error) {
      console.warn('Failed to read/reset log file:', error);
      return '';
    } finally {
      await fileLock.release();
    }
  }

  private async trimLogIfNeeded(): Promise<void> {
    // Only allow one trim operation at a time
    if (!await this.trimMutex.tryAcquire()) {
      return; // Another trim in progress, skip
    }

    try {
      const stats = await fs.stat(this.logFilePath).catch(() => null);
      if (!stats) return;

      if (stats.size > this.maxFileSize) {
        await this.trimLogFile();
        return;
      }

      if (stats.size > SimpleLogManager.FILE_SIZE_CHECK_THRESHOLD) {
        const content = await fs.readFile(this.logFilePath, 'utf8');
        const lines = content.split('\n');

        if (lines.length > this.maxLines) {
          await this.trimLogFile();
        }
      }
    } catch (error) {
      console.warn('Failed to check/trim log file:', error);
    } finally {
      this.trimMutex.release();
    }
  }

  private async trimLogFile(): Promise<void> {
    const tempPath = `${this.logFilePath}.trim.${randomUUID()}`;

    try {
      const content = await fs.readFile(this.logFilePath, 'utf8');
      const lines = content.split('\n');

      const keepLines = Math.floor(this.maxLines * 0.7);
      const trimmedContent = lines.slice(-keepLines).join('\n');

      // Write to temp file first, then atomic rename
      await fs.writeFile(tempPath, trimmedContent, 'utf8');
      await fs.rename(tempPath, this.logFilePath);
    } catch (error) {
      console.warn('Failed to trim log file:', error);
      // Clean up temp file if it exists
      await fs.unlink(tempPath).catch(() => {});
    }
  }

  async cleanup(): Promise<void> {
    const fileLock = new FileLock(this.logFilePath);
    const lockAcquired = await fileLock.acquire();

    try {
      await fs.unlink(this.logFilePath).catch(() => {});
    } catch (error) {
      console.warn('Failed to cleanup log file:', error);
    } finally {
      if (lockAcquired) {
        await fileLock.release();
      }
    }
  }
}

export class ProcessMonitor extends EventEmitter {
  private processInfo: ProcessInfo;
  private childProcess?: ChildProcess;
  private options: ResolvedMonitoringOptions;
  private storage: StorageManager;
  private simpleLogManager: SimpleLogManager;
  private state: ProcessState = 'stopped';
  private restartCount = 0;
  private restartTimer?: NodeJS.Timeout;
  private healthCheckTimer?: NodeJS.Timeout;
  private lastActivity = new Date();
  private logBuffer!: CircularBuffer<LogLine>;

  // Stream buffering for incomplete lines (Fix H1)
  private stdoutBuffer = '';
  private stderrBuffer = '';
  private stdoutDecoder = new StringDecoder('utf8');
  private stderrDecoder = new StringDecoder('utf8');

  // Stability tracking for restart counter reset (Fix C7)
  private lastSuccessfulStart?: Date;
  private static readonly STABILITY_THRESHOLD_MS = 5 * 60 * 1000; // 5 minutes of stable run resets counter
  private static readonly INACTIVITY_THRESHOLD_MS = 30000; // 30 seconds of inactivity suggests process died
  private static readonly PORT_PROBE_TIMEOUT_MS = 2000;
  private static readonly PORT_FAILURE_THRESHOLD = 2;
  private static readonly PORT_STARTUP_GRACE_MS = 60000;

  // Port health check tracking
  private portBindConfirmed = false;
  private portFailureCount = 0;
  private healthRestartInProgress = false;
  private lastPortCheckTime?: Date;

  constructor(
    processInfo: ProcessInfo,
    storage: StorageManager,
    options: MonitoringOptions = {}
  ) {
    super();

    // Validate required fields (Fix M5)
    if (!processInfo.command?.trim()) {
      throw new Error('ProcessInfo.command is required');
    }
    if (!processInfo.instanceId?.trim()) {
      throw new Error('ProcessInfo.instanceId is required');
    }

    this.processInfo = { ...processInfo };
    this.options = { ...DEFAULT_MONITORING_OPTIONS, ...options } as ResolvedMonitoringOptions;
    this.storage = storage;
    this.simpleLogManager = new SimpleLogManager(this.processInfo.instanceId);
    this.logBuffer = new CircularBuffer<LogLine>(this.options.errorBufferSize);

    // Note: Health monitoring starts when process starts (Fix H2)
  }

  public async start(): Promise<Result<ProcessInfo>> {
    try {
      // Fix H5: Check for transition states, not just running
      if (this.state !== 'stopped' && this.state !== 'crashed') {
        return {
          success: false,
          error: new Error(`Cannot start: process is in '${this.state}' state`)
        };
      }

      this.setState('starting');

      // Log monitor event: Process creation attempt
      const fullCommand = `${this.processInfo.command} ${this.processInfo.args?.join(' ') || ''}`.trim();
      await this.simpleLogManager.appendMonitorLog(
        `Starting process: command="${fullCommand}", cwd="${this.processInfo.cwd}", instanceId="${this.processInfo.instanceId}", restartCount=${this.restartCount}`
      ).catch(() => {});

      // Fix H3: Clear buffers on restart
      this.logBuffer.clear();
      this.stdoutBuffer = '';
      this.stderrBuffer = '';
      this.stdoutDecoder = new StringDecoder('utf8');
      this.stderrDecoder = new StringDecoder('utf8');

      // Reset port confirmation on new start
      this.portBindConfirmed = false;
      this.portFailureCount = 0;
      this.healthRestartInProgress = false;
      this.lastPortCheckTime = undefined;

      // Fix C7: Reset restart count if previous run was stable
      if (this.lastSuccessfulStart && this.processInfo.endTime) {
        const runDuration = this.processInfo.endTime.getTime() - this.lastSuccessfulStart.getTime();
        if (runDuration > ProcessMonitor.STABILITY_THRESHOLD_MS) {
          console.log(`Previous run was stable (${Math.round(runDuration / 1000)}s), resetting restart count`);
          await this.simpleLogManager.appendMonitorLog(
            `Previous run was stable (${Math.round(runDuration / 1000)}s), resetting restart counter from ${this.restartCount} to 0`
          ).catch(() => {});
          this.restartCount = 0;
        }
      }

      this.childProcess = spawn(this.processInfo.command, this.processInfo.args || [], {
        cwd: this.processInfo.cwd,
        env: { ...process.env, ...this.options.env },
        stdio: ['pipe', 'pipe', 'pipe'],
        // Run in its own process group so stop/restart kills the full subtree.
        detached: true,
        shell: false // Don't use shell to avoid escaping issues
      });

      if (!this.childProcess.pid) {
        await this.simpleLogManager.appendMonitorLog(`Process spawn failed: no PID assigned`).catch(() => {});
        throw new Error('Failed to start process - no PID assigned');
      }

      // Update process info
      this.processInfo = {
        ...this.processInfo,
        pid: this.childProcess.pid,
        startTime: new Date(),
        endTime: undefined,
        exitCode: undefined,
        status: 'running'
      };

      // Fix C2: Clean up old listeners before setting up new ones
      this.cleanupChildProcessListeners();

      this.setupProcessMonitoring();
      this.setupStreamMonitoring();

      // Fix H2: Start health monitoring when process starts
      this.startHealthMonitoring();

      this.setState('running');
      this.lastActivity = new Date();
      this.lastSuccessfulStart = new Date();

      // Log monitor event: Process started successfully
      const portInfo = this.options.expectedPort ? `, expectedPort=${this.options.expectedPort}` : '';
      await this.simpleLogManager.appendMonitorLog(
        `Process started successfully: PID=${this.processInfo.pid}${portInfo}`
      ).catch(() => {});

      this.emit('process_started', {
        type: 'process_started',
        processId: this.processInfo.id,
        instanceId: this.processInfo.instanceId,
        pid: this.processInfo.pid,
        timestamp: new Date()
      } as MonitoringEvent);

      console.log(`Process started: ${this.processInfo.command}`);

      return {
        success: true,
        data: this.processInfo
      };
    } catch (error) {
      this.setState('stopped');
      const errorMessage = error instanceof Error ? error.message : 'Failed to start process';
      console.error(`Failed to start process: ${errorMessage}`);

      // Log monitor event: Process start failed
      await this.simpleLogManager.appendMonitorLog(
        `Process start failed: ${errorMessage}`
      ).catch(() => {});

      return {
        success: false,
        error: new Error(errorMessage)
      };
    }
  }

  /**
   * Fix C2: Remove all event listeners from child process to prevent accumulation
   */
  private cleanupChildProcessListeners(): void {
    if (!this.childProcess) return;

    this.childProcess.removeAllListeners('exit');
    this.childProcess.removeAllListeners('error');
    this.childProcess.removeAllListeners('spawn');
    this.childProcess.stdout?.removeAllListeners('data');
    this.childProcess.stderr?.removeAllListeners('data');
  }

  public async stop(): Promise<Result<void>> {
    try {
      if (this.state === 'stopped') {
        return { success: true, data: undefined };
      }

      // Fix H5: Prevent stop during start
      if (this.state === 'starting') {
        return {
          success: false,
          error: new Error('Cannot stop: process is still starting')
        };
      }

      // Log monitor event: Stop requested
      await this.simpleLogManager.appendMonitorLog(
        `Stop requested: PID=${this.processInfo.pid}, state=${this.state}`
      ).catch(() => {});

      this.setState('stopping');

      // Clear restart timer if pending
      if (this.restartTimer) {
        clearTimeout(this.restartTimer);
        this.restartTimer = undefined;
        await this.simpleLogManager.appendMonitorLog(`Cancelled pending restart`).catch(() => {});
      }

      // Fix H2: Clear health timer on stop
      if (this.healthCheckTimer) {
        clearInterval(this.healthCheckTimer);
        this.healthCheckTimer = undefined;
      }

      // Flush any remaining stream buffers
      this.flushStreamBuffers();

      if (this.childProcess) {
        await this.killProcess(false);
      }

      // Fix C6: Do NOT emit process_stopped here - the exit handler will emit it
      // This prevents double emission when killing a running process
      // If the process was already dead, killProcess returns immediately and
      // the exit handler has already fired

      // Only set state if exit handler didn't already do it
      if (this.state === 'stopping') {
        this.setState('stopped');

        // Log monitor event: Process stopped successfully
        await this.simpleLogManager.appendMonitorLog(
          `Process stopped gracefully`
        ).catch(() => {});

        // Emit event only if we're the ones transitioning to stopped
        // (process was already dead before we called killProcess)
        this.emit('process_stopped', {
          type: 'process_stopped',
          processId: this.processInfo.id,
          instanceId: this.processInfo.instanceId,
          timestamp: new Date()
        } as MonitoringEvent);
      }

      console.log(`Process stopped: ${this.processInfo.command}`);

      return { success: true, data: undefined };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to stop process';
      console.error(`Failed to stop process: ${errorMessage}`);

      // Log monitor event: Stop failed
      await this.simpleLogManager.appendMonitorLog(
        `Stop failed: ${errorMessage}`
      ).catch(() => {});

      return {
        success: false,
        error: new Error(errorMessage)
      };
    }
  }

  /**
   * Flush any incomplete lines remaining in stream buffers
   */
  private flushStreamBuffers(): void {
    if (this.stdoutBuffer.trim()) {
      this.simpleLogManager.appendLog(this.stdoutBuffer.trim(), 'stdout').catch(() => {});
      const logLine: LogLine = {
        content: this.stdoutBuffer.trim(),
        timestamp: new Date(),
        stream: 'stdout',
        processId: this.processInfo.id
      };
      this.logBuffer.push(logLine);
    }

    if (this.stderrBuffer.trim()) {
      this.simpleLogManager.appendLog(this.stderrBuffer.trim(), 'stderr').catch(() => {});
      const logLine: LogLine = {
        content: this.stderrBuffer.trim(),
        timestamp: new Date(),
        stream: 'stderr',
        processId: this.processInfo.id
      };
      this.logBuffer.push(logLine);
    }

    this.stdoutBuffer = '';
    this.stderrBuffer = '';
  }

  private setupProcessMonitoring(): void {
    if (!this.childProcess) return;

    this.childProcess.on('exit', (code, signal) => {
      // Capture state BEFORE any transitions
      const wasRunning = this.state === 'running';
      const wasStopping = this.state === 'stopping';
      const runDuration = this.processInfo.startTime
        ? Math.round((Date.now() - this.processInfo.startTime.getTime()) / 1000)
        : 0;

      // Update process info
      this.processInfo = {
        ...this.processInfo,
        exitCode: code ?? undefined,
        endTime: new Date()
      };

      // Log monitor event: Process exited
      this.simpleLogManager.appendMonitorLog(
        `Process exited: code=${code}, signal=${signal ?? 'none'}, runtime=${runDuration}s, wasRunning=${wasRunning}, wasStopping=${wasStopping}`
      ).catch(() => {});

      // Fix C3: Determine final state BEFORE transitioning (no stopped -> crashed)
      const shouldRestart = wasRunning && this.options.autoRestart &&
        this.shouldRestartAfterExit(code, signal, wasStopping);
      const isUnexpectedCrash = wasRunning && (code !== 0 || shouldRestart);

      // Single state transition - either crashed or stopped, never both
      if (isUnexpectedCrash) {
        console.log(`Process exited unexpectedly: code=${code}, signal=${signal}`);

        // Log monitor event: Process crashed
        this.simpleLogManager.appendMonitorLog(
          `Process crashed: exitCode=${code}, signal=${signal ?? 'none'}, willRestart=${shouldRestart}, restartCount=${this.restartCount}/${this.options.maxRestarts}`
        ).catch(() => {});

        this.setState('crashed');

        this.emit('process_crashed', {
          type: 'process_crashed',
          processId: this.processInfo.id,
          instanceId: this.processInfo.instanceId,
          exitCode: code,
          signal: signal,
          willRestart: shouldRestart,
          timestamp: new Date()
        } as MonitoringEvent);

        if (shouldRestart) {
          this.scheduleRestart();
        } else {
          // Log monitor event: Max restarts reached
          this.simpleLogManager.appendMonitorLog(
            `Process will not restart: maxRestarts (${this.options.maxRestarts}) reached`
          ).catch(() => {});
        }
      } else {
        // Clean exit or intentional stop - only emit if not already stopped
        // (stop() method may have already set state and emitted)
        if (this.state !== 'stopped') {
          // Log monitor event: Clean exit
          this.simpleLogManager.appendMonitorLog(
            `Process exited cleanly: exitCode=${code}, runtime=${runDuration}s`
          ).catch(() => {});

          this.setState('stopped');
          this.emit('process_stopped', {
            type: 'process_stopped',
            processId: this.processInfo.id,
            instanceId: this.processInfo.instanceId,
            exitCode: code,
            reason: signal ? `Signal: ${signal}` : `Exit code: ${code}`,
            timestamp: new Date()
          } as MonitoringEvent);
        }
      }
    });

    this.childProcess.on('error', (error) => {
      console.error(`Process ${this.processInfo.id} error:`, error);

      this.processInfo = {
        ...this.processInfo,
        lastError: error.message
      };

      // Log monitor event: Process error
      this.simpleLogManager.appendMonitorLog(
        `Process spawn/runtime error: ${error.message}`
      ).catch(() => {});

      // Only transition if we're still in a running-ish state
      // (error event usually precedes exit event)
      if (this.state === 'running' || this.state === 'starting') {
        this.setState('crashed');
      }

      this.simpleLogManager.appendLog(`Process error: ${error.message}`, 'stderr').catch(() => {});

      const simpleError: SimpleError = {
        timestamp: new Date().toISOString(),
        level: 60, // fatal
        message: `Process error: ${error.message}`,
        rawOutput: error.stack || error.message
      };

      this.storage.storeError(
        this.processInfo.instanceId,
        this.processInfo.id,
        simpleError
      );
    });
  }

  private setupStreamMonitoring(): void {
    if (!this.childProcess) return;

    this.childProcess.stdout?.on('data', (data: Buffer) => {
      this.processStreamData(data, 'stdout');
    });

    this.childProcess.stderr?.on('data', (data: Buffer) => {
      this.processStreamData(data, 'stderr');
    });
  }

  /**
   * Fix H1: Process stream data with proper line buffering
   * Handles incomplete lines that span multiple data chunks and
   * multi-byte UTF-8 characters that might be split across chunks
   */
  private processStreamData(data: Buffer, stream: 'stdout' | 'stderr'): void {
    // Use StringDecoder to properly handle multi-byte UTF-8 characters
    const decoder = stream === 'stdout' ? this.stdoutDecoder : this.stderrDecoder;
    const bufferKey = stream === 'stdout' ? 'stdoutBuffer' : 'stderrBuffer';

    // Decode buffer (handles partial UTF-8 sequences correctly)
    const decoded = decoder.write(data);

    // Combine with any incomplete line from previous chunk
    const content = this[bufferKey] + decoded;
    const lines = content.split('\n');

    this.lastActivity = new Date();

    // The last element might be incomplete - save for next chunk
    this[bufferKey] = lines.pop() || '';

    // Process complete lines
    for (const line of lines) {
      const trimmedLine = line.trim();
      if (!trimmedLine) continue;

      this.simpleLogManager.appendLog(trimmedLine, stream).catch(() => {});

      const logLine: LogLine = {
        content: trimmedLine,
        timestamp: new Date(),
        stream,
        processId: this.processInfo.id
      };
      // CircularBuffer automatically handles capacity - O(1) push
      this.logBuffer.push(logLine);

      this.parseJsonLog(trimmedLine);
    }
  }

  private parseJsonLog(line: string): void {
    try {
      if (!line.startsWith('{')) return;

      const logData = JSON.parse(line);

      if (logData.level && logData.level >= 50) {
        const message = logData.msg || 'Unknown error';

        const simpleError: SimpleError = {
          timestamp: logData.time ? new Date(logData.time).toISOString() : new Date().toISOString(),
          level: logData.level,
          message: message,
          rawOutput: line
        };

        const storeResult = this.storage.storeError(
          this.processInfo.instanceId,
          this.processInfo.id,
          simpleError
        );

        if (storeResult.success) {
          console.log(`Error detected (level ${logData.level}): ${message.substring(0, 100)}...`);

          // Emit error event
          this.emit('error_detected', {
            type: 'error_detected',
            processId: this.processInfo.id,
            instanceId: this.processInfo.instanceId,
            error: simpleError,
            timestamp: new Date()
          } as MonitoringEvent);

          if (this.isFatalError(message, logData.level)) {
            this.handleFatalError(simpleError);
          }
        }
      }
    } catch (e) {
      // Non-JSON lines are common (plain text logs from Vite, etc.)
      // Only log if line looked like JSON but failed to parse
      if (line.startsWith('{') && line.endsWith('}')) {
        console.debug(`Failed to parse JSON log line: ${line.substring(0, 100)}...`);
      }
    }
  }

  private isFatalError(message: string, level: number): boolean {
    if (level >= 60) return true;

    const fatalPatterns = [
      /fatal error/i,
      /out of memory/i,
      /maximum call stack/i,
      /segmentation fault/i,
      /EADDRINUSE/i,
      /cannot find module/i,
      /module not found/i,
      /failed to compile/i
    ];

    return fatalPatterns.some(pattern => pattern.test(message));
  }

  /**
   * Fix H4: Only kill process if we're in running state
   * Prevents interference with graceful shutdown
   */
  private handleFatalError(error: SimpleError): void {
    console.error(`Fatal error detected: ${error.message}`);

    // Don't interfere if we're already stopping or stopped
    if (this.state !== 'running') {
      console.log('Ignoring fatal error - process is not in running state');
      return;
    }

    if (this.childProcess && !this.childProcess.killed) {
      console.log('Killing process due to fatal error...');
      this.childProcess.kill('SIGTERM');
    }
  }

  private shouldRestartAfterExit(exitCode: number | null, signal: NodeJS.Signals | null, wasStopping: boolean): boolean {
    if (wasStopping) {
      console.log('Process was explicitly stopped, not restarting');
      return false;
    }
    
    if (this.restartCount >= this.options.maxRestarts) {
      console.error(`Max restart attempts (${this.options.maxRestarts}) reached`);
      return false;
    }

    if (signal) {
      console.log(`Process killed by signal ${signal}, will restart`);
      return true;
    }

    if (exitCode === 0) {
      const timeSinceLastActivity = Date.now() - this.lastActivity.getTime();

      if (timeSinceLastActivity > ProcessMonitor.INACTIVITY_THRESHOLD_MS) {
        console.log(`Process exited with code 0 but was unresponsive for ${Math.round(timeSinceLastActivity/1000)}s, assuming killed, will restart`);
        return true;
      }

      console.log('Process exited cleanly with code 0, not restarting');
      return false;
    }

    if (exitCode !== 0) {
      console.log(`Process exited with code ${exitCode}, will restart`);
      return true;
    }

    return false;
  }

  /**
   * Fix H6: Prevent timer overwrite race condition
   */
  private scheduleRestart(): void {
    // Clear any existing restart timer to prevent duplicates
    if (this.restartTimer) {
      clearTimeout(this.restartTimer);
      this.restartTimer = undefined;
    }

    this.restartCount++;

    console.log(`Scheduling restart ${this.restartCount}/${this.options.maxRestarts} in ${this.options.restartDelay}ms...`);

    // Log monitor event: Scheduling restart
    this.simpleLogManager.appendMonitorLog(
      `Scheduling restart: attempt=${this.restartCount}/${this.options.maxRestarts}, delay=${this.options.restartDelay}ms`
    ).catch(() => {});

    this.restartTimer = setTimeout(async () => {
      this.restartTimer = undefined;

      // Check if stop() was called during the delay
      if (this.state === 'stopped' || this.state === 'stopping') {
        console.log('Restart cancelled - process was stopped during delay');
        // Log monitor event: Restart cancelled
        this.simpleLogManager.appendMonitorLog(
          `Restart cancelled: process was stopped during delay`
        ).catch(() => {});
        return;
      }

      console.log(`Restarting process (attempt ${this.restartCount}/${this.options.maxRestarts})...`);

      // Log monitor event: Restarting now
      await this.simpleLogManager.appendMonitorLog(
        `Restarting process now: attempt=${this.restartCount}/${this.options.maxRestarts}`
      ).catch(() => {});

      const result = await this.start();
      if (!result.success && 'error' in result) {
        const errorMessage = result.error.message ?? 'Unknown error';
        console.error(`Failed to restart process: ${errorMessage}`);

        // Log monitor event: Restart failed
        await this.simpleLogManager.appendMonitorLog(
          `Restart failed: attempt=${this.restartCount}, error="${errorMessage}"`
        ).catch(() => {});

        // Emit restart failed event
        this.emit('restart_failed', {
          type: 'restart_failed',
          processId: this.processInfo.id,
          instanceId: this.processInfo.instanceId,
          attempt: this.restartCount,
          error: errorMessage,
          timestamp: new Date()
        } as MonitoringEvent);
      }
    }, this.options.restartDelay);
  }

  /**
   * Fix C1: Prevent deadlock when process already exited
   *
   * The original implementation could deadlock because:
   * 1. Process exits naturally before stop() is called
   * 2. childProcess.killed is false (we didn't kill it)
   * 3. We register exit listener, but event already fired
   * 4. We call kill() on dead process
   * 5. Exit event never fires again - promise never resolves
   *
   * This fix checks process.exitCode/signalCode to detect already-exited processes.
   */
  private async killProcess(force: boolean = false): Promise<void> {
    if (!this.childProcess) {
      return;
    }

    // Check if process already exited (exitCode or signalCode is set)
    if (this.childProcess.exitCode !== null || this.childProcess.signalCode !== null) {
      console.log('Process already exited, no kill needed');
      return;
    }

    return new Promise<void>((resolve) => {
      const killTimeout = this.options.killTimeout || 10000;
      let resolved = false;

      const cleanup = () => {
        if (resolved) return;
        resolved = true;
        clearTimeout(timeout);
        this.childProcess?.removeListener('exit', onExit);
      };

      const onExit = () => {
        cleanup();
        resolve();
      };

      // Register exit listener BEFORE checking state again
      this.childProcess!.once('exit', onExit);

      // Double-check after registering listener (closes race window)
      if (this.childProcess!.exitCode !== null || this.childProcess!.signalCode !== null) {
        cleanup();
        resolve();
        return;
      }

      // Set up timeout for graceful shutdown
      const timeout = setTimeout(() => {
        if (resolved) return;

        // Check if process exited during timeout
        if (this.childProcess && this.childProcess.exitCode === null) {
          console.log('Process did not exit gracefully, force killing...');
          const pid = this.childProcess.pid;

          if (pid) {
            try {
              process.kill(-pid, 'SIGKILL');
            } catch {
              // Process may have exited between check and kill
              console.log('SIGKILL failed - process likely already exited');
            }
          }
        }

        cleanup();
        resolve();
      }, force ? 0 : killTimeout);

      const sendSignal = (signal: NodeJS.Signals): boolean => {
        const pid = this.childProcess?.pid;
        if (!pid) return false;

        try {
          process.kill(-pid, signal);
          return true;
        } catch (error) {
          const code = (error as { code?: string }).code;
          if (code === 'ESRCH') return false;
        }

        try {
          return this.childProcess!.kill(signal);
        } catch {
          return false;
        }
      };

      // Send the kill signal
      const signal: NodeJS.Signals = force ? 'SIGKILL' : 'SIGTERM';
      const signalSent = sendSignal(signal);
      if (!signalSent) {
        console.log(`${signal} signal not sent - process already dead`);
        cleanup();
        resolve();
      }
    });
  }

  /**
   * Fix H2: Start health monitoring only when process starts,
   * prevent duplicate intervals, and clear on stop
   */
  private startHealthMonitoring(): void {
    if (this.options.healthCheckInterval <= 0) return;

    // Clear existing timer to prevent duplicates
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
      this.healthCheckTimer = undefined;
    }

    this.healthCheckTimer = setInterval(() => {
      if (this.state === 'running') {
        this.performHealthCheck().catch(async (error) => {
          const message = error instanceof Error ? error.message : String(error);
          await this.simpleLogManager.appendMonitorLog(`Health check error: ${message}`).catch(() => {});
        });
      }
    }, this.options.healthCheckInterval);
  }

  /**
   * Perform comprehensive health check:
   * 1. Check if PID is still alive
   * 2. Check if expected port is bound
   * 3. Check for inactivity
   */
  private async performHealthCheck(): Promise<void> {
    const now = new Date();
    const timeSinceLastActivity = now.getTime() - this.lastActivity.getTime();
    const healthIssues: string[] = [];

    // 1. Check if PID is alive
    const pidAlive = this.checkPidAlive();
    if (!pidAlive) {
      healthIssues.push('PID not responding');
    }

    // 2. Check port if configured
    if (this.options.expectedPort) {
      const port = this.options.expectedPort;
      const timeSinceStartMs = this.processInfo.startTime ? now.getTime() - this.processInfo.startTime.getTime() : 0;

      const portResult = await this.checkPortResponsive(port);

      if (portResult.responsive) {
        if (!this.portBindConfirmed) {
          this.portBindConfirmed = true;
          await this.simpleLogManager.appendMonitorLog(`Port ${port} is now accepting connections`).catch(() => {});
        }

        if (this.portFailureCount > 0) {
          await this.simpleLogManager.appendMonitorLog(`Port ${port} is responsive again (failures cleared)`).catch(() => {});
        }

        this.portFailureCount = 0;
        this.healthRestartInProgress = false;
      } else {
        const shouldCountFailure = this.portBindConfirmed || timeSinceStartMs >= ProcessMonitor.PORT_STARTUP_GRACE_MS;

        if (shouldCountFailure) {
          this.portFailureCount += 1;

          const errorSuffix = portResult.error ? `, error="${portResult.error}"` : '';

          if (this.portBindConfirmed) {
            healthIssues.push(
              `Port ${port} not responding (failure ${this.portFailureCount}/${ProcessMonitor.PORT_FAILURE_THRESHOLD}${errorSuffix})`
            );
          } else {
            healthIssues.push(
              `Port ${port} not responding after ${Math.round(timeSinceStartMs / 1000)}s (failure ${this.portFailureCount}/${ProcessMonitor.PORT_FAILURE_THRESHOLD}${errorSuffix})`
            );
          }

          if (
            this.portFailureCount >= ProcessMonitor.PORT_FAILURE_THRESHOLD &&
            !this.healthRestartInProgress &&
            this.state === 'running' &&
            this.options.autoRestart
          ) {
            await this.simpleLogManager.appendMonitorLog(
              `Health-triggered restart: port ${port} unresponsive`
            ).catch(() => {});

            this.healthRestartInProgress = true;
            await this.killProcess(false);
          }
        }
      }

      this.lastPortCheckTime = now;
    }

    // 3. Check for inactivity
    if (timeSinceLastActivity > this.options.healthCheckInterval * 2) {
      healthIssues.push(`No output for ${Math.round(timeSinceLastActivity / 1000)}s`);
    }

    // Report health status
    if (healthIssues.length > 0) {
      const issueList = healthIssues.join(', ');
      console.warn(`Health check warning: ${issueList}`);

      await this.simpleLogManager.appendMonitorLog(
        `Health check warning: ${issueList}`
      ).catch(() => {});

      this.emit('health_check_failed', {
        type: 'health_check_failed',
        processId: this.processInfo.id,
        instanceId: this.processInfo.instanceId,
        lastActivity: this.lastActivity,
        timestamp: now
      } as MonitoringEvent);
    }
  }

  /**
   * Check if the process PID is still alive
   */
  private checkPidAlive(): boolean {
    if (!this.processInfo.pid) return false;

    try {
      // Sending signal 0 checks if process exists without actually sending a signal
      process.kill(this.processInfo.pid, 0);
      return true;
    } catch {
      // ESRCH means process doesn't exist, EPERM means it exists but we can't signal it
      return false;
    }
  }

  /**
   * Check if an HTTP server is responsive on the expected port.
   * This catches "hung but still listening" cases (unlike lsof).
   */
  private async checkPortResponsive(port: number): Promise<{ responsive: boolean; error?: string }> {
    const controller = new AbortController();
    const timeoutMs = ProcessMonitor.PORT_PROBE_TIMEOUT_MS;

    const timeout = setTimeout(() => {
      controller.abort();
    }, timeoutMs);

    try {
      const response = await fetch(`http://127.0.0.1:${port}/`, {
        method: 'GET',
        signal: controller.signal,
        headers: {
          // Avoid content negotiation overhead; we only need any response.
          accept: '*/*'
        }
      });

      // We don't need the body; cancel ASAP.
      response.body?.cancel();

      return { responsive: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { responsive: false, error: message };
    } finally {
      clearTimeout(timeout);
    }
  }

  private setState(newState: ProcessState): void {
    const oldState = this.state;
    this.state = newState;
    
    if (oldState !== newState) {
      this.emit('state_changed', {
        type: 'state_changed',
        processId: this.processInfo.id,
        instanceId: this.processInfo.instanceId,
        oldState,
        newState,
        timestamp: new Date()
      } as MonitoringEvent);
    }
  }

  public getState(): ProcessState {
    return this.state;
  }

  public getProcessInfo(): ProcessInfo {
    return { ...this.processInfo };
  }

  public getRecentLogs(limit: number = 50): LogLine[] {
    const logs = this.logBuffer.toArray();
    return logs.slice(-limit);
  }

  public async getAllLogsAndReset(): Promise<string> {
    return await this.simpleLogManager.getAllLogsAndReset();
  }

  public async cleanup(): Promise<void> {
    if (this.restartTimer) {
      clearTimeout(this.restartTimer);
      this.restartTimer = undefined;
    }
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
      this.healthCheckTimer = undefined;
    }

    await this.stop();

    await this.simpleLogManager.cleanup();

    this.removeAllListeners();
  }
}
