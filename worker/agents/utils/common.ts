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