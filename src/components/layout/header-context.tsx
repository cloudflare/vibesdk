import {
	createContext,
	useContext,
	useLayoutEffect,
	useRef,
	useSyncExternalStore,
	type ReactNode,
} from 'react';

export type HeaderContent = {
	leading?: ReactNode;
	trailing?: ReactNode;
};

type HeaderStore = {
	getSnapshot: () => HeaderContent | null;
	setContent: (content: HeaderContent | null) => void;
	subscribe: (listener: () => void) => () => void;
};

function createHeaderStore(): HeaderStore {
	let content: HeaderContent | null = null;
	const listeners = new Set<() => void>();

	return {
		getSnapshot: () => content,
		setContent: (next) => {
			if (Object.is(content, next)) return;
			content = next;
			listeners.forEach((listener) => listener());
		},
		subscribe: (listener) => {
			listeners.add(listener);
			return () => {
				listeners.delete(listener);
			};
		},
	};
}

const HeaderStoreContext = createContext<HeaderStore | null>(null);

export function HeaderProvider({ children }: { children: ReactNode }) {
	const storeRef = useRef<HeaderStore | null>(null);
	if (!storeRef.current) {
		storeRef.current = createHeaderStore();
	}

	return (
		<HeaderStoreContext.Provider value={storeRef.current}>
			{children}
		</HeaderStoreContext.Provider>
	);
}

function useHeaderStore() {
	const store = useContext(HeaderStoreContext);
	if (!store) {
		throw new Error('useHeaderStore must be used within HeaderProvider');
	}
	return store;
}

export function useHeaderContent() {
	const store = useHeaderStore();
	const content = useSyncExternalStore(
		store.subscribe,
		store.getSnapshot,
		store.getSnapshot,
	);

	return {
		content,
		setContent: store.setContent,
	};
}

/** Registers page-specific header slots for the lifetime of the caller. */
export function usePageHeader(content: HeaderContent | null) {
	const store = useHeaderStore();
	const contentRef = useRef(content);
	contentRef.current = content;

	useLayoutEffect(() => {
		store.setContent(contentRef.current);
	});

	useLayoutEffect(() => {
		return () => {
			store.setContent(null);
		};
	}, [store]);
}
