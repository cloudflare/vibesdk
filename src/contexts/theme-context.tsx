import React, {
	createContext,
	useCallback,
	useContext,
	useEffect,
	useMemo,
	useState,
	useSyncExternalStore,
} from 'react';

type Theme = 'light' | 'dark' | 'system';
type ResolvedTheme = 'light' | 'dark';

interface ThemeContextType {
	theme: Theme;
	resolvedTheme: ResolvedTheme;
	setTheme: (theme: Theme) => void;
}

const MEDIA_QUERY = '(prefers-color-scheme: dark)';

function getSystemTheme(): ResolvedTheme {
	return window.matchMedia(MEDIA_QUERY).matches ? 'dark' : 'light';
}

function subscribeSystemTheme(onStoreChange: () => void) {
	const mediaQuery = window.matchMedia(MEDIA_QUERY);
	mediaQuery.addEventListener('change', onStoreChange);
	return () => mediaQuery.removeEventListener('change', onStoreChange);
}

function resolveTheme(theme: Theme, systemTheme: ResolvedTheme): ResolvedTheme {
	return theme === 'system' ? systemTheme : theme;
}

function applyResolvedTheme(resolved: ResolvedTheme) {
	window.document.documentElement.dataset.mode = resolved;
}

const ThemeContext = createContext<ThemeContextType | null>(null);

export const useTheme = () => {
	const context = useContext(ThemeContext);
	if (!context) {
		throw new Error('useTheme must be used within a ThemeProvider');
	}
	return context;
};

interface ThemeProviderProps {
	children: React.ReactNode;
}

export function ThemeProvider({ children }: ThemeProviderProps) {
	const [theme, setThemeState] = useState<Theme>(() => {
		const savedTheme = localStorage.getItem('theme') as Theme | null;
		return savedTheme === 'light' || savedTheme === 'dark' || savedTheme === 'system'
			? savedTheme
			: 'system';
	});

	const systemTheme = useSyncExternalStore(
		subscribeSystemTheme,
		getSystemTheme,
		() => 'light' as ResolvedTheme,
	);

	const resolvedTheme = resolveTheme(theme, systemTheme);

	useEffect(() => {
		applyResolvedTheme(resolvedTheme);
	}, [resolvedTheme]);

	const setTheme = useCallback((newTheme: Theme) => {
		setThemeState(newTheme);
		localStorage.setItem('theme', newTheme);
	}, []);

	const value = useMemo(
		() => ({ theme, resolvedTheme, setTheme }),
		[theme, resolvedTheme, setTheme],
	);

	return (
		<ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
	);
}
