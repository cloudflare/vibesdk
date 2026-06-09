import { useMemo, useState, useEffect, useRef } from 'react';
import type { ChatMessage } from '../utils/message-helpers';

interface DebugSessionInfo {
	message: ChatMessage;
	isActive: boolean;
	startTime: number;
	elapsedSeconds: number;
	toolCallCount: number;
}

/**
 * Custom hook to extract and manage debug session state
 * Reuses existing message/toolEvent infrastructure
 */
export function useDebugSession(
	messages: ChatMessage[]
): DebugSessionInfo | null {
	const [elapsedSeconds, setElapsedSeconds] = useState(0);
	const startTimeRef = useRef<number | null>(null);

	// Find the message containing deep_debug tool event
	const debugMessage = useMemo(() => {
		return messages.find(msg =>
			msg.ui?.toolEvents?.some(event => event.name === 'deep_debug')
		);
	}, [messages]);

	// Extract debug event info
	const debugInfo = useMemo(() => {
		if (!debugMessage) return null;

		const debugEvent = debugMessage.ui?.toolEvents?.find(e => e.name === 'deep_debug');
		if (!debugEvent) return null;

		const toolCallCount = debugMessage.ui?.toolEvents?.filter(
			e => e.name !== 'deep_debug'
		).length || 0;

		return {
			message: debugMessage,
			isActive: debugEvent.status === 'start',
			startTime: debugEvent.timestamp,
			toolCallCount,
		};
	}, [debugMessage]);

	// Timer for elapsed time
	useEffect(() => {
		if (!debugInfo?.isActive) {
			startTimeRef.current = null;
			setElapsedSeconds(0);
			return;
		}

		if (!startTimeRef.current) {
			startTimeRef.current = Date.now();
		}

		const interval = setInterval(() => {
			if (startTimeRef.current) {
				const elapsed = Math.floor((Date.now() - startTimeRef.current) / 1000);
				setElapsedSeconds(elapsed);
			}
		}, 1000);

		return () => clearInterval(interval);
	}, [debugInfo?.isActive]);

	if (!debugInfo) return null;

	return {
		...debugInfo,
		elapsedSeconds,
	};
}

/**
 * Format elapsed time as MM:SS
 */
export function formatElapsedTime(seconds: number): string {
	const mins = Math.floor(seconds / 60);
	const secs = seconds % 60;
	return `${mins}:${secs.toString().padStart(2, '0')}`;
}
