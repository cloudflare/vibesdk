export class TypedEmitter<Events extends Record<string, unknown>> {
	private listeners = new Map<keyof Events, Set<(payload: Events[keyof Events]) => void>>();
	private anyListeners = new Set<(event: keyof Events, payload: Events[keyof Events]) => void>();

	on<K extends keyof Events>(event: K, cb: (payload: Events[K]) => void): () => void {
		const set = this.listeners.get(event) ?? new Set();
		set.add(cb as (payload: Events[keyof Events]) => void);
		this.listeners.set(event, set);
		return () => this.off(event, cb);
	}

	off<K extends keyof Events>(event: K, cb: (payload: Events[K]) => void): void {
		const set = this.listeners.get(event);
		set?.delete(cb as (payload: Events[keyof Events]) => void);
		if (set && set.size === 0) this.listeners.delete(event);
	}

	onAny(cb: (event: keyof Events, payload: Events[keyof Events]) => void): () => void {
		this.anyListeners.add(cb);
		return () => {
			this.anyListeners.delete(cb);
		};
	}

	emit<K extends keyof Events>(event: K, payload: Events[K]): void {
		for (const cb of this.anyListeners) cb(event, payload as Events[keyof Events]);
		const set = this.listeners.get(event);
		if (!set) return;
		for (const cb of set) cb(payload as Events[keyof Events]);
	}

	clear(): void {
		this.listeners.clear();
		this.anyListeners.clear();
	}
}
