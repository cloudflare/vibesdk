export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LoggerConfig {
	/** Base log level - messages below this level won't be logged */
	level?: LogLevel;
	/** Pretty print for development (uses console formatting vs JSON) */
	prettyPrint?: boolean;
}

export interface ObjectContext {
	/** Unique identifier for this object instance */
	id?: string;
	/** Type/class name of the object */
	type?: string;
	/** Additional object-specific metadata */
	meta?: Record<string, unknown>;
}

export interface LogEntry {
	/** Log level */
	level: LogLevel;
	/** Timestamp in ISO format */
	time: string;
	/** Component name */
	component: string;
	/** Primary log message */
	msg: string;
	/** Object context if applicable */
	object?: ObjectContext;
	/** Error object if applicable */
	error?: {
		name: string;
		message: string;
		stack?: string;
	};
	/** Additional structured data */
	[key: string]: unknown;
}
