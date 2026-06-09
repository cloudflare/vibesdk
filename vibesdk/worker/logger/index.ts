/**
 * Simple Structured Logging System
 */

export * from './types';
export * from './core';

import { createLogger, createObjectLogger, LoggerFactory } from './core';
import { DEFAULT_CONFIG } from './core';

// Configure logger for Cloudflare Workers environment
LoggerFactory.configure(DEFAULT_CONFIG);

/**
 * Main Logger utilities - simplified API
 */
export const Logger = {
	/**
	 * Create a component logger
	 */
	create: createLogger,

	/**
	 * Create an object logger
	 */
	forObject: createObjectLogger,

	/**
	 * Configure global logging settings
	 */
	configure: LoggerFactory.configure.bind(LoggerFactory),

	/**
	 * Get current configuration
	 */
	getConfig: LoggerFactory.getConfig.bind(LoggerFactory),
};

/**
 * Method decorator for automatic logging (simplified)
 */
export function LogMethod(component?: string) {
	return function (
		target: unknown,
		propertyKey: string,
		descriptor: PropertyDescriptor,
	) {
		const originalMethod = descriptor.value;
		const className =
			(target as Record<string, unknown>)?.constructor?.name ||
			'UnknownClass';
		const methodName = propertyKey;
		const loggerComponent = component || className;

		descriptor.value = function (this: unknown, ...args: unknown[]) {
			const logger = createObjectLogger(this, loggerComponent);

			logger.debug(`Entering method: ${methodName}`, {
				argsCount: args.length,
			});
			try {
				const result = originalMethod.apply(this, args);
				if (result && typeof result === 'object' && 'then' in result) {
					// Handle async methods
					return (result as Promise<unknown>).then(
						(res) => {
							logger.debug(`Exiting method: ${methodName}`, {
								success: true,
							});
							return res;
						},
						(error) => {
							logger.error(`Method ${methodName} failed`, error);
							throw error;
						},
					);
				} else {
					logger.debug(`Exiting method: ${methodName}`, {
						success: true,
					});
					return result;
				}
			} catch (error) {
				logger.error(`Method ${methodName} failed`, error);
				throw error;
			}
		};

		return descriptor;
	};
}

/**
 * Class decorator for automatic logger injection
 */
export function WithLogger(component?: string) {
	return function <T extends new (...args: any[]) => object>(constructor: T) {
		return class extends constructor {
			logger = createObjectLogger(
				this,
				component || constructor.name,
			);
			constructor(...args: any[]) {
				super(...args);
			}
		};
	};
}

// Export default logger instance for quick usage
export default Logger;
