/**
 * Simple Structured Logger
 */
import * as Sentry from '@sentry/cloudflare';
import type { LoggerConfig, ObjectContext, LogEntry, LogLevel } from './types';

const DEFAULT_CONFIG: LoggerConfig = {
	level: 'info',
	prettyPrint: false,
};

const LOG_LEVELS: Record<LogLevel, number> = {
	debug: 0,
	info: 1,
	warn: 2,
	error: 3,
};

// Credential scrubbing patterns removed by request

/**
 * Scrubbing disabled: pass-through
 */
function scrubCredentials(data: unknown): unknown {
    return data;
}

export class StructuredLogger {
	private readonly component: string;
	private objectContext?: ObjectContext;
	private readonly config: LoggerConfig;
	private additionalFields: Record<string, unknown> = {};

	constructor(
		component: string,
		objectContext?: ObjectContext,
		config?: LoggerConfig,
	) {
		this.component = component;
		this.objectContext = objectContext ? { ...objectContext } : undefined;
		this.config = { ...DEFAULT_CONFIG, ...config };
	}

	/**
	 * Set the object ID dynamically
	 */
	setObjectId(id: string): void {
		if (!this.objectContext) {
			this.objectContext = { type: this.component, id };
		} else {
			this.objectContext.id = id;
		}
	}

	/**
	 * Set additional fields that will be included in all log entries
	 */
	setFields(fields: Record<string, unknown>): void {
		this.additionalFields = { ...this.additionalFields, ...fields };
	}

	/**
	 * Set a single field
	 */
	setField(key: string, value: unknown): void {
		this.additionalFields[key] = value;
	}

	/**
	 * Clear all additional fields
	 */
	clearFields(): void {
		this.additionalFields = {};
	}

	/**
	 * Create a child logger with extended context
	 */
	child(
		childContext: Partial<ObjectContext>,
		component?: string,
	): StructuredLogger {
		const newComponent = component || this.component;
		const mergedContext: ObjectContext = {
			type: childContext.type || 'ChildLogger',
			id: childContext.id || `child-${Date.now()}`,
			...childContext,
		};

		const childLogger = new StructuredLogger(
			newComponent,
			mergedContext,
			this.config,
		);
		childLogger.setFields(this.additionalFields);
		return childLogger;
	}

	/**
	 * Check if message should be logged based on level
	 */
	private shouldLog(level: LogLevel): boolean {
		const configLevel = LOG_LEVELS[this.config.level || 'info'];
		const messageLevel = LOG_LEVELS[level];
		return messageLevel >= configLevel;
	}

	/**
	 * Core logging method - builds structured JSON and outputs via console
	 */
	private log(
		level: LogLevel,
		message: string,
		data?: Record<string, unknown>,
		error?: Error,
	): void {
		if (!this.shouldLog(level)) return;

		const logEntry: LogEntry = {
			level,
			time: new Date().toISOString(),
			component: this.component,
			msg: scrubCredentials(message) as string,
		};

		// Add object context if available
		if (this.objectContext) {
			logEntry.object = { ...this.objectContext };
		}

		// Add additional fields with credential scrubbing
		if (Object.keys(this.additionalFields).length > 0) {
			const scrubbedAdditionalFields = scrubCredentials(this.additionalFields) as Record<string, unknown>;
			Object.assign(logEntry, scrubbedAdditionalFields);
		}

		// Add structured data with credential scrubbing
		if (data) {
			try {
				const scrubbedData = scrubCredentials(data);
				if (scrubbedData && typeof scrubbedData === 'object' && !Array.isArray(scrubbedData)) {
					Object.assign(logEntry, scrubbedData as Record<string, unknown>);
				}
			} catch {
				// If scrubbing fails, add a safe placeholder
				logEntry.data = '[DATA_SCRUB_FAILED]';
			}
		}

		// Add error details with credential scrubbing
		if (error instanceof Error) {
			logEntry.error = {
				name: error.name,
				message: scrubCredentials(error.message) as string,
				stack: scrubCredentials(error.stack) as string | undefined,
			};
		}

		// Output using appropriate method
		this.output(level, logEntry);
	}

	/**
	 * Safe JSON stringify that handles circular references
	 */
	private safeStringify(obj: unknown): string {
		const seen = new WeakSet();
		
		return JSON.stringify(obj, (_key, value) => {
			// Handle undefined, functions, symbols
			if (value === undefined || typeof value === 'function' || typeof value === 'symbol') {
				return undefined;
			}
			
			// Handle BigInt
			if (typeof value === 'bigint') {
				return value.toString();
			}
			
			// Handle circular references
			if (typeof value === 'object' && value !== null) {
				if (seen.has(value)) {
					return '[Circular]';
				}
				seen.add(value);
				
				// Handle Error objects specially to preserve stack traces
				if (value instanceof Error) {
					return {
						name: value.name,
						message: value.message,
						stack: value.stack,
						// Include any additional properties
						...Object.getOwnPropertyNames(value).reduce((acc, prop) => {
							if (!['name', 'message', 'stack'].includes(prop)) {
								const descriptor = Object.getOwnPropertyDescriptor(value, prop);
								if (descriptor && descriptor.enumerable) {
									acc[prop] = (value as any)[prop];
								}
							}
							return acc;
						}, {} as Record<string, unknown>)
					};
				}
			}
			
			return value;
		});
	}

	/**
	 * Output log entry using console methods
	 */
	private output(level: LogLevel, logEntry: LogEntry): void {
		const consoleMethod = this.getConsoleMethod(level);

		if (this.config.prettyPrint) {
			// Pretty formatted output for development
			const objectInfo = logEntry.object
				? `[${logEntry.object.type}${logEntry.object.id ? `#${logEntry.object.id}` : ''}]`
				: '';
			const prefix = `${logEntry.time} ${level.toUpperCase()} ${logEntry.component}${objectInfo}`;

			// Extract additional data excluding base fields
			const {
				level: _,
				time,
				component,
				msg,
				object,
				error,
				...additionalData
			} = logEntry;
			const hasAdditionalData = Object.keys(additionalData).length > 0;

			if (hasAdditionalData || error) {
				const extraInfo: Record<string, unknown> = {};
				if (hasAdditionalData) Object.assign(extraInfo, additionalData);
				if (error) extraInfo.error = error;
				console[consoleMethod](`${prefix}: ${msg}`, extraInfo);
			} else {
				console[consoleMethod](`${prefix}: ${msg}`);
			}
		} else {
			// Structured JSON output for production (optimal for Cloudflare Workers Logs)
			try {
				const jsonStr = this.safeStringify(logEntry);
				console[consoleMethod](jsonStr);
			} catch (e) {
				// Fallback if even safe stringify fails
				console[consoleMethod](
					JSON.stringify({
						level: logEntry.level,
						time: logEntry.time,
						component: logEntry.component,
						msg: '[LOG_STRINGIFY_FAILED]',
						stringifyError:
							e instanceof Error ? { name: e.name, message: e.message } : String(e),
					}),
				);
			}
		}
	}

	/**
	 * Get appropriate console method for log level
	 */
	private getConsoleMethod(
		level: LogLevel,
	): 'debug' | 'log' | 'warn' | 'error' {
		switch (level) {
			case 'debug':
				return 'debug';
			case 'info':
				return 'log';
			case 'warn':
				return 'warn';
			case 'error':
				return 'error';
			default:
				return 'log';
		}
	}

	/**
	 * Process variable arguments into structured data
	 */
	private processArgs(args: unknown[]): Record<string, unknown> {
		if (args.length === 0) return {};

		if (args.length === 1) {
			const arg = args[0];
			if (
				arg &&
				typeof arg === 'object' &&
				!Array.isArray(arg) &&
				!(arg instanceof Error)
			) {
				return arg as Record<string, unknown>;
			}
			return { data: arg };
		}

		// Multiple arguments
		const result: Record<string, unknown> = {};
		args.forEach((arg, index) => {
			if (
				arg &&
				typeof arg === 'object' &&
				!Array.isArray(arg) &&
				!(arg instanceof Error)
			) {
				Object.assign(result, arg as Record<string, unknown>);
			} else {
				result[`arg${index}`] = arg;
			}
		});
		return result;
	}

	/**
	 * Process arguments with error handling
	 */
	private processArgsWithError(args: unknown[]): {
		data: Record<string, unknown>;
		error?: Error;
	} {
		let error: Error | undefined;
		const otherArgs: unknown[] = [];

		const isErrorLike = (value: unknown): value is { name?: unknown; message?: unknown; stack?: unknown } => {
			return (
				value !== null &&
				typeof value === 'object' &&
				('message' in (value as Record<string, unknown>) || 'name' in (value as Record<string, unknown>))
			);
		};

		const toError = (value: { name?: unknown; message?: unknown; stack?: unknown }): Error => {
			const msg = typeof value.message === 'string' ? value.message : 'Unknown error';
			const err = new Error(msg);
			if (typeof value.name === 'string') err.name = value.name;
			if (typeof value.stack === 'string') (err as Error).stack = value.stack;
			return err;
		};

		args.forEach((arg) => {
			if (arg instanceof Error) {
				error = arg;
				return;
			}
			if (isErrorLike(arg)) {
				error = toError(arg);
				return;
			}
			otherArgs.push(arg);
		});

		return {
			data: this.processArgs(otherArgs),
			error,
		};
	}

	// Public logging methods
	debug(message: string, ...args: unknown[]): void {
		this.log('debug', message, this.processArgs(args));
	}

	info(message: string, ...args: unknown[]): void {
		this.log('info', message, this.processArgs(args));
	}

	warn(message: string, ...args: unknown[]): void {
		this.log('warn', message, this.processArgs(args));
	}

	error(message: string, ...args: unknown[]): void {
		const { data, error } = this.processArgsWithError(args);
        Sentry.captureException(error || new Error(message), { extra: data });
		this.log('error', message, data, error);
	}

	trace(message: string, ...args: unknown[]): void {
		this.debug(message, ...args);
	}

	fatal(message: string, ...args: unknown[]): void {
		this.error(message, ...args);
	}
}

/**
 * Create a basic structured logger
 */
export function createLogger(
	component: string,
	config?: LoggerConfig,
): StructuredLogger {
	return new StructuredLogger(component, undefined, config);
}

/**
 * Create logger with object context
 */
export function createObjectLogger(
	obj: unknown,
	component?: string,
	config?: LoggerConfig,
): StructuredLogger {
	const componentName = component || getObjectType(obj) || 'UnknownComponent';

	// Create basic object context without complex probing
	const objectContext: ObjectContext = {
		type: componentName,
	};

	// Try to get ID safely
	if (obj && typeof obj === 'object') {
		const objWithId = obj as Record<string, unknown>;
		if (
			objWithId.id &&
			(typeof objWithId.id === 'string' ||
				typeof objWithId.id === 'number')
		) {
			objectContext.id = String(objWithId.id);
		}
	}

	return new StructuredLogger(componentName, objectContext, config);
}

/**
 * Safely get object type
 */
function getObjectType(obj: unknown): string | undefined {
	try {
		if (obj && typeof obj === 'object') {
			return (obj as Record<string, unknown>).constructor?.name;
		}
		return typeof obj;
	} catch {
		return undefined;
	}
}


/**
 * Logger factory for global configuration
 */
export class LoggerFactory {
	private static globalConfig: LoggerConfig = DEFAULT_CONFIG;

	static configure(config: Partial<LoggerConfig>): void {
		this.globalConfig = { ...this.globalConfig, ...config };
	}

	static getConfig(): LoggerConfig {
		return { ...this.globalConfig };
	}

	static create(component: string): StructuredLogger {
		return new StructuredLogger(component, undefined, this.globalConfig);
	}

	static createForObject(obj: unknown, component?: string): StructuredLogger {
		return createObjectLogger(obj, component, this.globalConfig);
	}
}
