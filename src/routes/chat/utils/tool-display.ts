import type { ToolEvent } from './message-helpers';

function asString(value: unknown): string | undefined {
	return typeof value === 'string' && value.trim().length > 0
		? value.trim()
		: undefined;
}

function pickString(
	args: Record<string, unknown> | undefined,
	...keys: string[]
): string | undefined {
	if (!args) return undefined;
	for (const key of keys) {
		const value = asString(args[key]);
		if (value) return value;
	}
	return undefined;
}

function pickStringArray(
	args: Record<string, unknown> | undefined,
	...keys: string[]
): string[] {
	if (!args) return [];
	for (const key of keys) {
		const value = args[key];
		if (Array.isArray(value)) {
			return value.filter((item): item is string => typeof item === 'string' && item.length > 0);
		}
		const single = asString(value);
		if (single) return [single];
	}
	return [];
}

/** Shorten a path for display: keep last 2 segments when long. */
export function shortenPath(path: string, max = 42): string {
	const normalized = path.replace(/\\/g, '/');
	if (normalized.length <= max) return normalized;
	const parts = normalized.split('/').filter(Boolean);
	if (parts.length <= 2) {
		return `…${normalized.slice(-(max - 1))}`;
	}
	const tail = parts.slice(-2).join('/');
	return tail.length + 2 <= max ? `…/${tail}` : `…${tail.slice(-(max - 1))}`;
}

function quote(value: string, max = 48): string {
	const trimmed = value.length > max ? `${value.slice(0, max - 1)}…` : value;
	return `"${trimmed}"`;
}

function pathLabel(path: string | undefined): string {
	return path ? shortenPath(path) : 'file';
}

export function pickToolPath(args?: Record<string, unknown>): string | undefined {
	return pickString(args, 'path', 'filePath', 'file');
}

export function pickToolPaths(args?: Record<string, unknown>): string[] {
	const multi = pickStringArray(args, 'paths');
	if (multi.length > 0) return multi;
	const single = pickToolPath(args);
	return single ? [single] : [];
}

type VerbSet = { start: string; success: string; error: string };

const VERBS: Record<string, VerbSet> = {
	read: { start: 'Reading', success: 'Read', error: 'Failed to read' },
	write: { start: 'Writing', success: 'Wrote', error: 'Failed to write' },
	edit: { start: 'Editing', success: 'Edited', error: 'Failed to edit' },
	delete: { start: 'Deleting', success: 'Deleted', error: 'Failed to delete' },
	list: { start: 'Listing', success: 'Listed', error: 'Failed to list' },
	find: { start: 'Finding', success: 'Find', error: 'Failed to find' },
	grep: { start: 'Searching', success: 'Searched', error: 'Failed to search' },
	bash: { start: 'Running', success: 'Ran', error: 'Failed to run' },
	commit: { start: 'Committing', success: 'Committed', error: 'Failed to commit' },
	deploy_space: { start: 'Deploying', success: 'Deployed', error: 'Failed to deploy' },
	deploy_preview: { start: 'Deploying preview', success: 'Deployed preview', error: 'Failed to deploy preview' },
	set_title: { start: 'Setting title', success: 'Set title', error: 'Failed to set title' },
	ask_questions: { start: 'Asking', success: 'Asked', error: 'Failed to ask' },
	get_browser_console_logs: {
		start: 'Checking browser console',
		success: 'Checked browser console',
		error: 'Failed to check browser console',
	},
	activate_skill: { start: 'Loading skill', success: 'Loaded skill', error: 'Failed to load skill' },
	web_search: { start: 'Searching the web', success: 'Searched the web', error: 'Web search failed' },
	git: { start: 'Running git', success: 'Ran git', error: 'Git failed' },
	read_files: { start: 'Reading files', success: 'Read files', error: 'Failed to read files' },
	regenerate_file: { start: 'Regenerating', success: 'Regenerated', error: 'Failed to regenerate' },
	generate_files: { start: 'Generating files', success: 'Generated files', error: 'Failed to generate files' },
	exec_commands: { start: 'Running commands', success: 'Ran commands', error: 'Commands failed' },
	run_analysis: { start: 'Analyzing', success: 'Analyzed', error: 'Analysis failed' },
	get_runtime_errors: { start: 'Checking runtime errors', success: 'Checked runtime errors', error: 'Failed to check runtime errors' },
	get_logs: { start: 'Fetching logs', success: 'Fetched logs', error: 'Failed to fetch logs' },
	deep_debug: { start: 'Debugging', success: 'Finished debugging', error: 'Debugging failed' },
	queue_request: { start: 'Queuing request', success: 'Queued request', error: 'Failed to queue request' },
	submit_feedback: { start: 'Submitting feedback', success: 'Submitted feedback', error: 'Failed to submit feedback' },
	rename_project: { start: 'Renaming project', success: 'Renamed project', error: 'Failed to rename project' },
	alter_blueprint: { start: 'Updating blueprint', success: 'Updated blueprint', error: 'Failed to update blueprint' },
	wait_for_generation: { start: 'Waiting for generation', success: 'Generation ready', error: 'Wait failed' },
	wait_for_debug: { start: 'Waiting for debug', success: 'Debug ready', error: 'Wait failed' },
	wait: { start: 'Waiting', success: 'Waited', error: 'Wait failed' },
};

function verbFor(name: string, status: ToolEvent['status']): string {
	const set = VERBS[name];
	if (set) return set[status === 'start' ? 'start' : status === 'error' ? 'error' : 'success'];
	const pretty = name.replace(/_/g, ' ');
	if (status === 'start') return `Running ${pretty}`;
	if (status === 'error') return `Failed ${pretty}`;
	return pretty.charAt(0).toUpperCase() + pretty.slice(1);
}

function detailFor(event: ToolEvent): string | undefined {
	const { name, args } = event;
	const path = pickToolPath(args);
	const paths = pickToolPaths(args);

	switch (name) {
		case 'read':
		case 'write':
		case 'edit':
		case 'delete':
		case 'list':
		case 'regenerate_file':
			return path ? pathLabel(path) : undefined;
		case 'read_files':
			if (paths.length === 1) return pathLabel(paths[0]);
			if (paths.length > 1) return `${paths.length} files`;
			return undefined;
		case 'find': {
			const pattern = pickString(args, 'pattern', 'glob');
			return pattern ? pattern : undefined;
		}
		case 'grep': {
			const query = pickString(args, 'query', 'pattern', 'search');
			const include = pickString(args, 'include');
			if (query && include) return `${quote(query)} in ${include}`;
			if (query) return quote(query);
			return undefined;
		}
		case 'bash':
		case 'exec_commands': {
			const script = pickString(args, 'script', 'command');
			if (script) return quote(script, 40);
			const commands = pickStringArray(args, 'commands');
			if (commands.length === 1) return quote(commands[0], 40);
			if (commands.length > 1) return `${commands.length} commands`;
			return undefined;
		}
		case 'commit': {
			const message = pickString(args, 'message');
			return message ? quote(message, 40) : undefined;
		}
		case 'git': {
			const command = pickString(args, 'command');
			const message = pickString(args, 'message');
			if (command === 'commit' && message) return `commit ${quote(message, 32)}`;
			return command;
		}
		case 'set_title':
		case 'rename_project': {
			const title = pickString(args, 'title', 'newName', 'name');
			return title ? quote(title, 40) : undefined;
		}
		case 'web_search': {
			const query = pickString(args, 'query');
			const url = pickString(args, 'url');
			if (query) return quote(query, 40);
			if (url) return shortenPath(url, 40);
			return undefined;
		}
		case 'activate_skill': {
			const skill = pickString(args, 'skill', 'name', 'id', 'skill_id');
			return skill;
		}
		case 'ask_questions': {
			const questions = args?.questions;
			if (Array.isArray(questions) && questions.length > 0) {
				return questions.length === 1 ? '1 question' : `${questions.length} questions`;
			}
			return undefined;
		}
		case 'get_browser_console_logs': {
			const url = pickString(args, 'url');
			return url ? shortenPath(url, 40) : undefined;
		}
		case 'queue_request': {
			const req = pickString(args, 'modificationRequest', 'message');
			return req ? quote(req, 40) : undefined;
		}
		case 'deep_debug': {
			const issue = pickString(args, 'issue');
			return issue ? quote(issue, 40) : undefined;
		}
		case 'generate_files': {
			const phase = pickString(args, 'phase_name', 'phaseName');
			return phase;
		}
		default:
			return path ? pathLabel(path) : undefined;
	}
}

/**
 * Plain-English one-line summary for a tool event.
 * e.g. "Reading src/App.tsx…", "Read src/App.tsx", "Failed to read src/App.tsx"
 */
export function getToolSummary(event: ToolEvent): string {
	const verb = verbFor(event.name, event.status);
	const detail = detailFor(event);
	const ellipsis = event.status === 'start' ? '…' : '';
	if (!detail) return `${verb}${ellipsis}`;
	return `${verb} ${detail}${ellipsis}`;
}

/** Noun used when collapsing multiple consecutive tools of the same name. */
function groupNoun(name: string, count: number): string {
	const nouns: Record<string, [string, string]> = {
		read: ['file', 'files'],
		write: ['file', 'files'],
		edit: ['file', 'files'],
		delete: ['file', 'files'],
		list: ['directory', 'directories'],
		find: ['search', 'searches'],
		grep: ['search', 'searches'],
		bash: ['command', 'commands'],
		exec_commands: ['command', 'commands'],
		read_files: ['file batch', 'file batches'],
		commit: ['commit', 'commits'],
		web_search: ['search', 'searches'],
		ask_questions: ['question set', 'question sets'],
	};
	const pair = nouns[name] ?? ['step', 'steps'];
	return count === 1 ? pair[0] : pair[1];
}

/**
 * Summary for a collapsed group of consecutive same-name tools.
 * e.g. "Read 4 files", "Reading 2 files…", "Edited 3 files"
 */
export function getToolGroupSummary(events: ToolEvent[]): string {
	if (events.length === 0) return '';
	if (events.length === 1) return getToolSummary(events[0]);

	const name = events[0].name;
	const anyRunning = events.some((e) => e.status === 'start');
	const anyError = events.some((e) => e.status === 'error');
	const status: ToolEvent['status'] = anyRunning ? 'start' : anyError ? 'error' : 'success';
	const verb = verbFor(name, status);
	const noun = groupNoun(name, events.length);
	const ellipsis = status === 'start' ? '…' : '';
	return `${verb} ${events.length} ${noun}${ellipsis}`;
}

export function getGroupStatus(events: ToolEvent[]): ToolEvent['status'] {
	if (events.some((e) => e.status === 'start')) return 'start';
	if (events.some((e) => e.status === 'error')) return 'error';
	return 'success';
}
