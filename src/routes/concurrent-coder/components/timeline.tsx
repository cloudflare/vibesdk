import { useEffect, useRef } from 'react';

interface TimelineEvent {
	id: string;
	sessionId: string;
	agent: string;
	action: string;
	detail: string;
	timestamp: string;
}

const AGENT_COLORS: Record<string, string> = {
	orchestrator: 'bg-purple-500',
	architect: 'bg-blue-500',
	coder: 'bg-green-500',
	tester: 'bg-yellow-500',
	debugger: 'bg-orange-500',
	reviewer: 'bg-red-500',
	deployer: 'bg-cyan-500',
};

interface TimelineProps {
	events: TimelineEvent[];
}

export function Timeline({ events }: TimelineProps) {
	const bottomRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
	}, [events.length]);

	if (events.length === 0) {
		return (
			<div className="flex items-center justify-center p-8 text-muted-foreground">
				No events yet. Start a session to see the timeline.
			</div>
		);
	}

	return (
		<div className="space-y-2 overflow-y-auto max-h-[500px] p-4">
			{events.map((event) => {
				const color = AGENT_COLORS[event.agent] ?? 'bg-gray-500';
				const time = new Date(event.timestamp).toLocaleTimeString();
				return (
					<div key={event.id} className="flex items-start gap-3">
						<div className="flex flex-col items-center">
							<div className={`w-3 h-3 rounded-full ${color} mt-1`} />
							<div className="w-px h-full bg-border" />
						</div>
						<div className="flex-1 pb-3">
							<div className="flex items-center gap-2 text-sm">
								<span className="font-semibold capitalize">{event.agent}</span>
								<span className="text-muted-foreground">·</span>
								<span className="text-muted-foreground text-xs">{time}</span>
							</div>
							<p className="text-sm text-muted-foreground mt-0.5">{event.detail}</p>
						</div>
					</div>
				);
			})}
			<div ref={bottomRef} />
		</div>
	);
}
