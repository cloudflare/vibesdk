import { useEffect, useState } from 'react';
import { SidebarTrigger } from '@/components/ui/sidebar';
import { AuthButton } from '../auth/auth-button';
import { ThemeToggle } from '../theme-toggle';
import { motion } from 'framer-motion';
import { useAuth } from '@/contexts/auth-context';
import { ChevronRight, GithubIcon, AlertCircle } from 'lucide-react';
import { CloudflareLogo } from '../icons/logos';
import { usePlatformStatus } from '@/hooks/use-platform-status';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useLocation } from 'react-router';
import clsx from 'clsx';

export function GlobalHeader() {
	const { user } = useAuth();
	const { status } = usePlatformStatus();
	const [isChangelogOpen, setIsChangelogOpen] = useState(false);
	const hasMaintenanceMessage = Boolean(status.hasActiveMessage && status.globalUserMessage.trim().length > 0);
	const hasChangeLogs = Boolean(status.changeLogs && status.changeLogs.trim().length > 0);
	const { pathname } = useLocation();

	useEffect(() => {
		if (!hasChangeLogs) {
			setIsChangelogOpen(false);
		}
	}, [hasChangeLogs]);

	return (
		<Dialog open={isChangelogOpen} onOpenChange={setIsChangelogOpen}>
			<motion.header
				initial={{ y: -10, opacity: 0 }}
				animate={{ y: 0, opacity: 1 }}
				transition={{ duration: 0.2, ease: 'easeOut' }}
				className={clsx("sticky top-0 z-50", pathname !== "/" && "bg-bg-3")}
			>
				<div className="relative">
					{/* Subtle gradient accent */}
					<div className="absolute inset-0 z-0" />

					{/* Main content */}
					<div className="relative z-10 grid grid-cols-[auto_1fr_auto] items-center gap-4 px-5 py-2">
						{/* Left section */}
						{user ? (
							<motion.div
								whileTap={{ scale: 0.95 }}
								transition={{
									type: 'spring',
									stiffness: 400,
									damping: 17,
								}}
								className='flex items-center'
							>
								<SidebarTrigger className="h-8 w-8 text-text-primary rounded-md hover:bg-orange-50/40 transition-colors duration-200" />
								<CloudflareLogo
									className="flex-shrink-0 mx-auto transition-all duration-300"
									style={{
										width: '28px',
										height: '28px',
										marginLeft: '8px',
									}}
								/>
								{hasMaintenanceMessage && (
									<button
										type="button"
										onClick={hasChangeLogs ? () => setIsChangelogOpen(true) : undefined}
										disabled={!hasChangeLogs}
										className={`flex max-w-full items-center gap-2 rounded-full border border-accent/40 bg-bg-4/80 px-3 ml-4 py-1.5 text-xs text-text-primary shadow-sm backdrop-blur transition-colors hover:bg-accent/10 focus:outline-none focus:ring-2 focus:ring-accent/40 dark:border-accent/30 dark:bg-bg-2/80 md:text-sm${!hasChangeLogs ? ' opacity-50 cursor-not-allowed pointer-events-none' : ''}`}
										aria-label="Platform updates"
									>
										<AlertCircle className="h-4 w-4 text-accent" />
										<span className="truncate max-w-[46ch] md:max-w-[60ch]">{status.globalUserMessage}</span>
										<ChevronRight className="ml-1 h-4 w-4 text-accent" />
									</button>
								)}
							</motion.div>
						) : (
							<div></div>
						)}



						{/* Right section */}
						<motion.div
							initial={{ opacity: 0, x: 10 }}
							animate={{ opacity: 1, x: 0 }}
							transition={{ delay: 0.2 }}
							className="flex flex-wrap items-center justify-end gap-3 justify-self-end"
						>
							<div className="gap-6 flex flex-col justify-between border px-3 bg-bg-4 dark:bg-bg-2 rounded-md py-1.5 border-accent/50 dark:border-accent/50 !border-t-transparent rounded-t-none ml-2 md:ml-6 -mt-2">
								<div className="flex w-full gap-2 items-center">
									<div className='text-text-primary/80 mr-4 text-lg font-medium'>Deploy your own vibe-coding platform</div>
									<div className="flex font-semibold gap-2 items-center bg-accent dark:bg-accent text-white rounded px-2 hover:opacity-80 cursor-pointer" onClick={() => window.open("https://deploy.workers.cloudflare.com/?url=https://github.com/cloudflare/vibesdk", "_blank")}>
										Deploy <CloudflareLogo className='w-5 h-5' color1='#fff' />
									</div>
									<div className="flex font-semibold items-center bg-text-primary text-bg-4 rounded gap-1 px-2 hover:opacity-80 cursor-pointer" onClick={() => window.open("https://github.com/cloudflare/vibesdk", "_blank")} >
										Fork <GithubIcon className="size-4" />
									</div>
								</div>
							</div>
							{/* Disable cost display for now */}
							{/* {user && (
							<CostDisplay
								{...extractUserAnalyticsProps(analytics)}
								loading={analyticsLoading}
								variant="inline"
							/>
						)} */}
							<ThemeToggle />
							<AuthButton />
						</motion.div>
					</div>
				</div>
			</motion.header>
			{hasChangeLogs && (
				<DialogContent className="max-w-xl">
					<DialogHeader>
						<DialogTitle>Platform updates</DialogTitle>
						{status.globalUserMessage && (
							<DialogDescription className="text-sm text-muted-foreground">
								{status.globalUserMessage}
							</DialogDescription>
						)}
					</DialogHeader>
					<ScrollArea className="max-h-[60vh] pr-4">
						<p className="whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">
							{status.changeLogs}
						</p>
					</ScrollArea>
				</DialogContent>
			)}
		</Dialog>
	);
}
