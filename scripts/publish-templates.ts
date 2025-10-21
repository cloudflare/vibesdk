#!/usr/bin/env bun
import { promises as fs } from 'node:fs';
import path from 'node:path';

async function bundleTemplate(name: string) {
	const templateDir = path.resolve('templates', name);
	try {
		await fs.access(templateDir);
	} catch {
		throw new Error(`Template ${name} not found at ${templateDir}`);
	}

	// TODO: implement bundling logic (zip files, upload to R2)
	console.log(`• [stub] bundle + upload template: ${name}`);
}

async function main() {
	const templates = ['arcade', 'rpg-lite'];
	console.log('Publishing templates to R2 (stub)...');
	for (const template of templates) {
		await bundleTemplate(template);
	}
	console.log('Done. Replace stub with real R2 publish flow.');
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
