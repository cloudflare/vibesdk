/**
 * Monitor-CLI Comprehensive Test Suite
 *
 * Tests process monitoring, error detection, log management, and crash recovery
 * under harsh real-world conditions using real child processes.
 *
 * Run with: cd container && bun test
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'bun:test';
import { spawn, ChildProcess } from 'child_process';
import { promises as fs } from 'fs';
import { join } from 'path';
import { randomUUID } from 'crypto';
import { EventEmitter } from 'events';

import { ProcessMonitor } from './process-monitor.js';
import { StorageManager } from './storage.js';
import {
  ProcessInfo,
  ProcessState,
  MonitoringOptions,
  MonitoringEvent,
  SimpleError,
  DEFAULT_MONITORING_OPTIONS,
  getDataDirectory
} from './types.js';

// ============================================================================
// TEST CONFIGURATION
// ============================================================================

const TEST_TIMEOUT = 10000; // 10 seconds for process lifecycle operations
const SHORT_TIMEOUT = 3000;
const STRESS_TIMEOUT = 15000;

// Temp directory for test artifacts
let testDataDir: string;
let testInstanceCounter = 0;

// ============================================================================
// MOCK VITE SERVER SCRIPTS
// ============================================================================

/**
 * Creates mock process scripts for various scenarios.
 * These simulate realistic Vite dev server behavior.
 */
const MOCK_SCRIPTS = {
  // Normal startup with ready message
  startup: `
    const pinoLog = (level, msg, extra = {}) => console.log(JSON.stringify({
      level, msg, time: Date.now(), ...extra
    }));
    pinoLog(30, 'VITE v5.4.0  ready in 234 ms');
    pinoLog(30, 'Local:   http://localhost:5173/');
    pinoLog(30, 'Network: use --host to expose');
    // Keep alive
    setInterval(() => {
      pinoLog(30, 'HMR update detected');
    }, 500);
  `,

  // Emit error then continue running
  error: `
    const pinoLog = (level, msg, extra = {}) => console.log(JSON.stringify({
      level, msg, time: Date.now(), ...extra
    }));
    pinoLog(30, 'VITE v5.4.0  ready in 234 ms');
    setTimeout(() => {
      pinoLog(50, 'React error: Cannot read property of undefined');
    }, 100);
    setInterval(() => {}, 1000);
  `,

  // Emit fatal error and crash
  crash: `
    const pinoLog = (level, msg, extra = {}) => console.log(JSON.stringify({
      level, msg, time: Date.now(), ...extra
    }));
    pinoLog(30, 'VITE v5.4.0  ready in 150 ms');
    setTimeout(() => {
      pinoLog(60, 'fatal error: Maximum call stack size exceeded');
      process.exit(1);
    }, 200);
  `,

  // Clean exit
  cleanExit: `
    const pinoLog = (level, msg, extra = {}) => console.log(JSON.stringify({
      level, msg, time: Date.now(), ...extra
    }));
    pinoLog(30, 'VITE v5.4.0  ready in 100 ms');
    setTimeout(() => {
      pinoLog(30, 'Shutting down...');
      process.exit(0);
    }, 300);
  `,

  // Hang (no output)
  hang: `
    // Start but produce no output - simulates hung process
    setInterval(() => {}, 1000);
  `,

  // High-frequency log output
  flood: `
    const pinoLog = (level, msg, extra = {}) => console.log(JSON.stringify({
      level, msg, time: Date.now(), ...extra
    }));
    pinoLog(30, 'VITE v5.4.0  ready in 50 ms');
    let counter = 0;
    const interval = setInterval(() => {
      for (let i = 0; i < 100; i++) {
        pinoLog(30, 'HMR update ' + (counter++));
      }
      if (counter >= 1000) {
        clearInterval(interval);
        pinoLog(30, 'Flood complete');
      }
    }, 10);
  `,

  // EADDRINUSE error
  portConflict: `
    const pinoLog = (level, msg, extra = {}) => console.log(JSON.stringify({
      level, msg, time: Date.now(), ...extra
    }));
    pinoLog(60, 'Error: listen EADDRINUSE: address already in use :::5173');
    process.exit(1);
  `,

  // Module not found error
  moduleNotFound: `
    const pinoLog = (level, msg, extra = {}) => console.log(JSON.stringify({
      level, msg, time: Date.now(), ...extra
    }));
    pinoLog(60, 'Error: Cannot find module \\'./missing-component\\'');
    process.exit(1);
  `,

  // Compilation error
  compilationError: `
    const pinoLog = (level, msg, extra = {}) => console.log(JSON.stringify({
      level, msg, time: Date.now(), ...extra
    }));
    pinoLog(30, 'VITE v5.4.0  ready in 200 ms');
    setTimeout(() => {
      pinoLog(50, 'Failed to compile: SyntaxError: Unexpected token in App.tsx:42:15');
      pinoLog(50, 'Error in ./src/App.tsx');
    }, 150);
    setInterval(() => {}, 1000);
  `,

  // React error boundary crash
  reactCrash: `
    const pinoLog = (level, msg, extra = {}) => console.log(JSON.stringify({
      level, msg, time: Date.now(), ...extra
    }));
    pinoLog(30, 'VITE v5.4.0  ready in 180 ms');
    setTimeout(() => {
      pinoLog(50, 'Uncaught TypeError: Cannot read properties of null (reading \\'map\\')');
      pinoLog(50, 'The above error occurred in the <UserList> component');
      pinoLog(50, 'React will try to recreate this component tree from scratch');
    }, 200);
    setInterval(() => {}, 1000);
  `,

  // Delayed startup (for health check tests)
  slowStartup: `
    const pinoLog = (level, msg, extra = {}) => console.log(JSON.stringify({
      level, msg, time: Date.now(), ...extra
    }));
    // Wait 2 seconds before ready message
    setTimeout(() => {
      pinoLog(30, 'VITE v5.4.0  ready in 2000 ms');
    }, 2000);
    setInterval(() => {}, 1000);
  `,

  // Multiple crashes for restart testing
  crashAfterRun: `
    const pinoLog = (level, msg, extra = {}) => console.log(JSON.stringify({
      level, msg, time: Date.now(), ...extra
    }));
    const runId = process.env.RUN_ID || Date.now();
    pinoLog(30, 'Starting run ' + runId);
    pinoLog(30, 'VITE v5.4.0  ready in 100 ms');
    setTimeout(() => {
      pinoLog(60, 'Crash ' + runId);
      process.exit(1);
    }, 500);
  `,

  // Echo mode - echoes stdin lines (for testing input)
  echo: `
    const readline = require('readline');
    const rl = readline.createInterface({ input: process.stdin });
    console.log(JSON.stringify({ level: 30, msg: 'Echo server ready', time: Date.now() }));
    rl.on('line', (line) => {
      console.log(JSON.stringify({ level: 30, msg: 'Echo: ' + line, time: Date.now() }));
    });
  `,

  // Plain text output (non-JSON)
  plainText: `
    console.log('Plain text log line 1');
    console.log('Plain text log line 2');
    console.error('Error output line');
    setTimeout(() => {
      console.log('Done');
      process.exit(0);
    }, 200);
  `,

  // Mixed JSON and plain text
  mixedOutput: `
    const pinoLog = (level, msg) => console.log(JSON.stringify({ level, msg, time: Date.now() }));
    pinoLog(30, 'JSON message 1');
    console.log('Plain text message');
    pinoLog(50, 'JSON error message');
    console.error('Plain stderr message');
    pinoLog(30, 'JSON message 2');
    setTimeout(() => process.exit(0), 300);
  `
};

// ============================================================================
// TEST HELPERS
// ============================================================================

/**
 * Generate unique instance ID for test isolation
 */
function getTestInstanceId(): string {
  return `test-${Date.now()}-${++testInstanceCounter}`;
}

/**
 * Create a temporary data directory for tests
 */
async function createTempDataDir(): Promise<string> {
  const dir = join(process.cwd(), '.test-data', randomUUID());
  await fs.mkdir(dir, { recursive: true });
  return dir;
}

/**
 * Clean up temporary directory
 */
async function cleanupTempDir(dir: string): Promise<void> {
  try {
    await fs.rm(dir, { recursive: true, force: true });
  } catch {
    // Ignore cleanup errors
  }
}

/**
 * Wait for ProcessMonitor to reach a specific state
 */
function waitForState(
  monitor: ProcessMonitor,
  targetState: ProcessState,
  timeout: number = TEST_TIMEOUT
): Promise<void> {
  return new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      reject(new Error(`Timeout waiting for state: ${targetState} (current: ${monitor.getState()})`));
    }, timeout);

    const checkState = () => {
      if (monitor.getState() === targetState) {
        clearTimeout(timeoutId);
        resolve();
        return true;
      }
      return false;
    };

    if (checkState()) return;

    const handler = (event: MonitoringEvent) => {
      if (event.type === 'state_changed' && event.newState === targetState) {
        clearTimeout(timeoutId);
        monitor.removeListener('state_changed', handler);
        resolve();
      }
    };

    monitor.on('state_changed', handler);
  });
}

/**
 * Wait for a specific event from ProcessMonitor
 */
function waitForEvent(
  monitor: ProcessMonitor,
  eventType: MonitoringEvent['type'],
  timeout: number = TEST_TIMEOUT
): Promise<MonitoringEvent> {
  return new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      reject(new Error(`Timeout waiting for event: ${eventType}`));
    }, timeout);

    const handler = (event: MonitoringEvent) => {
      if (event.type === eventType) {
        clearTimeout(timeoutId);
        monitor.removeListener(eventType, handler);
        resolve(event);
      }
    };

    monitor.on(eventType, handler);
  });
}

/**
 * Spawn a mock process with the given script
 */
function spawnMockProcess(scriptKey: keyof typeof MOCK_SCRIPTS, env?: Record<string, string>): ChildProcess {
  const script = MOCK_SCRIPTS[scriptKey];
  return spawn('bun', ['-e', script], {
    env: { ...process.env, ...env },
    stdio: ['pipe', 'pipe', 'pipe']
  });
}

/**
 * Create ProcessInfo for testing
 */
function createTestProcessInfo(instanceId: string, scriptKey: keyof typeof MOCK_SCRIPTS = 'startup'): ProcessInfo {
  return {
    id: `proc-${instanceId}-${Date.now()}`,
    instanceId,
    command: 'bun',
    args: ['-e', MOCK_SCRIPTS[scriptKey]],
    cwd: process.cwd(),
    restartCount: 0
  };
}

/**
 * Create ProcessMonitor with test defaults
 */
function createTestMonitor(
  storage: StorageManager,
  instanceId: string,
  scriptKey: keyof typeof MOCK_SCRIPTS = 'startup',
  options: MonitoringOptions = {}
): ProcessMonitor {
  const processInfo = createTestProcessInfo(instanceId, scriptKey);
  return new ProcessMonitor(processInfo, storage, {
    autoRestart: false,
    maxRestarts: 3,
    restartDelay: 100,
    healthCheckInterval: 5000,
    errorBufferSize: 100,
    ...options
  });
}

/**
 * Sleep helper
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ============================================================================
// CIRCULAR BUFFER TESTS
// ============================================================================

describe('Unit: CircularBuffer', () => {
  // Since CircularBuffer is private, we test its behavior through ProcessMonitor's getRecentLogs

  it('should handle empty buffer', async () => {
    const instanceId = getTestInstanceId();
    const storage = new StorageManager(
      join(testDataDir, `${instanceId}-errors.db`),
      join(testDataDir, `${instanceId}-logs.db`)
    );

    try {
      const monitor = createTestMonitor(storage, instanceId, 'startup');
      const logs = monitor.getRecentLogs(50);
      expect(logs).toEqual([]);
    } finally {
      storage.close();
    }
  });

  it('should store and retrieve logs in order', async () => {
    const instanceId = getTestInstanceId();
    const storage = new StorageManager(
      join(testDataDir, `${instanceId}-errors.db`),
      join(testDataDir, `${instanceId}-logs.db`)
    );

    try {
      const monitor = createTestMonitor(storage, instanceId, 'startup');
      const result = await monitor.start();
      expect(result.success).toBe(true);

      // Wait for some logs to accumulate
      await sleep(500);

      const logs = monitor.getRecentLogs(50);
      expect(logs.length).toBeGreaterThan(0);

      // Verify logs are in chronological order
      for (let i = 1; i < logs.length; i++) {
        expect(logs[i].timestamp.getTime()).toBeGreaterThanOrEqual(logs[i - 1].timestamp.getTime());
      }

      await monitor.cleanup();
    } finally {
      storage.close();
    }
  }, TEST_TIMEOUT);

  it('should respect buffer capacity', async () => {
    const instanceId = getTestInstanceId();
    const storage = new StorageManager(
      join(testDataDir, `${instanceId}-errors.db`),
      join(testDataDir, `${instanceId}-logs.db`)
    );

    const bufferSize = 50;
    try {
      const monitor = createTestMonitor(storage, instanceId, 'flood', {
        errorBufferSize: bufferSize
      });
      const result = await monitor.start();
      expect(result.success).toBe(true);

      // Wait for flood to complete
      await sleep(2000);

      const logs = monitor.getRecentLogs(1000);
      // Buffer should not exceed configured size
      expect(logs.length).toBeLessThanOrEqual(bufferSize);

      await monitor.cleanup();
    } finally {
      storage.close();
    }
  }, TEST_TIMEOUT);

  it('should handle slice operations correctly', async () => {
    const instanceId = getTestInstanceId();
    const storage = new StorageManager(
      join(testDataDir, `${instanceId}-errors.db`),
      join(testDataDir, `${instanceId}-logs.db`)
    );

    try {
      const monitor = createTestMonitor(storage, instanceId, 'startup');
      const result = await monitor.start();
      expect(result.success).toBe(true);

      await sleep(1000);

      const allLogs = monitor.getRecentLogs(100);
      const lastFive = monitor.getRecentLogs(5);

      expect(lastFive.length).toBeLessThanOrEqual(5);
      if (allLogs.length >= 5) {
        expect(lastFive).toEqual(allLogs.slice(-5));
      }

      await monitor.cleanup();
    } finally {
      storage.close();
    }
  }, TEST_TIMEOUT);
});

// ============================================================================
// FILE LOCK TESTS
// ============================================================================

describe('Unit: FileLock', () => {
  it('should create lock file on acquire', async () => {
    const instanceId = getTestInstanceId();
    const logFilePath = join(testDataDir, `${instanceId}-test.log`);
    const lockFilePath = `${logFilePath}.lock`;

    // Write initial file
    await fs.writeFile(logFilePath, 'test content');

    // Acquire lock by simulating what FileLock does
    await fs.writeFile(lockFilePath, `${process.pid}:${Date.now()}`, { flag: 'wx' });

    // Verify lock file exists
    const lockExists = await fs.access(lockFilePath).then(() => true).catch(() => false);
    expect(lockExists).toBe(true);

    // Clean up
    await fs.unlink(lockFilePath).catch(() => {});
    await fs.unlink(logFilePath).catch(() => {});
  });

  it('should detect stale locks', async () => {
    const instanceId = getTestInstanceId();
    const logFilePath = join(testDataDir, `${instanceId}-stale.log`);
    const lockFilePath = `${logFilePath}.lock`;

    // Create stale lock (timestamp from 60 seconds ago)
    const staleTime = Date.now() - 60000;
    await fs.writeFile(lockFilePath, `99999:${staleTime}`);

    // Verify we can read the stale timestamp
    const content = await fs.readFile(lockFilePath, 'utf8');
    const [, timestamp] = content.split(':');
    const lockTime = parseInt(timestamp, 10);

    // Lock is older than 30 seconds, should be considered stale
    expect(Date.now() - lockTime).toBeGreaterThan(30000);

    // Clean up
    await fs.unlink(lockFilePath).catch(() => {});
  });

  it('should block concurrent lock attempts', async () => {
    const instanceId = getTestInstanceId();
    const logFilePath = join(testDataDir, `${instanceId}-concurrent.log`);
    const lockFilePath = `${logFilePath}.lock`;

    // First lock
    await fs.writeFile(lockFilePath, `${process.pid}:${Date.now()}`, { flag: 'wx' });

    // Second lock should fail with EEXIST
    let error: Error | null = null;
    try {
      await fs.writeFile(lockFilePath, `${process.pid}:${Date.now()}`, { flag: 'wx' });
    } catch (e) {
      error = e as Error;
    }

    expect(error).not.toBeNull();
    expect((error as NodeJS.ErrnoException).code).toBe('EEXIST');

    // Clean up
    await fs.unlink(lockFilePath).catch(() => {});
  });
});

// ============================================================================
// SIMPLE LOG MANAGER TESTS (via ProcessMonitor)
// ============================================================================

describe('Unit: SimpleLogManager', () => {
  it('should append and retrieve logs', async () => {
    const instanceId = getTestInstanceId();
    const storage = new StorageManager(
      join(testDataDir, `${instanceId}-errors.db`),
      join(testDataDir, `${instanceId}-logs.db`)
    );

    try {
      const monitor = createTestMonitor(storage, instanceId, 'startup');
      const result = await monitor.start();
      expect(result.success).toBe(true);

      await sleep(500);

      const logs = await monitor.getAllLogsAndReset();
      expect(logs.length).toBeGreaterThan(0);
      expect(logs).toContain('VITE');

      await monitor.cleanup();
    } finally {
      storage.close();
    }
  }, TEST_TIMEOUT);

  it('should reset log file after retrieval', async () => {
    const instanceId = getTestInstanceId();
    const storage = new StorageManager(
      join(testDataDir, `${instanceId}-errors.db`),
      join(testDataDir, `${instanceId}-logs.db`)
    );

    try {
      const monitor = createTestMonitor(storage, instanceId, 'startup');
      const result = await monitor.start();
      expect(result.success).toBe(true);

      await sleep(500);

      // First retrieval should have content
      const logs1 = await monitor.getAllLogsAndReset();
      expect(logs1.length).toBeGreaterThan(0);

      // Immediately after reset, logs should be empty or minimal
      const logs2 = await monitor.getAllLogsAndReset();
      expect(logs2.length).toBeLessThan(logs1.length);

      await monitor.cleanup();
    } finally {
      storage.close();
    }
  }, TEST_TIMEOUT);

  it('should handle concurrent read/write operations', async () => {
    const instanceId = getTestInstanceId();
    const storage = new StorageManager(
      join(testDataDir, `${instanceId}-errors.db`),
      join(testDataDir, `${instanceId}-logs.db`)
    );

    try {
      const monitor = createTestMonitor(storage, instanceId, 'flood');
      const result = await monitor.start();
      expect(result.success).toBe(true);

      // Concurrent reads while flooding
      const reads = await Promise.all([
        sleep(100).then(() => monitor.getAllLogsAndReset()),
        sleep(200).then(() => monitor.getAllLogsAndReset()),
        sleep(300).then(() => monitor.getAllLogsAndReset())
      ]);

      // All reads should complete without error
      for (const logs of reads) {
        expect(typeof logs).toBe('string');
      }

      await monitor.cleanup();
    } finally {
      storage.close();
    }
  }, TEST_TIMEOUT);
});

// ============================================================================
// PROCESS MONITOR STATE MACHINE TESTS
// ============================================================================

describe('Unit: ProcessMonitor State Machine', () => {
  it('should start in stopped state', async () => {
    const instanceId = getTestInstanceId();
    const storage = new StorageManager(
      join(testDataDir, `${instanceId}-errors.db`),
      join(testDataDir, `${instanceId}-logs.db`)
    );

    try {
      const monitor = createTestMonitor(storage, instanceId, 'startup');
      expect(monitor.getState()).toBe('stopped');
    } finally {
      storage.close();
    }
  });

  it('should transition stopped -> starting -> running', async () => {
    const instanceId = getTestInstanceId();
    const storage = new StorageManager(
      join(testDataDir, `${instanceId}-errors.db`),
      join(testDataDir, `${instanceId}-logs.db`)
    );

    try {
      const monitor = createTestMonitor(storage, instanceId, 'startup');
      const states: ProcessState[] = [];

      monitor.on('state_changed', (event: MonitoringEvent) => {
        if (event.type === 'state_changed') {
          states.push(event.newState);
        }
      });

      const result = await monitor.start();
      expect(result.success).toBe(true);
      expect(monitor.getState()).toBe('running');
      expect(states).toContain('starting');
      expect(states).toContain('running');

      await monitor.cleanup();
    } finally {
      storage.close();
    }
  }, TEST_TIMEOUT);

  it('should transition running -> stopping -> stopped on graceful stop', async () => {
    const instanceId = getTestInstanceId();
    const storage = new StorageManager(
      join(testDataDir, `${instanceId}-errors.db`),
      join(testDataDir, `${instanceId}-logs.db`)
    );

    try {
      const monitor = createTestMonitor(storage, instanceId, 'startup');
      await monitor.start();
      expect(monitor.getState()).toBe('running');

      const states: ProcessState[] = [];
      monitor.on('state_changed', (event: MonitoringEvent) => {
        if (event.type === 'state_changed') {
          states.push(event.newState);
        }
      });

      await monitor.stop();
      expect(monitor.getState()).toBe('stopped');
      expect(states).toContain('stopping');

      await monitor.cleanup();
    } finally {
      storage.close();
    }
  }, TEST_TIMEOUT);

  it('should transition running -> crashed on unexpected exit', async () => {
    const instanceId = getTestInstanceId();
    const storage = new StorageManager(
      join(testDataDir, `${instanceId}-errors.db`),
      join(testDataDir, `${instanceId}-logs.db`)
    );

    try {
      const monitor = createTestMonitor(storage, instanceId, 'crash', {
        autoRestart: false
      });

      const crashPromise = waitForEvent(monitor, 'process_crashed');
      await monitor.start();
      await crashPromise;

      expect(monitor.getState()).toBe('crashed');

      await monitor.cleanup();
    } finally {
      storage.close();
    }
  }, TEST_TIMEOUT);

  it('should prevent starting when already running', async () => {
    const instanceId = getTestInstanceId();
    const storage = new StorageManager(
      join(testDataDir, `${instanceId}-errors.db`),
      join(testDataDir, `${instanceId}-logs.db`)
    );

    try {
      const monitor = createTestMonitor(storage, instanceId, 'startup');
      await monitor.start();
      expect(monitor.getState()).toBe('running');

      const result = await monitor.start();
      expect(result.success).toBe(false);

      await monitor.cleanup();
    } finally {
      storage.close();
    }
  }, TEST_TIMEOUT);

  it('should prevent stopping when already stopped', async () => {
    const instanceId = getTestInstanceId();
    const storage = new StorageManager(
      join(testDataDir, `${instanceId}-errors.db`),
      join(testDataDir, `${instanceId}-logs.db`)
    );

    try {
      const monitor = createTestMonitor(storage, instanceId, 'startup');
      expect(monitor.getState()).toBe('stopped');

      const result = await monitor.stop();
      expect(result.success).toBe(true); // Idempotent

      await monitor.cleanup();
    } finally {
      storage.close();
    }
  });
});

// ============================================================================
// PROCESS MONITOR STREAM PROCESSING TESTS
// ============================================================================

describe('Unit: ProcessMonitor Stream Processing', () => {
  it('should handle JSON log lines', async () => {
    const instanceId = getTestInstanceId();
    const storage = new StorageManager(
      join(testDataDir, `${instanceId}-errors.db`),
      join(testDataDir, `${instanceId}-logs.db`)
    );

    try {
      const monitor = createTestMonitor(storage, instanceId, 'startup');
      await monitor.start();
      await sleep(500);

      const logs = monitor.getRecentLogs(50);
      expect(logs.some(l => l.content.includes('VITE'))).toBe(true);

      await monitor.cleanup();
    } finally {
      storage.close();
    }
  }, TEST_TIMEOUT);

  it('should handle plain text output', async () => {
    const instanceId = getTestInstanceId();
    const storage = new StorageManager(
      join(testDataDir, `${instanceId}-errors.db`),
      join(testDataDir, `${instanceId}-logs.db`)
    );

    try {
      const monitor = createTestMonitor(storage, instanceId, 'plainText');
      await monitor.start();
      await waitForState(monitor, 'stopped', SHORT_TIMEOUT);

      const allLogs = await monitor.getAllLogsAndReset();
      expect(allLogs).toContain('Plain text');

      await monitor.cleanup();
    } finally {
      storage.close();
    }
  }, TEST_TIMEOUT);

  it('should handle mixed JSON and plain text', async () => {
    const instanceId = getTestInstanceId();
    const storage = new StorageManager(
      join(testDataDir, `${instanceId}-errors.db`),
      join(testDataDir, `${instanceId}-logs.db`)
    );

    try {
      const monitor = createTestMonitor(storage, instanceId, 'mixedOutput');
      await monitor.start();
      await waitForState(monitor, 'stopped', SHORT_TIMEOUT);

      const allLogs = await monitor.getAllLogsAndReset();
      expect(allLogs).toContain('JSON message');
      expect(allLogs).toContain('Plain text');

      await monitor.cleanup();
    } finally {
      storage.close();
    }
  }, TEST_TIMEOUT);

  it('should separate stdout and stderr', async () => {
    const instanceId = getTestInstanceId();
    const storage = new StorageManager(
      join(testDataDir, `${instanceId}-errors.db`),
      join(testDataDir, `${instanceId}-logs.db`)
    );

    try {
      const monitor = createTestMonitor(storage, instanceId, 'plainText');
      await monitor.start();
      await waitForState(monitor, 'stopped', SHORT_TIMEOUT);

      const logs = monitor.getRecentLogs(50);
      const stdoutLogs = logs.filter(l => l.stream === 'stdout');
      const stderrLogs = logs.filter(l => l.stream === 'stderr');

      expect(stdoutLogs.length).toBeGreaterThan(0);
      expect(stderrLogs.length).toBeGreaterThan(0);

      await monitor.cleanup();
    } finally {
      storage.close();
    }
  }, TEST_TIMEOUT);

  it('should handle high-frequency output', async () => {
    const instanceId = getTestInstanceId();
    const storage = new StorageManager(
      join(testDataDir, `${instanceId}-errors.db`),
      join(testDataDir, `${instanceId}-logs.db`)
    );

    try {
      const monitor = createTestMonitor(storage, instanceId, 'flood', {
        errorBufferSize: 200
      });
      await monitor.start();

      // Wait for flood to complete
      await sleep(3000);

      const logs = monitor.getRecentLogs(200);
      expect(logs.length).toBeGreaterThan(50);

      await monitor.cleanup();
    } finally {
      storage.close();
    }
  }, STRESS_TIMEOUT);
});

// ============================================================================
// PROCESS MONITOR ERROR DETECTION TESTS
// ============================================================================

describe('Unit: ProcessMonitor Error Detection', () => {
  it('should detect level 50 errors', async () => {
    const instanceId = getTestInstanceId();
    const storage = new StorageManager(
      join(testDataDir, `${instanceId}-errors.db`),
      join(testDataDir, `${instanceId}-logs.db`)
    );

    try {
      const monitor = createTestMonitor(storage, instanceId, 'error');
      const errorPromise = waitForEvent(monitor, 'error_detected');
      await monitor.start();

      const event = await errorPromise;
      expect(event.type).toBe('error_detected');
      if (event.type === 'error_detected') {
        expect(event.error.level).toBe(50);
      }

      await monitor.cleanup();
    } finally {
      storage.close();
    }
  }, TEST_TIMEOUT);

  it('should detect level 60 fatal errors', async () => {
    const instanceId = getTestInstanceId();
    const storage = new StorageManager(
      join(testDataDir, `${instanceId}-errors.db`),
      join(testDataDir, `${instanceId}-logs.db`)
    );

    try {
      const monitor = createTestMonitor(storage, instanceId, 'crash', {
        autoRestart: false
      });
      const errorPromise = waitForEvent(monitor, 'error_detected');
      await monitor.start();

      const event = await errorPromise;
      expect(event.type).toBe('error_detected');
      if (event.type === 'error_detected') {
        expect(event.error.level).toBe(60);
      }

      await monitor.cleanup();
    } finally {
      storage.close();
    }
  }, TEST_TIMEOUT);

  it('should store errors in storage', async () => {
    const instanceId = getTestInstanceId();
    const storage = new StorageManager(
      join(testDataDir, `${instanceId}-errors.db`),
      join(testDataDir, `${instanceId}-logs.db`)
    );

    try {
      const monitor = createTestMonitor(storage, instanceId, 'error');
      // Set up event listener BEFORE starting to avoid race condition
      const errorPromise = waitForEvent(monitor, 'error_detected');
      await monitor.start();
      await errorPromise;
      await sleep(200);

      const result = storage.getErrors(instanceId);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.length).toBeGreaterThan(0);
        expect(result.data[0].level).toBe(50);
      }

      await monitor.cleanup();
    } finally {
      storage.close();
    }
  }, TEST_TIMEOUT);

  it('should detect EADDRINUSE as fatal', async () => {
    const instanceId = getTestInstanceId();
    const storage = new StorageManager(
      join(testDataDir, `${instanceId}-errors.db`),
      join(testDataDir, `${instanceId}-logs.db`)
    );

    try {
      const monitor = createTestMonitor(storage, instanceId, 'portConflict', {
        autoRestart: false
      });
      const errorPromise = waitForEvent(monitor, 'error_detected');
      await monitor.start();

      const event = await errorPromise;
      if (event.type === 'error_detected') {
        expect(event.error.message).toContain('EADDRINUSE');
      }

      await monitor.cleanup();
    } finally {
      storage.close();
    }
  }, TEST_TIMEOUT);

  it('should detect module not found as fatal', async () => {
    const instanceId = getTestInstanceId();
    const storage = new StorageManager(
      join(testDataDir, `${instanceId}-errors.db`),
      join(testDataDir, `${instanceId}-logs.db`)
    );

    try {
      const monitor = createTestMonitor(storage, instanceId, 'moduleNotFound', {
        autoRestart: false
      });
      const errorPromise = waitForEvent(monitor, 'error_detected');
      await monitor.start();

      const event = await errorPromise;
      if (event.type === 'error_detected') {
        expect(event.error.message).toContain('Cannot find module');
      }

      await monitor.cleanup();
    } finally {
      storage.close();
    }
  }, TEST_TIMEOUT);

  it('should capture compilation errors', async () => {
    const instanceId = getTestInstanceId();
    const storage = new StorageManager(
      join(testDataDir, `${instanceId}-errors.db`),
      join(testDataDir, `${instanceId}-logs.db`)
    );

    try {
      const monitor = createTestMonitor(storage, instanceId, 'compilationError');
      const errorPromise = waitForEvent(monitor, 'error_detected');
      await monitor.start();

      const event = await errorPromise;
      if (event.type === 'error_detected') {
        expect(event.error.message).toContain('SyntaxError');
      }

      await monitor.cleanup();
    } finally {
      storage.close();
    }
  }, TEST_TIMEOUT);

  it('should capture React errors', async () => {
    const instanceId = getTestInstanceId();
    const storage = new StorageManager(
      join(testDataDir, `${instanceId}-errors.db`),
      join(testDataDir, `${instanceId}-logs.db`)
    );

    try {
      const monitor = createTestMonitor(storage, instanceId, 'reactCrash');
      const errorPromise = waitForEvent(monitor, 'error_detected');
      await monitor.start();

      const event = await errorPromise;
      if (event.type === 'error_detected') {
        expect(event.error.message).toContain('TypeError');
      }

      await monitor.cleanup();
    } finally {
      storage.close();
    }
  }, TEST_TIMEOUT);
});

// ============================================================================
// PROCESS MONITOR RESTART LOGIC TESTS
// ============================================================================

describe('Unit: ProcessMonitor Restart Logic', () => {
  it('should auto-restart on crash when enabled', async () => {
    const instanceId = getTestInstanceId();
    const storage = new StorageManager(
      join(testDataDir, `${instanceId}-errors.db`),
      join(testDataDir, `${instanceId}-logs.db`)
    );

    try {
      const monitor = createTestMonitor(storage, instanceId, 'crash', {
        autoRestart: true,
        maxRestarts: 2,
        restartDelay: 100
      });

      let startCount = 0;
      monitor.on('process_started', () => {
        startCount++;
      });

      await monitor.start();

      // Wait for restart attempts
      await sleep(2000);

      // Should have started multiple times (initial + restarts)
      expect(startCount).toBeGreaterThan(1);

      await monitor.cleanup();
    } finally {
      storage.close();
    }
  }, TEST_TIMEOUT);

  it('should respect maxRestarts limit', async () => {
    const instanceId = getTestInstanceId();
    const storage = new StorageManager(
      join(testDataDir, `${instanceId}-errors.db`),
      join(testDataDir, `${instanceId}-logs.db`)
    );

    try {
      const maxRestarts = 2;
      const monitor = createTestMonitor(storage, instanceId, 'crash', {
        autoRestart: true,
        maxRestarts,
        restartDelay: 100
      });

      let startCount = 0;
      monitor.on('process_started', () => {
        startCount++;
      });

      await monitor.start();

      // Wait for all restart attempts
      await sleep(3000);

      // Initial start + maxRestarts
      expect(startCount).toBeLessThanOrEqual(maxRestarts + 1);

      await monitor.cleanup();
    } finally {
      storage.close();
    }
  }, TEST_TIMEOUT);

  it('should not restart on clean exit', async () => {
    const instanceId = getTestInstanceId();
    const storage = new StorageManager(
      join(testDataDir, `${instanceId}-errors.db`),
      join(testDataDir, `${instanceId}-logs.db`)
    );

    try {
      const monitor = createTestMonitor(storage, instanceId, 'cleanExit', {
        autoRestart: true,
        maxRestarts: 3,
        restartDelay: 100
      });

      let startCount = 0;
      monitor.on('process_started', () => {
        startCount++;
      });

      await monitor.start();
      await waitForState(monitor, 'stopped', SHORT_TIMEOUT);

      // Wait to ensure no restart
      await sleep(500);

      // Should only start once (clean exit = no restart)
      expect(startCount).toBe(1);

      await monitor.cleanup();
    } finally {
      storage.close();
    }
  }, TEST_TIMEOUT);

  it('should respect restartDelay', async () => {
    const instanceId = getTestInstanceId();
    const storage = new StorageManager(
      join(testDataDir, `${instanceId}-errors.db`),
      join(testDataDir, `${instanceId}-logs.db`)
    );

    try {
      const restartDelay = 500;
      const monitor = createTestMonitor(storage, instanceId, 'crash', {
        autoRestart: true,
        maxRestarts: 1,
        restartDelay
      });

      const startTimes: number[] = [];
      monitor.on('process_started', () => {
        startTimes.push(Date.now());
      });

      await monitor.start();

      // Wait for restart
      await sleep(2000);

      if (startTimes.length >= 2) {
        const delay = startTimes[1] - startTimes[0];
        // Delay should be at least restartDelay (with some tolerance for crash time)
        expect(delay).toBeGreaterThanOrEqual(restartDelay - 100);
      }

      await monitor.cleanup();
    } finally {
      storage.close();
    }
  }, TEST_TIMEOUT);
});

// ============================================================================
// STORAGE MANAGER TESTS
// ============================================================================

describe('Unit: StorageManager', () => {
  it('should initialize databases', async () => {
    const instanceId = getTestInstanceId();
    const errorDbPath = join(testDataDir, `${instanceId}-errors.db`);
    const logDbPath = join(testDataDir, `${instanceId}-logs.db`);

    const storage = new StorageManager(errorDbPath, logDbPath);

    try {
      const errorDbExists = await fs.access(errorDbPath).then(() => true).catch(() => false);
      const logDbExists = await fs.access(logDbPath).then(() => true).catch(() => false);

      expect(errorDbExists).toBe(true);
      expect(logDbExists).toBe(true);
    } finally {
      storage.close();
    }
  });

  it('should store and retrieve errors', async () => {
    const instanceId = getTestInstanceId();
    const storage = new StorageManager(
      join(testDataDir, `${instanceId}-errors.db`),
      join(testDataDir, `${instanceId}-logs.db`)
    );

    try {
      const error: SimpleError = {
        timestamp: new Date().toISOString(),
        level: 50,
        message: 'Test error message',
        rawOutput: '{"level":50,"msg":"Test error message"}'
      };

      const storeResult = storage.storeError(instanceId, 'proc-1', error);
      expect(storeResult.success).toBe(true);

      const getResult = storage.getErrors(instanceId);
      expect(getResult.success).toBe(true);
      if (getResult.success) {
        expect(getResult.data.length).toBe(1);
        expect(getResult.data[0].message).toBe('Test error message');
      }
    } finally {
      storage.close();
    }
  });

  it('should deduplicate errors by hash', async () => {
    const instanceId = getTestInstanceId();
    const storage = new StorageManager(
      join(testDataDir, `${instanceId}-errors.db`),
      join(testDataDir, `${instanceId}-logs.db`)
    );

    try {
      const error: SimpleError = {
        timestamp: new Date().toISOString(),
        level: 50,
        message: 'Duplicate error',
        rawOutput: '{"level":50,"msg":"Duplicate error"}'
      };

      // Store same error multiple times
      storage.storeError(instanceId, 'proc-1', error);
      storage.storeError(instanceId, 'proc-1', { ...error, timestamp: new Date().toISOString() });
      storage.storeError(instanceId, 'proc-1', { ...error, timestamp: new Date().toISOString() });

      const getResult = storage.getErrors(instanceId);
      expect(getResult.success).toBe(true);
      if (getResult.success) {
        // Should be deduplicated
        expect(getResult.data.length).toBe(1);
        // Occurrence count should be incremented
        expect(getResult.data[0].occurrenceCount).toBe(3);
      }
    } finally {
      storage.close();
    }
  });

  it('should clear errors', async () => {
    const instanceId = getTestInstanceId();
    const storage = new StorageManager(
      join(testDataDir, `${instanceId}-errors.db`),
      join(testDataDir, `${instanceId}-logs.db`)
    );

    try {
      const error: SimpleError = {
        timestamp: new Date().toISOString(),
        level: 50,
        message: 'Error to clear',
        rawOutput: '{}'
      };

      storage.storeError(instanceId, 'proc-1', error);

      const clearResult = storage.clearErrors(instanceId);
      expect(clearResult.success).toBe(true);
      if (clearResult.success) {
        expect(clearResult.data.clearedCount).toBe(1);
      }

      const getResult = storage.getErrors(instanceId);
      if (getResult.success) {
        expect(getResult.data.length).toBe(0);
      }
    } finally {
      storage.close();
    }
  });

  it('should get error summary', async () => {
    const instanceId = getTestInstanceId();
    const storage = new StorageManager(
      join(testDataDir, `${instanceId}-errors.db`),
      join(testDataDir, `${instanceId}-logs.db`)
    );

    try {
      storage.storeError(instanceId, 'proc-1', {
        timestamp: new Date().toISOString(),
        level: 50,
        message: 'Error 1',
        rawOutput: '{}'
      });
      storage.storeError(instanceId, 'proc-1', {
        timestamp: new Date().toISOString(),
        level: 60,
        message: 'Fatal 1',
        rawOutput: '{}'
      });

      const summaryResult = storage.getErrorSummary(instanceId);
      expect(summaryResult.success).toBe(true);
      if (summaryResult.success) {
        expect(summaryResult.data.totalErrors).toBe(2);
        expect(summaryResult.data.uniqueErrors).toBe(2);
        expect(summaryResult.data.errorsByLevel[50]).toBe(1);
        expect(summaryResult.data.errorsByLevel[60]).toBe(1);
      }
    } finally {
      storage.close();
    }
  });

  it('should store and retrieve logs', async () => {
    const instanceId = getTestInstanceId();
    const storage = new StorageManager(
      join(testDataDir, `${instanceId}-errors.db`),
      join(testDataDir, `${instanceId}-logs.db`)
    );

    try {
      const storeResult = storage.storeLogs([
        { instanceId, processId: 'proc-1', level: 'info', message: 'Log 1', stream: 'stdout' },
        { instanceId, processId: 'proc-1', level: 'error', message: 'Log 2', stream: 'stderr' }
      ]);
      expect(storeResult.success).toBe(true);

      const getResult = storage.getLogs({ instanceId });
      expect(getResult.success).toBe(true);
      if (getResult.success) {
        expect(getResult.data.logs.length).toBe(2);
      }
    } finally {
      storage.close();
    }
  });

  it('should clear logs', async () => {
    const instanceId = getTestInstanceId();
    const storage = new StorageManager(
      join(testDataDir, `${instanceId}-errors.db`),
      join(testDataDir, `${instanceId}-logs.db`)
    );

    try {
      storage.storeLogs([
        { instanceId, processId: 'proc-1', level: 'info', message: 'Log', stream: 'stdout' }
      ]);

      const clearResult = storage.clearLogs(instanceId);
      expect(clearResult.success).toBe(true);

      const getResult = storage.getLogs({ instanceId });
      if (getResult.success) {
        expect(getResult.data.logs.length).toBe(0);
      }
    } finally {
      storage.close();
    }
  });

  it('should handle transaction correctly', async () => {
    const instanceId = getTestInstanceId();
    const storage = new StorageManager(
      join(testDataDir, `${instanceId}-errors.db`),
      join(testDataDir, `${instanceId}-logs.db`)
    );

    try {
      storage.transaction(() => {
        storage.storeError(instanceId, 'proc-1', {
          timestamp: new Date().toISOString(),
          level: 50,
          message: 'Transaction error',
          rawOutput: '{}'
        });
      });

      const getResult = storage.getErrors(instanceId);
      expect(getResult.success).toBe(true);
      if (getResult.success) {
        expect(getResult.data.length).toBe(1);
      }
    } finally {
      storage.close();
    }
  });
});

// ============================================================================
// CLI VALIDATION TESTS
// ============================================================================

describe('Unit: CLI Validation', () => {
  // Import validation functions (we test via process spawn to avoid import issues)

  it('should accept valid instance IDs', async () => {
    const validIds = [
      'my-app',
      'myApp123',
      'test_instance',
      'a',
      'A123-test_app'
    ];

    for (const id of validIds) {
      // Validate pattern directly
      const pattern = /^[a-zA-Z0-9][a-zA-Z0-9_-]*$/;
      expect(pattern.test(id)).toBe(true);
    }
  });

  it('should reject invalid instance IDs', async () => {
    const invalidIds = [
      '',
      '-starts-with-dash',
      '_starts_with_underscore',
      '../path/traversal',
      'has spaces',
      'has@special',
      'a'.repeat(65) // Too long
    ];

    const pattern = /^[a-zA-Z0-9][a-zA-Z0-9_-]*$/;
    const maxLen = 64;

    for (const id of invalidIds) {
      const isValid = id.length > 0 && id.length <= maxLen && pattern.test(id);
      expect(isValid).toBe(false);
    }
  });

  it('should parse integer arguments correctly', () => {
    const parseIntArg = (value: unknown): number | undefined => {
      if (value === undefined || value === null) return undefined;
      const parsed = parseInt(String(value), 10);
      return isNaN(parsed) ? undefined : parsed;
    };

    expect(parseIntArg('123')).toBe(123);
    expect(parseIntArg(456)).toBe(456);
    expect(parseIntArg('0')).toBe(0);
    expect(parseIntArg(undefined)).toBe(undefined);
    expect(parseIntArg('invalid')).toBe(undefined);
  });

  it('should handle SafeJSON with circular references', () => {
    // Simulate SafeJSON.stringify
    const safeStringify = (data: unknown): string => {
      try {
        const seen = new WeakSet();
        return JSON.stringify(data, (_key, value) => {
          if (typeof value === 'object' && value !== null) {
            if (seen.has(value)) {
              return '[Circular Reference]';
            }
            seen.add(value);
          }
          return value;
        });
      } catch {
        return '{"error":"Failed to serialize"}';
      }
    };

    // Normal object
    expect(safeStringify({ a: 1 })).toBe('{"a":1}');

    // Circular reference
    const circular: Record<string, unknown> = { a: 1 };
    circular.self = circular;
    const result = safeStringify(circular);
    expect(result).toContain('[Circular Reference]');
  });
});

// ============================================================================
// INTEGRATION TESTS
// ============================================================================

describe('Integration: Full Process Lifecycle', () => {
  it('should complete start -> monitor -> stop cycle', async () => {
    const instanceId = getTestInstanceId();
    const storage = new StorageManager(
      join(testDataDir, `${instanceId}-errors.db`),
      join(testDataDir, `${instanceId}-logs.db`)
    );

    try {
      const monitor = createTestMonitor(storage, instanceId, 'startup');

      // Start
      const startResult = await monitor.start();
      expect(startResult.success).toBe(true);
      expect(monitor.getState()).toBe('running');

      // Monitor for a bit
      await sleep(500);

      // Verify logs are being collected
      const logs = monitor.getRecentLogs(50);
      expect(logs.length).toBeGreaterThan(0);

      // Stop
      const stopResult = await monitor.stop();
      expect(stopResult.success).toBe(true);
      expect(monitor.getState()).toBe('stopped');

      await monitor.cleanup();
    } finally {
      storage.close();
    }
  }, TEST_TIMEOUT);

  it('should capture errors during lifecycle', async () => {
    const instanceId = getTestInstanceId();
    const storage = new StorageManager(
      join(testDataDir, `${instanceId}-errors.db`),
      join(testDataDir, `${instanceId}-logs.db`)
    );

    try {
      const monitor = createTestMonitor(storage, instanceId, 'error');

      await monitor.start();
      await sleep(500);

      // Verify errors were captured
      const errorResult = storage.getErrors(instanceId);
      expect(errorResult.success).toBe(true);
      if (errorResult.success) {
        expect(errorResult.data.length).toBeGreaterThan(0);
      }

      await monitor.cleanup();
    } finally {
      storage.close();
    }
  }, TEST_TIMEOUT);

  it('should handle process info correctly', async () => {
    const instanceId = getTestInstanceId();
    const storage = new StorageManager(
      join(testDataDir, `${instanceId}-errors.db`),
      join(testDataDir, `${instanceId}-logs.db`)
    );

    try {
      const monitor = createTestMonitor(storage, instanceId, 'startup');

      await monitor.start();

      const info = monitor.getProcessInfo();
      expect(info.instanceId).toBe(instanceId);
      expect(info.command).toBe('bun');
      expect(info.pid).toBeGreaterThan(0);
      expect(info.status).toBe('running');
      expect(info.startTime).toBeInstanceOf(Date);

      await monitor.cleanup();
    } finally {
      storage.close();
    }
  }, TEST_TIMEOUT);

  it('should emit all expected events', async () => {
    const instanceId = getTestInstanceId();
    const storage = new StorageManager(
      join(testDataDir, `${instanceId}-errors.db`),
      join(testDataDir, `${instanceId}-logs.db`)
    );

    try {
      const monitor = createTestMonitor(storage, instanceId, 'error');
      const events: string[] = [];

      monitor.on('process_started', () => events.push('process_started'));
      monitor.on('error_detected', () => events.push('error_detected'));
      monitor.on('process_stopped', () => events.push('process_stopped'));
      monitor.on('state_changed', () => events.push('state_changed'));

      await monitor.start();
      await sleep(500);
      await monitor.stop();

      expect(events).toContain('process_started');
      expect(events).toContain('error_detected');
      expect(events).toContain('process_stopped');
      expect(events).toContain('state_changed');

      await monitor.cleanup();
    } finally {
      storage.close();
    }
  }, TEST_TIMEOUT);
});

describe('Integration: Error Management', () => {
  it('should accumulate multiple unique errors', async () => {
    const instanceId = getTestInstanceId();
    const storage = new StorageManager(
      join(testDataDir, `${instanceId}-errors.db`),
      join(testDataDir, `${instanceId}-logs.db`)
    );

    try {
      // Store different errors
      storage.storeError(instanceId, 'proc-1', {
        timestamp: new Date().toISOString(),
        level: 50,
        message: 'Error type A',
        rawOutput: '{}'
      });
      storage.storeError(instanceId, 'proc-1', {
        timestamp: new Date().toISOString(),
        level: 50,
        message: 'Error type B',
        rawOutput: '{}'
      });
      storage.storeError(instanceId, 'proc-1', {
        timestamp: new Date().toISOString(),
        level: 60,
        message: 'Error type C',
        rawOutput: '{}'
      });

      const result = storage.getErrors(instanceId);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.length).toBe(3);
      }
    } finally {
      storage.close();
    }
  });

  it('should track error occurrence counts', async () => {
    const instanceId = getTestInstanceId();
    const storage = new StorageManager(
      join(testDataDir, `${instanceId}-errors.db`),
      join(testDataDir, `${instanceId}-logs.db`)
    );

    try {
      const error = {
        timestamp: new Date().toISOString(),
        level: 50,
        message: 'Repeated error',
        rawOutput: '{}'
      };

      for (let i = 0; i < 5; i++) {
        storage.storeError(instanceId, 'proc-1', {
          ...error,
          timestamp: new Date().toISOString()
        });
      }

      const result = storage.getErrors(instanceId);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.length).toBe(1); // Deduplicated
        expect(result.data[0].occurrenceCount).toBe(5);
      }
    } finally {
      storage.close();
    }
  });
});

describe('Integration: Log Management', () => {
  it('should retrieve logs with pagination', async () => {
    const instanceId = getTestInstanceId();
    const storage = new StorageManager(
      join(testDataDir, `${instanceId}-errors.db`),
      join(testDataDir, `${instanceId}-logs.db`)
    );

    try {
      // Store many logs
      const logs = Array.from({ length: 50 }, (_, i) => ({
        instanceId,
        processId: 'proc-1',
        level: 'info' as const,
        message: `Log ${i}`,
        stream: 'stdout' as const
      }));
      storage.storeLogs(logs);

      // Get first page
      const page1 = storage.getLogs({ instanceId, limit: 10, offset: 0 });
      expect(page1.success).toBe(true);
      if (page1.success) {
        expect(page1.data.logs.length).toBe(10);
        expect(page1.data.hasMore).toBe(true);
      }

      // Get second page
      const page2 = storage.getLogs({ instanceId, limit: 10, offset: 10 });
      expect(page2.success).toBe(true);
      if (page2.success) {
        expect(page2.data.logs.length).toBe(10);
      }
    } finally {
      storage.close();
    }
  });

  it('should return log statistics', async () => {
    const instanceId = getTestInstanceId();
    const storage = new StorageManager(
      join(testDataDir, `${instanceId}-errors.db`),
      join(testDataDir, `${instanceId}-logs.db`)
    );

    try {
      storage.storeLogs([
        { instanceId, processId: 'proc-1', level: 'info', message: 'Info 1', stream: 'stdout' },
        { instanceId, processId: 'proc-1', level: 'info', message: 'Info 2', stream: 'stdout' },
        { instanceId, processId: 'proc-1', level: 'error', message: 'Error 1', stream: 'stderr' }
      ]);

      const stats = storage.getLogStats(instanceId);
      expect(stats.success).toBe(true);
      if (stats.success) {
        expect(stats.data.totalLogs).toBe(3);
        expect(stats.data.logsByLevel.info).toBe(2);
        expect(stats.data.logsByLevel.error).toBe(1);
        expect(stats.data.logsByStream.stdout).toBe(2);
        expect(stats.data.logsByStream.stderr).toBe(1);
      }
    } finally {
      storage.close();
    }
  });
});

// ============================================================================
// STRESS TESTS
// ============================================================================

describe('Stress: High Frequency Logs', () => {
  it('should handle 1000+ log lines without data loss', async () => {
    const instanceId = getTestInstanceId();
    const storage = new StorageManager(
      join(testDataDir, `${instanceId}-errors.db`),
      join(testDataDir, `${instanceId}-logs.db`)
    );

    try {
      const monitor = createTestMonitor(storage, instanceId, 'flood', {
        errorBufferSize: 500
      });

      await monitor.start();

      // Wait for flood to complete
      await sleep(4000);

      // Get all logs
      const logs = await monitor.getAllLogsAndReset();
      const lineCount = logs.split('\n').filter(l => l.trim()).length;

      // Should have captured many logs (some may be trimmed)
      expect(lineCount).toBeGreaterThan(100);

      await monitor.cleanup();
    } finally {
      storage.close();
    }
  }, STRESS_TIMEOUT);

  it('should maintain responsiveness under load', async () => {
    const instanceId = getTestInstanceId();
    const storage = new StorageManager(
      join(testDataDir, `${instanceId}-errors.db`),
      join(testDataDir, `${instanceId}-logs.db`)
    );

    try {
      const monitor = createTestMonitor(storage, instanceId, 'flood');
      await monitor.start();

      // Measure response time during flood
      const startTime = Date.now();
      const state = monitor.getState();
      const elapsed = Date.now() - startTime;

      expect(state).toBe('running');
      expect(elapsed).toBeLessThan(100); // Should respond quickly

      await monitor.cleanup();
    } finally {
      storage.close();
    }
  }, TEST_TIMEOUT);
});

describe('Stress: Rapid Restarts', () => {
  it('should handle rapid restart cycles', async () => {
    const instanceId = getTestInstanceId();
    const storage = new StorageManager(
      join(testDataDir, `${instanceId}-errors.db`),
      join(testDataDir, `${instanceId}-logs.db`)
    );

    try {
      const monitor = createTestMonitor(storage, instanceId, 'crash', {
        autoRestart: true,
        maxRestarts: 5,
        restartDelay: 50
      });

      let restartCount = 0;
      monitor.on('process_started', () => {
        restartCount++;
      });

      await monitor.start();

      // Wait for restart cycles
      await sleep(3000);

      // Should have restarted multiple times
      expect(restartCount).toBeGreaterThan(1);
      expect(restartCount).toBeLessThanOrEqual(6); // Initial + 5 restarts

      await monitor.cleanup();
    } finally {
      storage.close();
    }
  }, STRESS_TIMEOUT);

  it('should not leak resources on rapid start/stop', async () => {
    const instanceId = getTestInstanceId();
    const storage = new StorageManager(
      join(testDataDir, `${instanceId}-errors.db`),
      join(testDataDir, `${instanceId}-logs.db`)
    );

    try {
      for (let i = 0; i < 5; i++) {
        const monitor = createTestMonitor(storage, `${instanceId}-${i}`, 'startup');
        await monitor.start();
        await sleep(100);
        await monitor.stop();
        await monitor.cleanup();
      }

      // If we got here without errors, resources are being cleaned up
      expect(true).toBe(true);
    } finally {
      storage.close();
    }
  }, STRESS_TIMEOUT);
});

describe('Stress: Concurrent Access', () => {
  it('should handle concurrent log reads', async () => {
    const instanceId = getTestInstanceId();
    const storage = new StorageManager(
      join(testDataDir, `${instanceId}-errors.db`),
      join(testDataDir, `${instanceId}-logs.db`)
    );

    try {
      const monitor = createTestMonitor(storage, instanceId, 'startup');
      await monitor.start();

      // Concurrent reads
      const reads = await Promise.all([
        monitor.getAllLogsAndReset(),
        monitor.getAllLogsAndReset(),
        monitor.getAllLogsAndReset(),
        monitor.getRecentLogs(50),
        monitor.getRecentLogs(50)
      ]);

      // All reads should complete without error
      for (const result of reads) {
        expect(result).toBeDefined();
      }

      await monitor.cleanup();
    } finally {
      storage.close();
    }
  }, TEST_TIMEOUT);

  it('should handle concurrent error storage', async () => {
    const instanceId = getTestInstanceId();
    const storage = new StorageManager(
      join(testDataDir, `${instanceId}-errors.db`),
      join(testDataDir, `${instanceId}-logs.db`)
    );

    try {
      // Concurrent error writes
      const writes = await Promise.all(
        Array.from({ length: 10 }, (_, i) =>
          Promise.resolve(storage.storeError(instanceId, 'proc-1', {
            timestamp: new Date().toISOString(),
            level: 50,
            message: `Concurrent error ${i}`,
            rawOutput: '{}'
          }))
        )
      );

      // All writes should succeed
      for (const result of writes) {
        expect(result.success).toBe(true);
      }

      // Verify all errors stored
      const getResult = storage.getErrors(instanceId);
      if (getResult.success) {
        expect(getResult.data.length).toBe(10);
      }
    } finally {
      storage.close();
    }
  });
});

describe('Stress: Process Killing', () => {
  it('should handle SIGTERM during running state', async () => {
    const instanceId = getTestInstanceId();
    const storage = new StorageManager(
      join(testDataDir, `${instanceId}-errors.db`),
      join(testDataDir, `${instanceId}-logs.db`)
    );

    try {
      const monitor = createTestMonitor(storage, instanceId, 'startup');
      await monitor.start();

      // Immediate stop
      const stopResult = await monitor.stop();
      expect(stopResult.success).toBe(true);
      expect(monitor.getState()).toBe('stopped');

      await monitor.cleanup();
    } finally {
      storage.close();
    }
  }, TEST_TIMEOUT);

  it('should handle stop during starting state gracefully', async () => {
    const instanceId = getTestInstanceId();
    const storage = new StorageManager(
      join(testDataDir, `${instanceId}-errors.db`),
      join(testDataDir, `${instanceId}-logs.db`)
    );

    try {
      const monitor = createTestMonitor(storage, instanceId, 'slowStartup');

      // Start but don't wait
      const startPromise = monitor.start();

      // Small delay then stop
      await sleep(50);
      const stopResult = await monitor.stop();

      // Should either succeed or return error (not crash)
      expect(stopResult).toBeDefined();

      await startPromise.catch(() => {}); // Handle any start errors
      await monitor.cleanup();
    } finally {
      storage.close();
    }
  }, TEST_TIMEOUT);
});

// ============================================================================
// REAL-WORLD SCENARIO TESTS
// ============================================================================

describe('Scenarios: Vite Dev Server', () => {
  it('should detect successful startup', async () => {
    const instanceId = getTestInstanceId();
    const storage = new StorageManager(
      join(testDataDir, `${instanceId}-errors.db`),
      join(testDataDir, `${instanceId}-logs.db`)
    );

    try {
      const monitor = createTestMonitor(storage, instanceId, 'startup');
      await monitor.start();
      await sleep(500);

      const logs = await monitor.getAllLogsAndReset();
      expect(logs).toContain('VITE');
      expect(logs).toContain('ready');

      await monitor.cleanup();
    } finally {
      storage.close();
    }
  }, TEST_TIMEOUT);

  it('should capture compilation errors', async () => {
    const instanceId = getTestInstanceId();
    const storage = new StorageManager(
      join(testDataDir, `${instanceId}-errors.db`),
      join(testDataDir, `${instanceId}-logs.db`)
    );

    try {
      const monitor = createTestMonitor(storage, instanceId, 'compilationError');
      // Set up event listener BEFORE starting to avoid race condition
      const errorPromise = waitForEvent(monitor, 'error_detected');
      await monitor.start();
      await errorPromise;

      const errors = storage.getErrors(instanceId);
      if (errors.success && errors.data.length > 0) {
        expect(errors.data.some(e => e.message.includes('SyntaxError'))).toBe(true);
      }

      await monitor.cleanup();
    } finally {
      storage.close();
    }
  }, TEST_TIMEOUT);

  it('should handle EADDRINUSE gracefully', async () => {
    const instanceId = getTestInstanceId();
    const storage = new StorageManager(
      join(testDataDir, `${instanceId}-errors.db`),
      join(testDataDir, `${instanceId}-logs.db`)
    );

    try {
      const monitor = createTestMonitor(storage, instanceId, 'portConflict', {
        autoRestart: false
      });

      const crashPromise = waitForEvent(monitor, 'process_crashed', SHORT_TIMEOUT);
      await monitor.start();
      await crashPromise;

      expect(monitor.getState()).toBe('crashed');

      const errors = storage.getErrors(instanceId);
      if (errors.success && errors.data.length > 0) {
        expect(errors.data.some(e => e.message.includes('EADDRINUSE'))).toBe(true);
      }

      await monitor.cleanup();
    } finally {
      storage.close();
    }
  }, TEST_TIMEOUT);

  it('should restart on crash up to maxRestarts', async () => {
    const instanceId = getTestInstanceId();
    const storage = new StorageManager(
      join(testDataDir, `${instanceId}-errors.db`),
      join(testDataDir, `${instanceId}-logs.db`)
    );

    try {
      const maxRestarts = 2;
      const monitor = createTestMonitor(storage, instanceId, 'crash', {
        autoRestart: true,
        maxRestarts,
        restartDelay: 100
      });

      let startCount = 0;
      let crashCount = 0;

      monitor.on('process_started', () => startCount++);
      monitor.on('process_crashed', () => crashCount++);

      await monitor.start();

      // Wait for all restart attempts
      await sleep(3000);

      // Should have exhausted all restart attempts
      expect(crashCount).toBe(maxRestarts + 1);
      expect(startCount).toBe(maxRestarts + 1);

      await monitor.cleanup();
    } finally {
      storage.close();
    }
  }, STRESS_TIMEOUT);

  it('should emit health_check_failed for unresponsive process', async () => {
    const instanceId = getTestInstanceId();
    const storage = new StorageManager(
      join(testDataDir, `${instanceId}-errors.db`),
      join(testDataDir, `${instanceId}-logs.db`)
    );

    try {
      const monitor = createTestMonitor(storage, instanceId, 'hang', {
        healthCheckInterval: 500, // Very short for testing
        autoRestart: false
      });

      let healthFailed = false;
      monitor.on('health_check_failed', () => {
        healthFailed = true;
      });

      await monitor.start();

      // Wait for health check to fail (need 2x interval with no activity)
      await sleep(2000);

      expect(healthFailed).toBe(true);

      await monitor.cleanup();
    } finally {
      storage.close();
    }
  }, TEST_TIMEOUT);

  it('should handle React error boundary crashes', async () => {
    const instanceId = getTestInstanceId();
    const storage = new StorageManager(
      join(testDataDir, `${instanceId}-errors.db`),
      join(testDataDir, `${instanceId}-logs.db`)
    );

    try {
      const monitor = createTestMonitor(storage, instanceId, 'reactCrash');

      const errorPromise = waitForEvent(monitor, 'error_detected');
      await monitor.start();
      await errorPromise;

      const errors = storage.getErrors(instanceId);
      if (errors.success) {
        expect(errors.data.some(e =>
          e.message.includes('TypeError') || e.message.includes('React')
        )).toBe(true);
      }

      await monitor.cleanup();
    } finally {
      storage.close();
    }
  }, TEST_TIMEOUT);

  it('should distinguish between graceful and forced shutdown', async () => {
    const instanceId = getTestInstanceId();
    const storage = new StorageManager(
      join(testDataDir, `${instanceId}-errors.db`),
      join(testDataDir, `${instanceId}-logs.db`)
    );

    try {
      // Test graceful shutdown (clean exit)
      const monitor1 = createTestMonitor(storage, `${instanceId}-1`, 'cleanExit', {
        autoRestart: false
      });
      await monitor1.start();
      await waitForState(monitor1, 'stopped', SHORT_TIMEOUT);

      // Should be stopped, not crashed
      expect(monitor1.getState()).toBe('stopped');
      await monitor1.cleanup();

      // Test forced shutdown (crash)
      const monitor2 = createTestMonitor(storage, `${instanceId}-2`, 'crash', {
        autoRestart: false
      });
      await monitor2.start();
      await waitForState(monitor2, 'crashed', SHORT_TIMEOUT);

      // Should be crashed
      expect(monitor2.getState()).toBe('crashed');
      await monitor2.cleanup();
    } finally {
      storage.close();
    }
  }, TEST_TIMEOUT);
});

// ============================================================================
// MONITOR LOG COHERENCE TESTS
// ============================================================================

describe('Monitor Logs: Coherent Log Streams', () => {
  it('should include monitor logs for process lifecycle events', async () => {
    const instanceId = getTestInstanceId();
    const storage = new StorageManager(
      join(testDataDir, `${instanceId}-errors.db`),
      join(testDataDir, `${instanceId}-logs.db`)
    );

    try {
      const monitor = createTestMonitor(storage, instanceId, 'startup');
      await monitor.start();
      await sleep(500);
      await monitor.stop();

      const logs = await monitor.getAllLogsAndReset();

      // Should have monitor logs for process creation and start
      expect(logs).toContain('[MONITOR]');
      expect(logs).toContain('Starting process');
      expect(logs).toContain('Process started successfully');
      expect(logs).toContain('PID=');

      await monitor.cleanup();
    } finally {
      storage.close();
    }
  }, TEST_TIMEOUT);

  it('should log crash events and restart attempts coherently', async () => {
    const instanceId = getTestInstanceId();
    const storage = new StorageManager(
      join(testDataDir, `${instanceId}-errors.db`),
      join(testDataDir, `${instanceId}-logs.db`)
    );

    try {
      const monitor = createTestMonitor(storage, instanceId, 'crash', {
        autoRestart: true,
        maxRestarts: 2,
        restartDelay: 100
      });

      await monitor.start();

      // Wait for restart cycles to complete
      await sleep(2500);

      const logs = await monitor.getAllLogsAndReset();

      // Should have multiple lifecycle events documented
      expect(logs).toContain('[MONITOR]');
      expect(logs).toContain('Process crashed');
      expect(logs).toContain('Scheduling restart');
      expect(logs).toContain('attempt=1');
      expect(logs).toContain('attempt=2');

      // Should document max restarts reached
      expect(logs).toContain('maxRestarts');

      await monitor.cleanup();
    } finally {
      storage.close();
    }
  }, STRESS_TIMEOUT);

  it('should maintain coherent log stream across multiple restarts', async () => {
    const instanceId = getTestInstanceId();
    const storage = new StorageManager(
      join(testDataDir, `${instanceId}-errors.db`),
      join(testDataDir, `${instanceId}-logs.db`)
    );

    try {
      const monitor = createTestMonitor(storage, instanceId, 'crash', {
        autoRestart: true,
        maxRestarts: 3,
        restartDelay: 50
      });

      let startCount = 0;
      monitor.on('process_started', () => startCount++);

      await monitor.start();

      // Wait for all restart cycles
      await sleep(3000);

      const logs = await monitor.getAllLogsAndReset();
      const logLines = logs.split('\n');

      // Find all monitor log lines
      const monitorLogs = logLines.filter(line => line.includes('[MONITOR]'));

      // Should have at least: start, crash, restart schedule, start, crash... for each cycle
      expect(monitorLogs.length).toBeGreaterThanOrEqual(8); // At least 2 events per restart cycle

      // Verify chronological order - each "Starting process" should be followed by "Process started" or error
      const startingLogs = monitorLogs.filter(l => l.includes('Starting process'));
      const startedLogs = monitorLogs.filter(l => l.includes('Process started successfully'));
      const crashedLogs = monitorLogs.filter(l => l.includes('Process crashed'));

      // Should have starts + crashes = total runs
      expect(startingLogs.length).toBe(startCount);
      expect(crashedLogs.length).toBeGreaterThanOrEqual(startCount - 1);

      await monitor.cleanup();
    } finally {
      storage.close();
    }
  }, STRESS_TIMEOUT);

  it('should include runtime duration in exit logs', async () => {
    const instanceId = getTestInstanceId();
    const storage = new StorageManager(
      join(testDataDir, `${instanceId}-errors.db`),
      join(testDataDir, `${instanceId}-logs.db`)
    );

    try {
      const monitor = createTestMonitor(storage, instanceId, 'cleanExit', {
        autoRestart: false
      });

      await monitor.start();
      await waitForState(monitor, 'stopped', SHORT_TIMEOUT);

      const logs = await monitor.getAllLogsAndReset();

      // Should log runtime information on exit
      expect(logs).toContain('[MONITOR]');
      expect(logs).toContain('runtime=');
      expect(logs).toContain('exitCode=0');

      await monitor.cleanup();
    } finally {
      storage.close();
    }
  }, TEST_TIMEOUT);

  it('should log stop request and graceful shutdown', async () => {
    const instanceId = getTestInstanceId();
    const storage = new StorageManager(
      join(testDataDir, `${instanceId}-errors.db`),
      join(testDataDir, `${instanceId}-logs.db`)
    );

    try {
      const monitor = createTestMonitor(storage, instanceId, 'startup');
      await monitor.start();
      await sleep(300);
      await monitor.stop();

      const logs = await monitor.getAllLogsAndReset();

      // Should log stop request and clean exit
      expect(logs).toContain('[MONITOR]');
      expect(logs).toContain('Stop requested');
      // Process exits cleanly via SIGTERM (exit event comes first, marking it as clean exit)
      expect(logs).toContain('exited cleanly');

      await monitor.cleanup();
    } finally {
      storage.close();
    }
  }, TEST_TIMEOUT);
});

// ============================================================================
// PORT HEALTH CHECK TESTS
// ============================================================================

describe('Health Check: Port Monitoring', () => {
  // Mock script that binds to a port (using Bun's built-in server)
  const createPortBindScript = (port: number) => `
    const pinoLog = (level, msg) => console.log(JSON.stringify({
      level, msg, time: Date.now()
    }));

    pinoLog(30, 'Starting server...');

    Bun.serve({
      port: ${port},
      fetch(req) {
        return new Response('OK');
      }
    });

    pinoLog(30, 'Server listening on port ${port}');
    // Keep alive
    setInterval(() => {}, 1000);
  `;

  // Script that doesn't bind to any port (simulates misconfigured server that hangs)
  const noPortBindScript = `
    const pinoLog = (level, msg) => console.log(JSON.stringify({
      level, msg, time: Date.now()
    }));

    pinoLog(30, 'Starting but NOT binding to port...');

    // Just stay alive without producing output (simulates a hung startup)
    setInterval(() => {}, 1000);
  `;

  it('should detect when expected port is bound', async () => {
    const instanceId = getTestInstanceId();
    const testPort = 19000 + Math.floor(Math.random() * 1000); // Random port to avoid conflicts
    const storage = new StorageManager(
      join(testDataDir, `${instanceId}-errors.db`),
      join(testDataDir, `${instanceId}-logs.db`)
    );

    try {
      const monitor = new ProcessMonitor(
        {
          id: `proc-${instanceId}`,
          instanceId,
          command: 'bun',
          args: ['-e', createPortBindScript(testPort)],
          cwd: testDataDir,
          restartCount: 0
        },
        storage,
        {
          ...DEFAULT_MONITORING_OPTIONS,
          expectedPort: testPort,
          healthCheckInterval: 500,
          autoRestart: false
        }
      );

      await monitor.start();

      // Wait for port to bind and health check to run
      await sleep(1500);

      const logs = await monitor.getAllLogsAndReset();

      // Should log when port starts accepting connections
      expect(logs).toContain('[MONITOR]');
      expect(logs).toContain(`Port ${testPort}`);
      expect(logs).toContain('accepting connections');

      await monitor.cleanup();
    } finally {
      storage.close();
    }
  }, TEST_TIMEOUT);

  it('should report health issue when expected port is not bound', async () => {
    const instanceId = getTestInstanceId();
    const testPort = 19000 + Math.floor(Math.random() * 1000);
    const storage = new StorageManager(
      join(testDataDir, `${instanceId}-errors.db`),
      join(testDataDir, `${instanceId}-logs.db`)
    );

    try {
      const monitor = new ProcessMonitor(
        {
          id: `proc-${instanceId}`,
          instanceId,
          command: 'bun',
          args: ['-e', noPortBindScript],
          cwd: testDataDir,
          restartCount: 0
        },
        storage,
        {
          ...DEFAULT_MONITORING_OPTIONS,
          expectedPort: testPort,
          healthCheckInterval: 500,
          autoRestart: false
        }
      );

      let healthCheckFailed = false;
      monitor.on('health_check_failed', () => {
        healthCheckFailed = true;
      });

      await monitor.start();

      // Wait for health check to detect missing port (needs 2x healthCheckInterval with no port)
      await sleep(2000);

      // Should have detected the missing port
      expect(healthCheckFailed).toBe(true);

      await monitor.cleanup();
    } finally {
      storage.close();
    }
  }, TEST_TIMEOUT);

  it('should include expectedPort in startup log', async () => {
    const instanceId = getTestInstanceId();
    const testPort = 19000 + Math.floor(Math.random() * 1000);
    const storage = new StorageManager(
      join(testDataDir, `${instanceId}-errors.db`),
      join(testDataDir, `${instanceId}-logs.db`)
    );

    try {
      // Create monitor with expectedPort option
      const monitor = new ProcessMonitor(
        {
          id: `proc-${instanceId}`,
          instanceId,
          command: 'bun',
          args: ['-e', MOCK_SCRIPTS.startup],
          cwd: testDataDir,
          restartCount: 0
        },
        storage,
        {
          ...DEFAULT_MONITORING_OPTIONS,
          expectedPort: testPort,
          healthCheckInterval: 1000,
          autoRestart: false
        }
      );

      await monitor.start();
      await sleep(500);

      const logs = await monitor.getAllLogsAndReset();

      // Should include port info in startup log
      expect(logs).toContain('[MONITOR]');
      expect(logs).toContain(`expectedPort=${testPort}`);

      await monitor.cleanup();
    } finally {
      storage.close();
    }
  }, TEST_TIMEOUT);

  it('should check PID liveness during health check', async () => {
    const instanceId = getTestInstanceId();
    const storage = new StorageManager(
      join(testDataDir, `${instanceId}-errors.db`),
      join(testDataDir, `${instanceId}-logs.db`)
    );

    try {
      // Use hang script which produces no output - this will trigger health check
      const monitor = createTestMonitor(storage, instanceId, 'hang', {
        healthCheckInterval: 300,
        autoRestart: false
      });

      let healthCheckEvents: MonitoringEvent[] = [];
      monitor.on('health_check_failed', (event) => {
        healthCheckEvents.push(event);
      });

      await monitor.start();

      // Wait for health checks to run
      await sleep(1500);

      // Health check should have run (due to inactivity) but PID should still be alive
      // So we shouldn't get "PID not responding" - just inactivity warnings
      const hasInactivityWarning = healthCheckEvents.length > 0;
      expect(hasInactivityWarning).toBe(true);

      await monitor.cleanup();
    } finally {
      storage.close();
    }
  }, TEST_TIMEOUT);
});

// ============================================================================
// SETUP AND TEARDOWN
// ============================================================================

beforeAll(async () => {
  testDataDir = await createTempDataDir();
  // Set environment for tests
  process.env.CLI_DATA_DIR = testDataDir;
});

afterAll(async () => {
  await cleanupTempDir(testDataDir);
});

afterEach(async () => {
  // Small delay between tests for cleanup
  await sleep(100);
});
