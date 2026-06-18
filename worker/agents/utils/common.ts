import { downloadR2Image, imageToBase64 } from "../../utils/images";
import { ConversationMessage, mapImagesInMultiModalMessage } from "../inferutils/common";

export function extractCommands(rawOutput: string, onlyInstallCommands: boolean = false): string[] {
	const commands: string[] = [];

	// Helper function to check if command is an install command
	const isInstallCommand = (command: string): boolean => {
		return /^(?:npm|yarn|pnpm|bun)\s+(?:install|add)(?:\s|$)/.test(command);
	};

	// Extract commands from code blocks (with or without language indicators)
	// Handles: ```bash, ```sh, ```, ``` command, etc.
	const codeBlockRegex = /```(?:[a-zA-Z]*)?\s*\n?([\s\S]*?)\n?```/gi;
	let codeBlockMatch;
	while ((codeBlockMatch = codeBlockRegex.exec(rawOutput)) !== null) {
		const blockContent = codeBlockMatch[1].trim();
		// Split by newlines and filter out empty lines and comments
		const blockCommands = blockContent
			.split('\n')
			.map((line) => line.trim())
			.filter(
				(line) =>
					line && !line.startsWith('#') && !line.startsWith('//'),
			)
			.map((line) => {
				// Remove shell prompts like $ or >
				return line.replace(/^[$>]\s*/, '');
			})
			.filter((line) => { 
				// Filter by install commands if onlyInstallCommands is true
				return !onlyInstallCommands || isInstallCommand(line);
			});
		commands.push(...blockCommands);
	}

	// Extract inline commands (wrapped in backticks)
	const inlineCommandRegex = /`([^`\n]+)`/g;
	let inlineMatch;
	while ((inlineMatch = inlineCommandRegex.exec(rawOutput)) !== null) {
		const command = inlineMatch[1].trim();
		// Only include if it looks like a command and matches install filter if needed
		if (looksLikeCommand(command)) {
			if (!onlyInstallCommands || isInstallCommand(command)) {
				commands.push(command);
			}
		}
	}

	// Define command patterns based on whether we only want install commands
	let commandPatterns;
	if (onlyInstallCommands) {
		// Only include package manager install/add commands
		commandPatterns = [
			/(?:^|\s)((?:npm|yarn|pnpm|bun)\s+(?:install|add)(?:\s+[^\n]+)?)/gm,
		];
	} else {
		// Include all command patterns
		commandPatterns = [
			// Package managers
			/(?:^|\s)((?:npm|yarn|pnpm|bun)\s+(?:install|add|run|build|start|dev|test)(?:\s+[^\n]+)?)/gm,
			// Directory operations
			/(?:^|\s)(mkdir\s+[^\n]+)/gm,
			/(?:^|\s)(cd\s+[^\n]+)/gm,
			// File operations
			/(?:^|\s)(touch\s+[^\n]+)/gm,
			/(?:^|\s)(cp\s+[^\n]+)/gm,
			/(?:^|\s)(mv\s+[^\n]+)/gm,
			// Git commands
			/(?:^|\s)(git\s+(?:init|clone|add|commit|push|pull)(?:\s+[^\n]+)?)/gm,
			// Build tools
			/(?:^|\s)((?:make|cmake|gradle|mvn)\s+[^\n]+)/gm,
			// Environment setup
			/(?:^|\s)(export\s+[^\n]+)/gm,
			/(?:^|\s)(source\s+[^\n]+)/gm,
		];
	}

	// Extract commands using the appropriate patterns
	for (const pattern of commandPatterns) {
		let match;
		while ((match = pattern.exec(rawOutput)) !== null) {
			const command = match[1].trim();
			if (command && !commands.includes(command)) {
				commands.push(command);
			}
		}
	}

	// Filter commands if onlyInstallCommands is true
	let filteredCommands = [...new Set(commands)];
	if (onlyInstallCommands) {
		// Filter to only keep package manager install/add commands
		filteredCommands = filteredCommands.filter(command => {
			return /^(?:npm|yarn|pnpm|bun)\s+(?:install|add)(?:\s|$)/.test(command);
		});
	}

	return filteredCommands;
}

/**
 * Maximum number of commands to keep in bootstrap history
 * Prevents unbounded growth while allowing sufficient dependency management
 */
export const MAX_BOOTSTRAP_COMMANDS = 50;

/**
 * WHITELIST: Only commands that install/add/remove/update SPECIFIC packages.
 * Supports: scoped packages (@org/pkg), versions (pkg@1.2.3), ranges (^, ~, =).
 */
const PACKAGE_MANAGERS = new Set(['npm', 'yarn', 'pnpm', 'bun']);
const PACKAGE_ACTIONS = new Set(['add', 'install', 'remove', 'uninstall', 'update']);

/**
 * Flag allowlist. Only flags that cannot alter lifecycle-script / trust behaviour are
 * permitted. Flags such as --trust, --unsafe-perm, --allow-scripts, --foreground-scripts
 * are deliberately excluded so they can never reach the bootstrap argv (VEC-A).
 */
const ALLOWED_FLAGS = new Set([
	'-D', '--save-dev', '-d', '--dev',
	'-E', '--save-exact', '--exact',
	'-P', '--save-prod', '--save',
	'-O', '--save-optional', '--save-peer',
	'--no-save', '--legacy-peer-deps',
]);

/**
 * A valid package spec: bare/scoped name with optional version or range.
 * Must NOT contain a protocol (://), which blocks remote URL / git installs that can run
 * untrusted postinstall scripts (VEC-A / VEC-B).
 */
const PACKAGE_SPEC = /^[\w@][\w@/.\-^~=]*$/;

// Defense-in-depth deny list: any shell metacharacter disqualifies the command.
const SHELL_METACHAR = /[;&|`$<>(){}[\]"'\\\n\r]/;

/**
 * Check if a command is valid for bootstrap script.
 * WHITELIST approach: Only allows package management commands with specific package names.
 * 
 * @returns true if command is valid for bootstrap, false otherwise
 * 
 * Valid examples:
 * - "bun add react"
 * - "npm install lodash@^4.17.21"
 * - "bun add @cloudflare/workers@1.0.0"
 * - "bun remove @types/node"
 * - "npm update react-dom@~18.2.0"
 * - "npm install package@>=1.0.0"
 * 
 * Invalid (rejected):
 * - File operations: "rm -rf src/file.tsx", "mv file.txt", "cp -r dir"
 * - Plain installs: "bun install", "npm install"
 * - Run commands: "bun run build", "npm run dev"
 * - Any non-package-manager commands
 */
export function isValidBootstrapCommand(command: string): boolean {
	const trimmed = command.trim();
	if (SHELL_METACHAR.test(trimmed)) return false;

	const tokens = trimmed.split(/\s+/);
	if (tokens.length < 3) return false;

	const [manager, action, ...rest] = tokens;
	if (!PACKAGE_MANAGERS.has(manager)) return false;
	if (!PACKAGE_ACTIONS.has(action)) return false;

	let hasPackageSpec = false;
	for (const token of rest) {
		if (token.startsWith('-')) {
			// Only allowlisted flags may pass; everything else (e.g. --trust) is rejected.
			if (!ALLOWED_FLAGS.has(token)) return false;
		} else {
			// Reject remote URL / git installs and any malformed spec.
			if (token.includes('://') || !PACKAGE_SPEC.test(token)) return false;
			hasPackageSpec = true;
		}
	}
	// At least one concrete package spec is required (rejects "bun install", "bun add --trust").
	return hasPackageSpec;
}

/**
 * Check if a command should NOT be saved to bootstrap.
 * Inverse of isValidBootstrapCommand
 */
export function isBootstrapRuntimeCommand(command: string): boolean {
	return !isValidBootstrapCommand(command);
}

/**
 * Extract package operation key for deduplication.
 * Assumes command has already been validated by isValidBootstrapCommand.
 * 
 * @example
 * getPackageOperationKey("bun add react") -> "add:react"
 * getPackageOperationKey("npm install lodash@^4.0.0") -> "install:lodash@^4.0.0"
 * getPackageOperationKey("bun add @cloudflare/workers") -> "add:@cloudflare/workers"
 */
export function getPackageOperationKey(command: string): string | null {
	if (!isValidBootstrapCommand(command)) return null;

	const [, action, ...rest] = command.trim().split(/\s+/);
	// Normalize token order so "add react react-dom" === "add react-dom react".
	const tokens = rest.slice().sort().join(' ');
	return `${action}:${tokens}`;
}

/**
 * Validate and clean bootstrap commands in a single pass.
 * Validates, deduplicates, and limits size.
 * 
 * @param commands - Raw command list
 * @param maxCommands - Maximum number of commands to keep (defaults to MAX_BOOTSTRAP_COMMANDS)
 * @returns Cleaned command list with metadata about what was removed
 */
export function validateAndCleanBootstrapCommands(
	commands: string[],
	maxCommands: number = MAX_BOOTSTRAP_COMMANDS
): { validCommands: string[]; invalidCommands: string[]; deduplicated: number } {
	const seen = new Map<string, string>();
	const invalidCommands: string[] = [];
	let totalValid = 0;
	
	// validate + deduplicate
	for (const cmd of commands) {
		const key = getPackageOperationKey(cmd);
		if (key) {
			totalValid++;
			seen.set(key, cmd); // Latest wins for duplicates
		} else {
			invalidCommands.push(cmd);
		}
	}
	
	// Extract deduplicated commands and apply size limit (keep most recent)
	const deduplicated = Array.from(seen.values());
	const validCommands = deduplicated.slice(-maxCommands);
	const deduplicatedCount = totalValid - deduplicated.length;
	
	return {
		validCommands,
		invalidCommands,
		deduplicated: deduplicatedCount
	};
}

export function looksLikeCommand(text: string): boolean {
	// Check if the text looks like a shell command
	const commandIndicators = [
		/^(?:npm|yarn|pnpm|bun|node|deno)\s/,
		/^(?:mkdir|cd|touch|cp|mv|rm|ls|cat|grep|find)\s/,
		/^(?:git|svn|hg)\s/,
		/^(?:make|cmake|gcc|clang)\s/,
		/^(?:docker|podman)\s/,
		/^(?:curl|wget)\s/,
		/^(?:python|pip|conda)\s/,
		/^(?:ruby|gem|bundle)\s/,
		/^(?:go|cargo|rustc)\s/,
		/^(?:java|javac|mvn|gradle)\s/,
		/^(?:php|composer)\s/,
		/^(?:export|source|alias)\s/,
	];

	return commandIndicators.some((pattern) => pattern.test(text));
}

export async function prepareMessagesForInference(env: Env, messages: ConversationMessage[]) : Promise<ConversationMessage[]> {
    // For each multimodal image, convert the image to base64 data url
    const processedMessages = await Promise.all(messages.map(m => {
        return mapImagesInMultiModalMessage(structuredClone(m), async (c) => {
            const url = c.image_url.url;
            if (url.includes('base64,')) {
                return c;
            }
            const image = await downloadR2Image(env, url);
            return {
                ...c,
                image_url: {
                    ...c.image_url,
                    url: await imageToBase64(env, image)
                },
            };
        });
    }));
    return processedMessages;
}