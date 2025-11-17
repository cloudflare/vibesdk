import React from 'react';
import ReactDOM from 'react-dom';
import * as LucideIcons from 'lucide-react';
import { motion } from 'framer-motion';
import clsx from 'clsx';
import { twMerge } from 'tailwind-merge';
import { cn } from '@/lib/utils';
import type { FileType } from '@/api-types';
import { loadModule } from './ModuleLoader';
import { initializeImportMaps } from './ImportMapManager';
import { loadStylesheets } from './StylesheetLoader';

export interface PresentationRuntime {
	React: typeof React;
	motion: typeof motion;
	clsx: typeof clsx;
	twMerge: typeof twMerge;
	SlideComponents: Record<string, unknown>;
	Icons: typeof LucideIcons;
	Utils: {
		cn: typeof cn;
	};
}

declare global {
	interface Window {
		React: typeof React;
		ReactDOM: typeof ReactDOM;
		PresentationRuntime?: PresentationRuntime;
	}
}

/**
 * Initialization result with detailed status
 */
export interface InitializationResult {
	success: boolean;
	exportCount: number;
	failedFiles: string[];
	errors: Array<{ file: string; error: string }>;
}

export class GlobalRegistry {
	private static initialized = false;
	private static initializationPromise: Promise<InitializationResult> | null = null;
	private static componentCache: Record<string, unknown> = {};

	private static applyRuntimeExports(exportsMap: Record<string, unknown>): void {
		window.React = React;
		window.ReactDOM = ReactDOM;
		window.PresentationRuntime = {
			React,
			motion,
			clsx,
			twMerge,
			SlideComponents: exportsMap,
			Icons: LucideIcons,
			Utils: { cn },
		};
	}

	/**
	 * Initialize the presentation runtime
	 *
	 * Handles concurrent calls gracefully by returning the same promise
	 * Only sets initialized=true after successful completion
	 * Tracks errors for validation
	 */
	static async initialize(files: FileType[], slideDirectory = 'public/slides'): Promise<InitializationResult> {
		// Return existing initialization if in progress
		if (this.initializationPromise) {
				return this.initializationPromise;
		}

		// Skip if already successfully initialized
		if (this.initialized) {
				return {
				success: true,
				exportCount: Object.keys(this.componentCache).length,
				failedFiles: [],
				errors: [],
			};
		}

		// Create initialization promise to prevent race conditions
		this.initializationPromise = this.performInitialization(files, slideDirectory);

		try {
			const result = await this.initializationPromise;

			// Only mark as initialized if successful
			if (result.success) {
				this.initialized = true;
			}

			return result;
		} finally {
			// Clear promise after completion (success or failure)
			this.initializationPromise = null;
		}
	}

	/**
	 * Check if a file is a library file (component/utility, not slide or config)
	 */
	private static isLibraryFile(filePath: string, slideDirectory: string): boolean {
		const normalizedPath = filePath.replace(/^\/+/, '');
		const normalizedSlideDir = slideDirectory.replace(/^\/+/, '');
		
		// Must be .jsx or .js
		if (!normalizedPath.endsWith('.jsx') && !normalizedPath.endsWith('.js')) {
			return false;
		}
		
		// Must be in public/ or src/ directories
		if (!normalizedPath.startsWith('public/') && !normalizedPath.startsWith('src/')) {
			return false;
		}
		
		// Exclude slides directory
		if (normalizedPath.includes(`${normalizedSlideDir}/`)) {
			return false;
		}
		
		// Exclude dev and node_modules
		if (normalizedPath.includes('/_dev/') || normalizedPath.includes('/node_modules/')) {
			return false;
		}
		
		// Exclude config files by filename pattern
		const filename = normalizedPath.split('/').pop() || '';
		const configPatterns = [
			'vite.config',
			'vitest.config',
			'eslint.config',
			'tailwind.config',
			'postcss.config',
			'babel.config',
			'webpack.config',
			'rollup.config',
			'tsconfig',
		];
		
		if (configPatterns.some(pattern => filename.startsWith(pattern))) {
			return false;
		}
		
		return true;
	}
	
	/**
	 * Perform the actual initialization logic
	 */
	private static async performInitialization(
		files: FileType[],
		slideDirectory: string,
	): Promise<InitializationResult> {
		// Initialize import maps FIRST (must be before any imports)
		initializeImportMaps();
		
		// Load stylesheets (CSS files and CDN styles)
		const filesMap = new Map<string, string>();
		for (const file of files) {
			filesMap.set(file.filePath, file.fileContents);
		}
		loadStylesheets({ files: filesMap, slideDirectory });
		
		
		const libraryFiles = files
			.filter(f => this.isLibraryFile(f.filePath, slideDirectory))
			.sort((a, b) => {
				// .js files before .jsx for dependency order
				if (a.filePath.endsWith('.js') && b.filePath.endsWith('.jsx')) return -1;
				if (a.filePath.endsWith('.jsx') && b.filePath.endsWith('.js')) return 1;
				return 0;
			});


		// Set up basic window runtime BEFORE compiling any files
		// This allows library files to reference runtime during compilation
		this.applyRuntimeExports({});

		// Build file map for dependency resolution
		const allFilesMap = new Map<string, string>();
		for (const file of files) {
			allFilesMap.set(file.filePath, file.fileContents);
		}

		const allExports: Record<string, unknown> = {};
		const failedFiles: string[] = [];
		const errors: Array<{ file: string; error: string }> = [];

		// Compile all library files and collect exports
		for (const file of libraryFiles) {
			try {
				const result = await loadModule({
					code: file.fileContents,
					moduleId: file.filePath,
					filename: file.filePath,
					allFiles: allFilesMap,
				});

				// Extract exports and accumulate them
				if (typeof result.exports === 'object' && result.exports !== null) {
					Object.assign(allExports, result.exports);
				}
			} catch (error) {
				failedFiles.push(file.filePath);
				const errorMsg = error instanceof Error ? error.message : 'Unknown error';
				errors.push({ file: file.filePath, error: errorMsg });
				console.error(`[GlobalRegistry] Exception compiling ${file.filePath}:`, error);
			}
		}

		// Finalize runtime with full export set (only set once after all files compiled)
		this.applyRuntimeExports(allExports);

		this.componentCache = allExports;

		const exportCount = Object.keys(allExports).length;

		if (failedFiles.length > 0) {
			console.warn(
				`[GlobalRegistry] Completed with ${failedFiles.length} failed files:`,
				failedFiles,
			);
		}

		return {
			success: failedFiles.length === 0 || exportCount > 0, // Success if we got some exports
			exportCount,
			failedFiles,
			errors,
		};
	}

	static isInitialized(): boolean {
		return this.initialized;
	}

	static getRuntime(): PresentationRuntime | undefined {
		return window.PresentationRuntime;
	}

	static reset(): void {
		window.PresentationRuntime = undefined;
		this.componentCache = {};
		this.initialized = false;
	}

	static getComponent(name: string): unknown {
		return this.componentCache[name];
	}

	static getAllComponents(): Record<string, unknown> {
		return { ...this.componentCache };
	}
}
