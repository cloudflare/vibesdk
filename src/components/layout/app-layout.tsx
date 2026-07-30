import React from 'react';
import { Outlet } from 'react-router';
import { SidebarProvider, useSidebar } from '@cloudflare/kumo';
import { AppSidebar } from './app-sidebar';
import { GlobalHeader } from './global-header';
import { HeaderProvider } from './header-context';

const SIDEBAR_COOKIE_NAME = 'sidebar_state';
const SIDEBAR_COOKIE_MAX_AGE = 60 * 60 * 24 * 7;
const SIDEBAR_KEYBOARD_SHORTCUT = 'b';

interface AppLayoutProps {
	children?: React.ReactNode;
}

function SidebarKeyboardShortcut() {
	const { toggleSidebar } = useSidebar();

	React.useEffect(() => {
		const handleKeyDown = (event: KeyboardEvent) => {
			if (
				event.key === SIDEBAR_KEYBOARD_SHORTCUT &&
				(event.metaKey || event.ctrlKey)
			) {
				event.preventDefault();
				toggleSidebar();
			}
		};

		window.addEventListener('keydown', handleKeyDown);
		return () => window.removeEventListener('keydown', handleKeyDown);
	}, [toggleSidebar]);

	return null;
}

function persistSidebarState(open: boolean) {
	document.cookie = `${SIDEBAR_COOKIE_NAME}=${open}; path=/; max-age=${SIDEBAR_COOKIE_MAX_AGE}`;
}

function getSidebarDefaultOpen(): boolean {
	const match = document.cookie.match(
		new RegExp(`(?:^|; )${SIDEBAR_COOKIE_NAME}=([^;]*)`),
	);
	if (!match) return true;
	return match[1] === 'true';
}

export function AppLayout({ children }: AppLayoutProps) {
	const defaultOpen = React.useMemo(() => getSidebarDefaultOpen(), []);

	return (
		<SidebarProvider
			defaultOpen={defaultOpen}
			collapsible="icon"
			resizable={false}
			mobileBreakpoint={768}
			// peekable
			onOpenChange={persistSidebarState}
			className="vibesdk-sidebar-wrapper"
		>
			<HeaderProvider>
				<SidebarKeyboardShortcut />
				<AppSidebar />
				<main className="bg-kumo-canvas flex flex-col h-screen relative flex-1 min-w-0 overflow-hidden">
					<GlobalHeader />
					<div className="flex-1 min-h-0 overflow-auto bg-kumo-canvas">
						{children || <Outlet />}
					</div>
				</main>
			</HeaderProvider>
		</SidebarProvider>
	);
}
