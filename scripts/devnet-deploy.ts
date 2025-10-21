import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');
const PROGRAM_IDS_FILE = path.resolve(ROOT, 'app/web/lib/ids.ts');

const TEMPLATE = `export const PROGRAM_IDS = {\n\tpoints: '',\n\tquests: '',\n\tescrow: '',\n\tregistry: '',\n} as const;\n`; // TODO: populate after Anchor deploy

async function ensureProgramIdsFile() {
	await fs.mkdir(path.dirname(PROGRAM_IDS_FILE), { recursive: true });
	try {
		await fs.access(PROGRAM_IDS_FILE);
		return false;
	} catch {
		await fs.writeFile(PROGRAM_IDS_FILE, TEMPLATE, 'utf8');
		return true;
	}
}

async function main() {
	console.log('⚙️  FARTNODE devnet deploy stub running');
	console.log('TODO: implement Anchor deployment pipeline and write program IDs.');
	const created = await ensureProgramIdsFile();
	if (created) {
		console.log(`Created stub program ID map at ${PROGRAM_IDS_FILE}`);
	} else {
		console.log('Program ID map already exists – update once deployments succeed.');
	}
}

main().catch((error) => {
	console.error('Devnet deploy script failed', error);
	process.exit(1);
});
