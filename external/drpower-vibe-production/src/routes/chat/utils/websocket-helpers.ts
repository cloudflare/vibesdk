import type { WebSocket } from 'partysocket';

/**
 * Check if WebSocket is ready for communication
 */
export function isWebSocketReady(websocket: WebSocket | undefined): websocket is WebSocket {
    return !!websocket && websocket.readyState === 1; // OPEN state
}

/**
 * Send a message via WebSocket if connection is ready
 */
export function sendWebSocketMessage(
    websocket: WebSocket | undefined,
    type: string,
    data?: Record<string, unknown>
): boolean {
    if (!isWebSocketReady(websocket)) {
        console.warn(`WebSocket not ready for message type: ${type}`);
        return false;
    }
    
    websocket.send(JSON.stringify({ type, ...data }));
    return true;
}
