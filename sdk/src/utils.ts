/**
 * Checks if a value is a plain object (not null, not an array).
 */
export function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Error thrown when an operation times out.
 */
export class TimeoutError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'TimeoutError';
	}
}

/**
 * Wraps a promise with a timeout. If the promise doesn't resolve within
 * the specified time, throws a TimeoutError.
 */
export async function withTimeout<T>(
	promise: Promise<T>,
	ms: number,
	message = 'Operation timed out'
): Promise<T> {
	let timeoutId: ReturnType<typeof setTimeout> | undefined;
	const timeout = new Promise<never>((_, reject) => {
		timeoutId = setTimeout(() => reject(new TimeoutError(message)), ms);
	});
	try {
		return await Promise.race([promise, timeout]);
	} finally {
		if (timeoutId !== undefined) clearTimeout(timeoutId);
	}
}
