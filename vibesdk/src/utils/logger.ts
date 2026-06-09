 
export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LoggerOptions {
	level?: LogLevel;
	prefix?: string;
	enabled?: boolean;
}

export class Logger {
	private level: LogLevel;
	private prefix: string;
	private enabled: boolean;

	private static levels: Record<LogLevel, number> = {
		debug: 0,
		info: 1,
		warn: 2,
		error: 3,
	};

	constructor(options: LoggerOptions = {}) {
		this.level = options.level ?? 'info';
		this.prefix = options.prefix ?? '';
		this.enabled = options.enabled ?? true;
	}

	private shouldLog(level: LogLevel): boolean {
		return this.enabled && Logger.levels[level] >= Logger.levels[this.level];
	}

	private formatMessage(_level: LogLevel, args: unknown[]): unknown[] {
		// const time = new Date().toISOString();
		const prefix = this.prefix ? `[${this.prefix}]` : '';
		// return [`[${time}] ${prefix} [${level.toUpperCase()}]`, ...args];
		return [prefix, ...args];
		// return args;
	}

	debug(...args: unknown[]) {
		if (this.shouldLog('debug')) {
			console.debug(...this.formatMessage('debug', args));
		}
	}

	info(...args: unknown[]) {
		if (this.shouldLog('info')) {
			console.info(...this.formatMessage('info', args));
		}
	}

	warn(...args: unknown[]) {
		if (this.shouldLog('warn')) {
			console.warn(...this.formatMessage('warn', args));
		}
	}

	error(...args: unknown[]) {
		if (this.shouldLog('error')) {
			console.error(...this.formatMessage('error', args));
		}
	}

	setLevel(level: LogLevel) {
		this.level = level;
	}

	enable() {
		this.enabled = true;
	}

	disable() {
		this.enabled = false;
	}
}

export const logger = new Logger({
	level: import.meta.env.DEV ? 'debug' : 'info',
});
