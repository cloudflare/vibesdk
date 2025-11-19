import type { TemplateDetails } from '../../services/sandbox/sandboxTypes';

/**
 * Single source of truth for an in-memory "scratch" template.
 * Used when starting from-scratch (general mode) or when no template fits.
 */
export function createScratchTemplateDetails(): TemplateDetails {
    return {
        name: 'scratch',
        description: { selection: 'from-scratch baseline', usage: 'No template. Agent will scaffold as needed.' },
        fileTree: { path: '/', type: 'directory', children: [] },
        allFiles: {},
        language: 'typescript',
        deps: {},
        frameworks: [],
        importantFiles: new Set<string>(),
        dontTouchFiles: new Set<string>(),
        redactedFiles: new Set<string>(),
    };
}

