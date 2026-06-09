import type { LucideIcon } from 'lucide-react';
import { Rocket, Brain, Code, Bug, Settings } from 'lucide-react';

export interface WorkflowTab {
	id: string;
	label: string;
	icon: LucideIcon;
	description: string;
	patterns?: string[];
}

export const WORKFLOW_TABS = {
	quickstart: {
		id: 'quickstart',
		label: 'Quick Start',
		icon: Rocket,
		description: 'Most commonly customized settings',
		patterns: ['template', 'blueprint', 'conversational'],
	},
	planning: {
		id: 'planning',
		label: 'Planning',
		icon: Brain,
		description: 'Project planning and setup',
		patterns: ['phase', 'project', 'suggestion', 'generation'],
	},
	coding: {
		id: 'coding',
		label: 'Coding',
		icon: Code,
		description: 'Development and implementation',
		patterns: ['implementation', 'file', 'regeneration'],
	},
	debugging: {
		id: 'debugging',
		label: 'Debugging',
		icon: Bug,
		description: 'Code fixing and review',
		patterns: ['fixer', 'fix', 'review', 'debug'],
	},
	advanced: {
		id: 'advanced',
		label: 'Advanced',
		icon: Settings,
		description: 'Specialized operations',
		patterns: ['screenshot', 'analysis', 'vision'],
	},
} as const;

export type WorkflowTabId = keyof typeof WORKFLOW_TABS;
