import { EventEmitter } from 'events';
import { spawn, ChildProcess } from 'child_process';
import { StorageManager } from './storage.js';
import { promises as fs } from 'fs';
import { join } from 'path';
import { 
  ProcessInfo, 
  ProcessState, 
  MonitoringOptions,
  MonitoringEvent,
  LogLine,
  Result,
  SimpleError,
  getDataDirectory
} from './types.js';
class SimpleLogManager {
  private logFilePath: string;
  private maxLines: number;
  private maxFileSize: number; // in bytes
  private appendCount = 0;
  private static readonly CHECK_INTERVAL = 100; // Check file size every 100 appends

  constructor(instanceId: string, maxLines: number = 1000, maxFileSize: number = 1024 * 1024) { // 1MB default
    this.logFilePath = join(getDataDirectory(), `${instanceId}-process.log`);
    this.maxLines = maxLines;
    this.maxFileSize = maxFileSize;
  }

  async appendLog(content: string, stream: 'stdout' | 'stderr'): Promise<void> {
    try {
      const timestamp = new Date().toISOString();
      const logLine = `[${timestamp}] [${stream}] ${content}\n`;
      
      await fs.appendFile(this.logFilePath, logLine, 'utf8');
      
      // Only check file size periodically to reduce I/O overhead
      if (++this.appendCount % SimpleLogManager.CHECK_INTERVAL === 0) {
        await this.trimLogIfNeeded();
      }
    } catch (error) {
      console.warn('Failed to append to log file:', error);
    }
  }

  async getAllLogsAndReset(): Promise<string> {
    try {
      const tempPath = `${this.logFilePath}.tmp.${Date.now()}`;
      
      try {
        await fs.rename(this.logFilePath, tempPath);
      } catch (error: any) {
          if (error?.code === 'ENOENT') {
          return '';
        }
        throw error;
      }
      
      await fs.writeFile(this.logFilePath, '', 'utf8').catch(() => {});
      
      try {
        const logs = await fs.readFile(tempPath, 'utf8');
        await fs.unlink(tempPath).catch(() => {});
        return logs;
      } catch (error) {
        await fs.unlink(tempPath).catch(() => {});
        return '';
      }
    } catch (error) {
      console.warn('Failed to read/reset log file:', error);
      return '';
    }
  }

  private async trimLogIfNeeded(): Promise<void> {
    try {
      const stats = await fs.stat(this.logFilePath).catch(() => null);
      if (!stats) return;

      if (stats.size > this.maxFileSize) {
        await this.trimLogFile();
        return;
      }

      if (stats.size > 50000) {
        const content = await fs.readFile(this.logFilePath, 'utf8');
        const lines = content.split('\n');
        
        if (lines.length > this.maxLines) {
          await this.trimLogFile();
        }
      }
    } catch (error) {
      console.warn('Failed to check/trim log file:', error);
    }
  }

  private async trimLogFile(): Promise<void> {
    try {
      const content = await fs.readFile(this.logFilePath, 'utf8');
      const lines = content.split('\n');
      
      const keepLines = Math.floor(this.maxLines * 0.7);
      const trimmedContent = lines.slice(-keepLines).join('\n');
      
      await fs.writeFile(this.logFilePath, trimmedContent, 'utf8');
    } catch (error) {
      console.warn('Failed to trim log file:', error);
    }
  }

  async cleanup(): Promise<void> {
    try {
      await fs.unlink(this.logFilePath).catch(() => {});
    } catch (error) {
      console.warn('Failed to cleanup log file:', error);
    }
  }
}

const DEFAULT_MONITORING_OPTIONS: Required<MonitoringOptions> = {
  autoRestart: true,
  maxRestarts: 3,
  restartDelay: 1000,
  healthCheckInterval: 30000,
  errorBufferSize: 100,
  enableMetrics: false,
  env: {},
  killTimeout: 10000
};

export class ProcessMonitor extends EventEmitter {
  private processInfo: ProcessInfo;
  private childProcess?: ChildProcess;
  private options: Required<MonitoringOptions>;
  private storage: StorageManager;
  private simpleLogManager: SimpleLogManager;
  private state: ProcessState = 'stopped';
  private restartCount = 0;
  private restartTimer?: NodeJS.Timeout;
  private healthCheckTimer?: NodeJS.Timeout;
  private lastActivity = new Date();
  private logBuffer: LogLine[] = [];

  constructor(
    processInfo: ProcessInfo,
    storage: StorageManager,
    options: MonitoringOptions = {}
  ) {
    super();
    
    this.processInfo = { ...processInfo };
    this.options = { ...DEFAULT_MONITORING_OPTIONS, ...options } as Required<MonitoringOptions>;
    this.storage = storage;
    this.simpleLogManager = new SimpleLogManager(this.processInfo.instanceId);

    this.startHealthMonitoring();
  }

  public async start(): Promise<Result<ProcessInfo>> {
    try {
      if (this.state === 'running') {
        return { success: false, error: new Error('Process is already running') };
      }

      this.setState('starting');

      this.childProcess = spawn(this.processInfo.command, this.processInfo.args || [], {
        cwd: this.processInfo.cwd,
        env: { ...process.env, ...this.options.env },
        stdio: ['pipe', 'pipe', 'pipe'],
        detached: false,
        shell: false // Don't use shell to avoid escaping issues
      });

      this.processInfo.pid = this.childProcess.pid;
      
      if (!this.childProcess.pid) {
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

      this.setupProcessMonitoring();
      this.setupStreamMonitoring();

      this.setState('running');
      this.lastActivity = new Date();

      await this.simpleLogManager.appendLog(`Process started: ${this.processInfo.command} ${this.processInfo.args?.join(' ') || ''}`, 'stdout').catch(() => {});

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
      
      return { 
        success: false, 
        error: new Error(errorMessage) 
      };
    }
  }

  public async stop(): Promise<Result<void>> {
    try {
      if (this.state === 'stopped') {
        return { success: true, data: undefined };
      }

      this.setState('stopping');

      if (this.restartTimer) {
        clearTimeout(this.restartTimer);
        this.restartTimer = undefined;
      }

      if (this.childProcess && !this.childProcess.killed) {
        await this.killProcess(false);
      }

      this.setState('stopped');

      // Emit stop event
      this.emit('process_stopped', {
        type: 'process_stopped',
        processId: this.processInfo.id,
        instanceId: this.processInfo.instanceId,
        timestamp: new Date()
      } as MonitoringEvent);

      console.log(`Process stopped: ${this.processInfo.command}`);

      return { success: true, data: undefined };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to stop process';
      console.error(`Failed to stop process: ${errorMessage}`);
      
      return { 
        success: false, 
        error: new Error(errorMessage) 
      };
    }
  }

  private setupProcessMonitoring(): void {
    if (!this.childProcess) return;

    this.childProcess.on('exit', (code, signal) => {
      // Update process info
      this.processInfo = {
        ...this.processInfo,
        exitCode: code ?? undefined,
        endTime: new Date()
      };
      
      const wasUnexpected = this.state === 'running';
      const wasStopping = this.state === 'stopping';
      
      this.setState('stopped');

      this.simpleLogManager.appendLog(`Process exited with code ${code}${signal ? ` (signal: ${signal})` : ''}`, 'stdout').catch(() => {});

      // Emit stop event
      this.emit('process_stopped', {
        type: 'process_stopped',
        processId: this.processInfo.id,
        instanceId: this.processInfo.instanceId,
        exitCode: code,
        reason: signal ? `Signal: ${signal}` : `Exit code: ${code}`,
        timestamp: new Date()
      } as MonitoringEvent);

      if (wasUnexpected) {
        console.log(`Process exited unexpectedly: code=${code}, signal=${signal}`);
        
        const shouldRestart = this.options.autoRestart && this.shouldRestartAfterExit(code, signal, wasStopping);
        
        if (code !== 0 || shouldRestart) {
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
          }
        }
      }
    });

    this.childProcess.on('error', (error) => {
      console.error(`Process ${this.processInfo.id} error:`, error);
      
      this.processInfo = {
        ...this.processInfo,
        lastError: error.message
      };
      this.setState('crashed');

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

  private processStreamData(data: Buffer, stream: 'stdout' | 'stderr'): void {
    const content = data.toString('utf8');
    const lines = content.split('\n');

    this.lastActivity = new Date();

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
      this.logBuffer.push(logLine);
      
      if (this.logBuffer.length > this.options.errorBufferSize) {
        this.logBuffer.shift();
      }

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

  private handleFatalError(error: SimpleError): void {
    console.error(`Fatal error detected: ${error.message}`);
    
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
      
      if (timeSinceLastActivity > 30000) { // More than 30 seconds
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

  private scheduleRestart(): void {
    this.restartCount++;
    
    console.log(`Scheduling restart ${this.restartCount}/${this.options.maxRestarts} in ${this.options.restartDelay}ms...`);
    
    this.restartTimer = setTimeout(async () => {
      console.log(`Restarting process (attempt ${this.restartCount}/${this.options.maxRestarts})...`);
      
      const result = await this.start();
      if (!result.success) {
        console.error(`Failed to restart process: ${result.error?.message}`);
        
        // Emit restart failed event
        this.emit('restart_failed', {
          type: 'restart_failed',
          processId: this.processInfo.id,
          instanceId: this.processInfo.instanceId,
          attempt: this.restartCount,
          error: result.error?.message,
          timestamp: new Date()
        } as MonitoringEvent);
      }
    }, this.options.restartDelay);
  }

  private async killProcess(force: boolean = false): Promise<void> {
    if (!this.childProcess || this.childProcess.killed) return;

    return new Promise<void>((resolve) => {
      const killTimeout = this.options.killTimeout || 10000;
      
      if (force) {
        this.childProcess!.kill('SIGKILL');
        resolve();
        return;
      }
      
      const timeout = setTimeout(() => {
        if (this.childProcess && !this.childProcess.killed) {
          console.log('Process did not exit gracefully, force killing...');
          this.childProcess.kill('SIGKILL');
        }
        resolve();
      }, killTimeout);

      this.childProcess!.once('exit', () => {
        clearTimeout(timeout);
        resolve();
      });

      this.childProcess!.kill('SIGTERM');
    });
  }

  private startHealthMonitoring(): void {
    if (this.options.healthCheckInterval <= 0) return;

    this.healthCheckTimer = setInterval(() => {
      if (this.state === 'running') {
        const now = new Date();
        const timeSinceLastActivity = now.getTime() - this.lastActivity.getTime();
        
        if (timeSinceLastActivity > this.options.healthCheckInterval * 2) {
          console.warn(`Process appears unresponsive (no activity for ${timeSinceLastActivity}ms)`);
          
          this.emit('health_check_failed', {
            type: 'health_check_failed',
            processId: this.processInfo.id,
            instanceId: this.processInfo.instanceId,
            lastActivity: this.lastActivity,
            timestamp: now
          } as MonitoringEvent);
        }
      }
    }, this.options.healthCheckInterval);
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
    return this.logBuffer.slice(-limit);
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
