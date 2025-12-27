import { isRecord } from './utils';

/**
 * Blueprint structure as streamed from the agent.
 */
export type Blueprint = {
	title?: string;
	projectName?: string;
	description?: string;
	detailedDescription?: string;
	frameworks?: string[];
	views?: Array<{ name: string; description: string }>;
	plan?: string[];
	implementationRoadmap?: Array<{ phase: string; description: string }>;
};

/**
 * Converts a Blueprint object to readable Markdown.
 */
export function blueprintToMarkdown(bp: Blueprint): string {
	const lines: string[] = [];
	const title = bp.title ?? bp.projectName ?? 'Blueprint';
	lines.push(`# ${title}`);
	if (bp.description) {
		lines.push('');
		lines.push(bp.description);
	}
	if (bp.frameworks?.length) {
		lines.push('');
		lines.push('## Frameworks');
		for (const f of bp.frameworks) lines.push(`- ${f}`);
	}
	if (bp.detailedDescription) {
		lines.push('');
		lines.push('## Details');
		lines.push(bp.detailedDescription);
	}
	if (bp.views?.length) {
		lines.push('');
		lines.push('## Views');
		for (const v of bp.views) lines.push(`- **${v.name}**: ${v.description}`);
	}
	if (bp.plan?.length) {
		lines.push('');
		lines.push('## Plan');
		bp.plan.forEach((s, idx) => lines.push(`${idx + 1}. ${s}`));
	}
	if (bp.implementationRoadmap?.length) {
		lines.push('');
		lines.push('## Roadmap');
		for (const p of bp.implementationRoadmap) lines.push(`- **${p.phase}**: ${p.description}`);
	}
	return lines.join('\n');
}

function extractJsonStringField(raw: string, key: string): string | null {
	const re = new RegExp(`"${key}"\\s*:\\s*"([^"\\n\\r]*)"`);
	const m = re.exec(raw);
	return m?.[1] ?? null;
}

/**
 * Parses streaming blueprint chunks (JSON or Markdown) into Markdown.
 * Handles partial JSON gracefully by extracting available fields.
 */
export class BlueprintStreamParser {
	private buffer = '';

	/**
	 * Appends a chunk and returns the current Markdown representation.
	 */
	append(chunk: string): string {
		this.buffer += chunk;
		return this.toMarkdown();
	}

	/**
	 * Returns the current Markdown representation of the buffer.
	 */
	toMarkdown(): string {
		const startsLikeJson = /^\s*[\[{]/.test(this.buffer);
		if (!startsLikeJson) {
			return this.buffer;
		}

		try {
			const parsed = JSON.parse(this.buffer) as unknown;
			if (isRecord(parsed)) {
				return blueprintToMarkdown(parsed as Blueprint);
			}
		} catch {
			// Partial JSON: extract available fields
		}

		const title =
			extractJsonStringField(this.buffer, 'title') ??
			extractJsonStringField(this.buffer, 'projectName') ??
			'Blueprint';
		const desc = extractJsonStringField(this.buffer, 'description');
		const lines = [`# ${title}`, '', desc ? desc : '*Generating blueprint...*'];
		return lines.join('\n');
	}

	/**
	 * Returns the raw buffer contents.
	 */
	getRaw(): string {
		return this.buffer;
	}

	/**
	 * Clears the buffer.
	 */
	clear(): void {
		this.buffer = '';
	}
}
