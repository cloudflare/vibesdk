/**
 * Simple event system for app-related events
 * Allows different parts of the app to communicate about app state changes
 */

import { AppWithFavoriteStatus } from "@/api-types";

// Define specific event data types
export interface AppDeletedEvent {
  type: 'app-deleted';
  appId: string;
}

export interface AppCreatedEvent {
  type: 'app-created';
  appId: string;
  data?: {
    title?: string;
    description?: string;
    visibility?: string;
    isForked?: boolean;
  };
}

export interface AppUpdatedEvent {
  type: 'app-updated';
  appId: string;
  data?: AppWithFavoriteStatus
}

export type AppEvent = AppDeletedEvent | AppCreatedEvent | AppUpdatedEvent;
export type AppEventType = AppEvent['type'];
export type AppEventListener = (event: AppEvent) => void;

class AppEventEmitter {
  private listeners: Map<AppEventType, Set<AppEventListener>> = new Map();

  on(eventType: AppEventType, listener: AppEventListener) {
    if (!this.listeners.has(eventType)) {
      this.listeners.set(eventType, new Set());
    }
    this.listeners.get(eventType)!.add(listener);

    // Return cleanup function
    return () => {
      this.listeners.get(eventType)?.delete(listener);
    };
  }

  emit(event: AppEvent) {
    const listeners = this.listeners.get(event.type);
    if (listeners) {
      listeners.forEach(listener => {
        try {
          listener(event);
        } catch (error) {
          console.error('Error in app event listener:', error);
        }
      });
    }
  }

  // Convenience methods
  emitAppDeleted(appId: string) {
    this.emit({ type: 'app-deleted', appId });
  }

  emitAppCreated(appId: string, data?: AppCreatedEvent['data']) {
    this.emit({ type: 'app-created', appId, data });
  }

  emitAppUpdated(appId: string, data?: AppUpdatedEvent['data']) {
    this.emit({ type: 'app-updated', appId, data });
  }
}

// Export singleton instance
export const appEvents = new AppEventEmitter();