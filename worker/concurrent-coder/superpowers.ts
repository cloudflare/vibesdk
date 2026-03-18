/**
 * Superpowers / Skills loader.
 *
 * Reads markdown prompt files from the R2 TEMPLATES bucket
 * (path prefix: superpowers/) and makes them available as system
 * prompt fragments that agents can incorporate.
 *
 * Skills are also served to the frontend via the API for the
 * Skills Manager UI.
 */

import type { Superpower } from './types';

const SUPERPOWERS_PREFIX = 'superpowers/';

/**
 * List all available superpowers (from R2 bucket).
 */
export async function listSuperpowers(env: Env): Promise<Superpower[]> {
	const list = await env.TEMPLATES_BUCKET.list({ prefix: SUPERPOWERS_PREFIX });
	const powers: Superpower[] = [];

	for (const obj of list.objects) {
		const filename = obj.key.replace(SUPERPOWERS_PREFIX, '');
		if (!filename.endsWith('.md')) continue;

		const body = await env.TEMPLATES_BUCKET.get(obj.key);
		if (!body) continue;

		const content = await body.text();
		const name = filename
			.replace('.md', '')
			.replace(/-/g, ' ')
			.replace(/\b\w/g, (c) => c.toUpperCase());

		powers.push({ name, filename, content });
	}

	return powers;
}

/**
 * Load specific superpowers by filename.
 * Returns their content concatenated for use as a system prompt section.
 */
export async function loadSuperpowerPrompts(
	env: Env,
	filenames: string[],
): Promise<string> {
	if (filenames.length === 0) return '';

	const parts: string[] = [];

	for (const filename of filenames) {
		const key = `${SUPERPOWERS_PREFIX}${filename}`;
		const obj = await env.TEMPLATES_BUCKET.get(key);
		if (!obj) continue;
		const content = await obj.text();
		parts.push(`## Skill: ${filename}\n${content}`);
	}

	return parts.join('\n\n');
}

/**
 * Upload a superpower file (for Skills Manager).
 */
export async function uploadSuperpower(
	env: Env,
	filename: string,
	content: string,
): Promise<void> {
	const key = `${SUPERPOWERS_PREFIX}${filename}`;
	await env.TEMPLATES_BUCKET.put(key, content, {
		httpMetadata: { contentType: 'text/markdown' },
	});
}

/**
 * Delete a superpower file.
 */
export async function deleteSuperpower(
	env: Env,
	filename: string,
): Promise<void> {
	const key = `${SUPERPOWERS_PREFIX}${filename}`;
	await env.TEMPLATES_BUCKET.delete(key);
}
