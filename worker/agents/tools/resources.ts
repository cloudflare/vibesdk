export interface Resources {
	files?: {
		mode: 'read' | 'write';
		paths: string[];
	};
	sandbox?: {
		operation: 'exec' | 'analysis' | 'deploy' | 'read';
	};
	blueprint?: boolean;
	gitCommit?: boolean;
}

export function mergeResources(target: Resources, source: Resources): void {
	// Merge files
	if (source.files) {
		if (target.files) {
			// If either has empty paths (all files), result is all files
			if (target.files.paths.length === 0 || source.files.paths.length === 0) {
				target.files.paths = [];
			} else {
				// Merge paths and deduplicate
				const combined = [...target.files.paths, ...source.files.paths];
				target.files.paths = Array.from(new Set(combined));
			}
			// Escalate mode to write if either is write
			if (source.files.mode === 'write') {
				target.files.mode = 'write';
			}
		} else {
			target.files = { ...source.files, paths: [...source.files.paths] };
		}
	}

	// Merge sandbox (last one wins, they should be the same for same tool)
	if (source.sandbox) {
		target.sandbox = { ...source.sandbox };
	}

	// Merge blueprint
	if (source.blueprint) {
		target.blueprint = true;
	}

	// Merge gitCommit
	if (source.gitCommit) {
		target.gitCommit = true;
	}
}

/**
 * Check if two file path arrays overlap
 */
function pathsOverlap(paths1: string[], paths2: string[]): boolean {
	// Empty array means "all files"
	if (paths1.length === 0 || paths2.length === 0) {
		return true;
	}

	// Check for exact path overlap
	const set1 = new Set(paths1);
	return paths2.some(p => set1.has(p));
}

/**
 * Determine if two resource sets conflict
 */
export function hasResourceConflict(r1: Resources, r2: Resources): boolean {
	// File conflicts: write-write or read-write with path overlap
	if (r1.files && r2.files) {
		const hasWrite = r1.files.mode === 'write' || r2.files.mode === 'write';
		if (hasWrite && pathsOverlap(r1.files.paths, r2.files.paths)) {
			return true;
		}
	}

	// Sandbox conflicts: exec/analysis/deploy are exclusive
	if (r1.sandbox && r2.sandbox) {
		const exclusive = ['exec', 'analysis', 'deploy'];
		const op1Exclusive = exclusive.includes(r1.sandbox.operation);
		const op2Exclusive = exclusive.includes(r2.sandbox.operation);
		if (op1Exclusive || op2Exclusive) {
			return true;
		}
		// 'read' operations can run in parallel with each other
	}

	// Blueprint: always exclusive
	if (r1.blueprint && r2.blueprint) {
		return true;
	}

	// Git commit: conflicts with file writes
	if (r1.gitCommit && r2.files?.mode === 'write') {
		return true;
	}
	if (r2.gitCommit && r1.files?.mode === 'write') {
		return true;
	}

	return false;
}
