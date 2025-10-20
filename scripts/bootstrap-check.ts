#!/usr/bin/env bun
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

interface CheckResult {
        name: string;
        success: boolean;
        details?: string;
        warning?: boolean;
}

interface BootstrapOptions {
        skipNetwork?: boolean;
        envFile?: string;
}

function loadOptions(): BootstrapOptions {
        const args = new Set(process.argv.slice(2));
        const options: BootstrapOptions = {};

        if (args.has('--no-network')) {
                options.skipNetwork = true;
        }

        for (const arg of args) {
                if (arg.startsWith('--env-file=')) {
                        options.envFile = arg.split('=')[1] ?? '';
                }
        }

        if (!options.envFile) {
                options.envFile = process.env.BOOTSTRAP_ENV_FILE || path.join(projectRoot, '.dev.vars');
        } else if (!path.isAbsolute(options.envFile)) {
                options.envFile = path.resolve(process.cwd(), options.envFile);
        }

        return options;
}

function parseEnvFile(content: string): Record<string, string> {
        const entries: Record<string, string> = {};

        for (const rawLine of content.split(/\r?\n/)) {
                const line = rawLine.trim();
                if (!line || line.startsWith('#')) {
                        continue;
                }

                const equalsIndex = line.indexOf('=');
                if (equalsIndex === -1) {
                        continue;
                }

                const key = line.slice(0, equalsIndex).trim();
                let value = line.slice(equalsIndex + 1).trim();

                if (
                        (value.startsWith('"') && value.endsWith('"')) ||
                        (value.startsWith("'") && value.endsWith("'"))
                ) {
                        value = value.slice(1, -1);
                }

                entries[key] = value;
        }

        return entries;
}

function loadEnvironment(envFile: string) {
        const envFromFile: Record<string, string> = {};

        if (existsSync(envFile)) {
                const raw = readFileSync(envFile, 'utf-8');
                Object.assign(envFromFile, parseEnvFile(raw));
        }

        return { ...envFromFile, ...process.env } as Record<string, string | undefined>;
}

function formatResult(result: CheckResult): string {
        const status = result.warning ? '⚠️' : result.success ? '✅' : '❌';
        const detailText = result.details ? `\n   ${result.details}` : '';
        return `${status} ${result.name}${detailText}`;
}

function ensureValue(env: Record<string, string | undefined>, key: string): CheckResult {
        const value = env[key];
        if (!value) {
                return {
                        name: `${key} configured`,
                        success: false,
                        details: `${key} is not set. Update your env configuration before continuing.`,
                };
        }

        return {
                name: `${key} configured`,
                success: true,
                details: `${key}=${value}`,
        };
}

async function checkSandboxInstanceType(env: Record<string, string | undefined>): Promise<CheckResult> {
        const configured = ensureValue(env, 'SANDBOX_INSTANCE_TYPE');
        if (!configured.success) {
                return configured;
        }

        if (configured.details?.includes('standard-3')) {
                return {
                        name: 'Sandbox instance type',
                        success: true,
                        details: 'SANDBOX_INSTANCE_TYPE is set to standard-3',
                };
        }

        return {
                name: 'Sandbox instance type',
                success: false,
                details: `Expected SANDBOX_INSTANCE_TYPE="standard-3", found ${env.SANDBOX_INSTANCE_TYPE ?? 'unset'}`,
        };
}

async function checkHealthEndpoint(env: Record<string, string | undefined>, skipNetwork?: boolean): Promise<CheckResult> {
        if (skipNetwork) {
                return {
                        name: 'Health endpoint reachability',
                        success: true,
                        warning: true,
                        details: 'Skipped (--no-network flag). Run without the flag when network access is available.',
                };
        }

        const explicitUrl = env.BOOTSTRAP_HEALTH_URL;
        const baseDomain = env.CUSTOM_DOMAIN;
        const fallback = 'http://127.0.0.1:8787';
        const target = explicitUrl || (baseDomain ? `https://${baseDomain}` : fallback);
        const url = target.endsWith('/api/health') ? target : `${target.replace(/\/$/, '')}/api/health`;

        try {
                const response = await fetch(url, { method: 'GET' });
                if (!response.ok) {
                        return {
                                name: 'Health endpoint reachability',
                                success: false,
                                details: `Request to ${url} returned status ${response.status}`,
                        };
                }

                return {
                        name: 'Health endpoint reachability',
                        success: true,
                        details: `/api/health responded with ${response.status}`,
                };
        } catch (error) {
                return {
                        name: 'Health endpoint reachability',
                        success: false,
                        details: `Failed to fetch ${url}: ${String(error)}`,
                };
        }
}

async function checkLLM(env: Record<string, string | undefined>, skipNetwork?: boolean): Promise<CheckResult> {
        const apiKey = env.GOOGLE_AI_STUDIO_API_KEY;
        if (!apiKey || apiKey === 'default') {
                return {
                        name: 'LLM connectivity (Google AI Studio)',
                        success: false,
                        details: 'GOOGLE_AI_STUDIO_API_KEY is missing or set to "default".',
                };
        }

        if (skipNetwork) {
                return {
                        name: 'LLM connectivity (Google AI Studio)',
                        success: true,
                        warning: true,
                        details: 'Skipped (--no-network flag). Re-run without skipping to verify the key.',
                };
        }

        const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;
        const body = {
                contents: [
                        {
                                role: 'user',
                                parts: [{ text: 'Reply with the single word "ok".' }],
                        },
                ],
        };

        try {
                const response = await fetch(endpoint, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(body),
                });

                if (!response.ok) {
                        return {
                                name: 'LLM connectivity (Google AI Studio)',
                                success: false,
                                details: `API call failed with status ${response.status}`,
                        };
                }

                const data = (await response.json()) as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>; };
                const text = data.candidates?.[0]?.content?.parts?.[0]?.text?.toLowerCase() ?? '';

                if (text.includes('ok')) {
                        return {
                                name: 'LLM connectivity (Google AI Studio)',
                                success: true,
                                details: 'Received response from Gemini model.',
                        };
                }

                return {
                        name: 'LLM connectivity (Google AI Studio)',
                        success: false,
                        details: 'Received response but it did not contain the expected text.',
                };
        } catch (error) {
                return {
                        name: 'LLM connectivity (Google AI Studio)',
                        success: false,
                        details: `LLM request failed: ${String(error)}`,
                };
        }
}

async function main() {
        const options = loadOptions();
        const env = loadEnvironment(options.envFile);

        const checks: Array<Promise<CheckResult>> = [
                checkSandboxInstanceType(env),
                checkHealthEndpoint(env, options.skipNetwork),
                checkLLM(env, options.skipNetwork),
        ];

        const results = await Promise.all(checks);

        let allPassed = true;
        for (const result of results) {
                if (!result.success && !result.warning) {
                        allPassed = false;
                }
                console.log(formatResult(result));
        }

        if (!allPassed) {
                process.exitCode = 1;
        }
}

main().catch(error => {
        console.error('Bootstrap check failed:', error);
        process.exitCode = 1;
});
