import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Zap } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import clsx from 'clsx';

export interface TerminalLog {
	id: string;
	content: string;
	type: 'command' | 'stdout' | 'stderr' | 'info' | 'error' | 'warn' | 'debug';
	timestamp: number;
	source?: string;
}

interface TerminalProps {
	logs: TerminalLog[];
	onCommand: (command: string) => void;
	isConnected: boolean;
	className?: string;
	showControls?: boolean;
	onSearch?: (query: string) => void;
	onCopyLogs?: () => void;
}

export function Terminal({ 
	logs, 
	onCommand, 
	isConnected, 
	className 
}: TerminalProps) {
	const [command, setCommand] = useState('');
	const [commandHistory, setCommandHistory] = useState<string[]>([]);
	const [historyIndex, setHistoryIndex] = useState(-1);
	
	const inputRef = useRef<HTMLInputElement>(null);
	const scrollAreaRef = useRef<HTMLDivElement>(null);
	const endOfLogsRef = useRef<HTMLDivElement>(null);

	// Auto-scroll to bottom when new logs arrive
	useEffect(() => {
		if (endOfLogsRef.current) {
			endOfLogsRef.current.scrollIntoView({ behavior: 'smooth' });
		}
	}, [logs]);

	// Focus input when terminal is mounted
	useEffect(() => {
		if (inputRef.current) {
			inputRef.current.focus();
		}
	}, []);

	const handleCommand = useCallback((cmd: string) => {
		if (!cmd.trim() || !isConnected) return;

		// Add to command history
		setCommandHistory(prev => [...prev.slice(-49), cmd]); // Keep last 50 commands
		setHistoryIndex(-1);
		
		// Send command
		onCommand(cmd.trim());
		setCommand('');
	}, [onCommand, isConnected]);

	const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
		if (e.key === 'Enter') {
			e.preventDefault();
			handleCommand(command);
		} else if (e.key === 'ArrowUp') {
			e.preventDefault();
			if (commandHistory.length > 0) {
				const newIndex = historyIndex === -1 
					? commandHistory.length - 1 
					: Math.max(0, historyIndex - 1);
				setHistoryIndex(newIndex);
				setCommand(commandHistory[newIndex]);
			}
		} else if (e.key === 'ArrowDown') {
			e.preventDefault();
			if (historyIndex >= 0) {
				const newIndex = historyIndex + 1;
				if (newIndex >= commandHistory.length) {
					setHistoryIndex(-1);
					setCommand('');
				} else {
					setHistoryIndex(newIndex);
					setCommand(commandHistory[newIndex]);
				}
			}
		} else if (e.ctrlKey && e.key === 'l') {
			e.preventDefault();
			// Clear terminal - we don't implement this here as it would need to be handled by parent
		}
	}, [command, commandHistory, historyIndex, handleCommand]);

	const getLogTypeColor = (type: TerminalLog['type']) => {
		switch (type) {
			case 'command':
				return 'text-[#f6821f] dark:text-[#f6821f]'; // Cloudflare orange
			case 'stdout':
				return 'text-green-600 dark:text-green-400';
			case 'stderr':
			case 'error':
				return 'text-red-600 dark:text-red-400';
			case 'warn':
				return 'text-amber-600 dark:text-yellow-400';
			case 'info':
				return 'text-blue-600 dark:text-blue-400';
			case 'debug':
				return 'text-gray-500 dark:text-gray-400';
			default:
				return 'text-gray-700 dark:text-gray-300';
		}
	};

	return (
		<div className={clsx(
			'flex flex-col h-full font-mono text-sm',
			'bg-white dark:bg-[#1d1e1e]',
			className
		)}>

			{/* Terminal Output */}
			<div className="flex-1 min-h-0 overflow-hidden bg-gray-25 dark:bg-[#1d1e1e]">
				<ScrollArea 
					ref={scrollAreaRef}
					className="h-full terminal-scroll"
				>
					<div className="p-4 space-y-2">
						{logs.length === 0 ? (
							<div className={clsx(
								"flex flex-col items-center justify-center py-12 text-center",
								"text-gray-500 dark:text-gray-400"
							)}>
								<Zap className="size-8 mb-3 text-gray-300 dark:text-gray-600" />
								<p className="text-sm font-medium mb-1">
									Terminal Ready
								</p>
								<p className="text-xs text-gray-400 dark:text-gray-500">
									Start by running a command to see output here
								</p>
							</div>
						) : (
							logs.map((log) => (
								<div
									key={log.id}
									className={clsx(
										'group flex items-start gap-3 py-1.5 px-2 -mx-2 rounded-md',
										'hover:bg-gray-50 dark:hover:bg-[#292929]/50',
										'transition-colors duration-150'
									)}
								>
									<div className="flex-shrink-0 mt-0.5">
										<span className="text-xs text-gray-400 dark:text-gray-500 font-mono">
											{new Date(log.timestamp).toLocaleTimeString('en-US', {
												hour12: false,
												hour: '2-digit',
												minute: '2-digit',
												second: '2-digit'
											})}
										</span>
									</div>
									<div className="flex-1 min-w-0">
										<div className={clsx(
											'font-mono text-sm whitespace-pre-wrap break-words leading-relaxed',
											getLogTypeColor(log.type)
										)}>
											{log.type === 'command' && (
												<span className="text-[#f6821f] font-semibold mr-1">$</span>
											)}
											{log.type === 'stderr' && (
												<span className="text-red-500 dark:text-red-400 mr-1">❌</span>
											)}
											{log.type === 'error' && (
												<span className="text-red-500 dark:text-red-400 mr-1">🚫</span>
											)}
											{log.type === 'warn' && (
												<span className="text-amber-500 dark:text-yellow-400 mr-1">⚠️</span>
											)}
											{log.type === 'info' && (
												<span className="text-blue-500 dark:text-blue-400 mr-1">ℹ️</span>
											)}
											{log.type === 'debug' && (
												<span className="text-gray-500 dark:text-gray-400 mr-1">🐛</span>
											)}
											{log.content}
										</div>
									</div>
								</div>
							))
						)}
						<div ref={endOfLogsRef} />
					</div>
				</ScrollArea>
			</div>

			{/* Command Input */}
			<div className={clsx(
				'flex-shrink-0 px-4 py-3',
				'bg-gray-50 dark:bg-[#1f2020]',
				'border-t border-gray-200 dark:border-gray-700'
			)}>
				<div className="flex items-center gap-3">
					<div className="flex items-center gap-2">
						<span className={clsx(
							"text-lg font-bold select-none",
							isConnected 
								? "text-[#f6821f]" 
								: "text-gray-400 dark:text-gray-600"
						)}>
							$
						</span>
					</div>
					<Input
						ref={inputRef}
						value={command}
						onChange={(e) => setCommand(e.target.value)}
						onKeyDown={handleKeyDown}
						placeholder={isConnected ? "Type your command here..." : "Terminal not connected"}
						disabled={!isConnected}
						className={clsx(
							"flex-1 bg-transparent border-none p-0 h-auto text-sm font-mono",
							"text-gray-800 dark:text-gray-200",
							"placeholder:text-gray-500 dark:placeholder:text-gray-400",
							"focus-visible:ring-0 focus-visible:ring-offset-0",
							"disabled:opacity-50 disabled:cursor-not-allowed"
						)}
					/>
				</div>
				<div className="mt-2 flex items-center justify-between">
					<div className="text-xs text-gray-500 dark:text-gray-400">
						{isConnected ? (
							<div className="flex items-center gap-4">
								<span className="flex items-center gap-1">
									Press 
									<kbd className="px-1.5 py-0.5 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded text-xs font-mono">↑</kbd>
									<kbd className="px-1.5 py-0.5 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded text-xs font-mono">↓</kbd>
									for history
								</span>
							</div>
						) : (
							<div className="flex items-center gap-2">
								<div className="size-1.5 rounded-full bg-red-500 animate-pulse" />
								Waiting for connection...
							</div>
						)}
					</div>
					{commandHistory.length > 0 && (
						<div className="text-xs text-gray-400 dark:text-gray-500">
							{commandHistory.length} command{commandHistory.length !== 1 ? 's' : ''} in history
						</div>
					)}
				</div>
			</div>
		</div>
	);
}