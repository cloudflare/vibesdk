import { PhasicClient, type BuildSession, type AgentEventMap, type SessionState } from '@cf-vibesdk/sdk';

// ============================================================================
// Types
// ============================================================================

export type StepResult = {
	step: string;
	success: boolean;
	duration: number;
	details?: Record<string, unknown>;
	error?: string;
};

export type FullTestResult = {
	ok: boolean;
	agentId?: string;
	previewUrl?: string;
	totalDuration: number;
	steps: StepResult[];
	error?: string;
	stack?: string;
};

export type TestConfig = {
	baseUrl: string;
	apiKey: string;
	/** Optional logger for step progress */
	log?: (message: string) => void;
};

// ============================================================================
// Helpers
// ============================================================================

export async function runStep<T>(
	name: string,
	fn: () => Promise<T>,
	extractDetails?: (result: T) => Record<string, unknown>,
	log?: (message: string) => void
): Promise<{ result: T | null; stepResult: StepResult }> {
	const start = Date.now();
	log?.(`Starting: ${name}`);
	try {
		const result = await fn();
		const duration = Date.now() - start;
		const details = extractDetails ? extractDetails(result) : undefined;
		log?.(`Completed: ${name} (${duration}ms)`);
		return {
			result,
			stepResult: { step: name, success: true, duration, details },
		};
	} catch (error) {
		const duration = Date.now() - start;
		const errorMsg = error instanceof Error ? error.message : String(error);
		log?.(`Failed: ${name} - ${errorMsg}`);
		return {
			result: null,
			stepResult: { step: name, success: false, duration, error: errorMsg },
		};
	}
}

// ============================================================================
// Test: Authentication
// ============================================================================

export async function testAuth(config: TestConfig): Promise<FullTestResult> {
	const { baseUrl, apiKey, log } = config;
	const testStart = Date.now();
	const steps: StepResult[] = [];

	log?.('=== Starting Auth Test ===');

	try {
		// Step 1: Create client
		const { result: client, stepResult: clientStep } = await runStep(
			'create_client',
			async () => new PhasicClient({ baseUrl, apiKey }),
			undefined,
			log
		);
		steps.push(clientStep);
		if (!client) {
			return { ok: false, totalDuration: Date.now() - testStart, steps, error: 'Failed to create client' };
		}

		// Step 2: Check auth endpoint
		const { stepResult: authStep } = await runStep(
			'auth_check',
			async () => {
				const resp = await fetch(`${baseUrl}/api/auth/check`, {
					headers: { Authorization: `Bearer ${apiKey}` },
				});
				if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
				return { status: resp.status };
			},
			(r) => r,
			log
		);
		steps.push(authStep);

		// Step 3: Token exchange via client request
		const { stepResult: tokenStep } = await runStep(
			'token_exchange',
			async () => {
				const result = await client.apps.listRecent();
				if (!result.success) throw new Error(result.error.message);
				return { appCount: result.data.apps.length };
			},
			(r) => r,
			log
		);
		steps.push(tokenStep);

		const allPassed = steps.every((s) => s.success);
		log?.(`Auth test ${allPassed ? 'PASSED' : 'FAILED'}`);

		return { ok: allPassed, totalDuration: Date.now() - testStart, steps };
	} catch (error) {
		return {
			ok: false,
			totalDuration: Date.now() - testStart,
			steps,
			error: error instanceof Error ? error.message : String(error),
			stack: error instanceof Error ? error.stack : undefined,
		};
	}
}

// ============================================================================
// Test: Full Build Flow
// ============================================================================

export async function testFullBuild(config: TestConfig): Promise<FullTestResult> {
	const { baseUrl, apiKey, log } = config;
	const testStart = Date.now();
	const steps: StepResult[] = [];
	let session: BuildSession | null = null;

	log?.('=== Starting Full Build Test ===');
	log?.(`Base URL: ${baseUrl}`);

	try {
		// Step 1: Create client
		const { result: client, stepResult: clientStep } = await runStep(
			'create_client',
			async () => new PhasicClient({ baseUrl, apiKey }),
			undefined,
			log
		);
		steps.push(clientStep);
		if (!client) {
			return { ok: false, totalDuration: Date.now() - testStart, steps, error: 'Failed to create client' };
		}

		// Step 2: Start build
		const { result: buildSession, stepResult: buildStep } = await runStep(
			'start_build',
			async () => {
				return client.build('Build a simple hello world page with a title and welcome message', {
					projectType: 'app',
					autoGenerate: true,
				});
			},
			(s) => ({
				agentId: s.agentId,
				behaviorType: s.behaviorType,
				projectType: s.projectType,
				websocketUrl: s.websocketUrl,
			}),
			log
		);
		steps.push(buildStep);
		if (!buildSession) {
			return {
				ok: false,
				totalDuration: Date.now() - testStart,
				steps,
				error: 'Failed to start build: ' + buildStep.error,
			};
		}
		session = buildSession;
		log?.(`Agent created: ${session.agentId}`);

		// Set up WebSocket event logging
		session.on('ws:message', (m: AgentEventMap['ws:message']) => {
			log?.(`WS message: ${m.type || 'unknown'}`);
		});
		session.on('ws:open', () => log?.('WS: open'));
		session.on('ws:close', (e: AgentEventMap['ws:close']) => log?.(`WS: close code=${e.code} reason=${e.reason}`));
		session.on('ws:error', (e: AgentEventMap['ws:error']) => log?.(`WS: error ${e.error}`));
		session.on('ws:reconnecting', (e: AgentEventMap['ws:reconnecting']) => {
			log?.(`WS: reconnecting attempt=${e.attempt} delay=${e.delayMs}ms reason=${e.reason}`);
		});

		// Step 3: Verify WebSocket connection
		const { stepResult: wsConnectStep } = await runStep(
			'websocket_connected',
			async () => {
				if (!session!.isConnected()) {
					throw new Error('Session not connected after build');
				}
				const state = session!.state.get();
				if (state.connection !== 'connected') {
					await new Promise<void>((resolve, reject) => {
						const timeout = setTimeout(() => reject(new Error('Connection timeout')), 15000);
						const unsub = session!.state.onChange((next: SessionState) => {
							if (next.connection === 'connected') {
								clearTimeout(timeout);
								unsub();
								resolve();
							}
						});
						if (session!.state.get().connection === 'connected') {
							clearTimeout(timeout);
							unsub();
							resolve();
						}
					});
				}
				return { connection: session!.state.get().connection };
			},
			(r) => r,
			log
		);
		steps.push(wsConnectStep);
		if (!wsConnectStep.success) {
			session.close();
			return {
				ok: false,
				agentId: session.agentId,
				totalDuration: Date.now() - testStart,
				steps,
				error: 'WebSocket connection failed',
			};
		}

		// Step 4: Wait for generation to start
		const { stepResult: genStartStep } = await runStep(
			'generation_started',
			async () => {
				const msg = await session!.wait.generationStarted({ timeoutMs: 60000 });
				return { type: msg.type, totalFiles: msg.totalFiles };
			},
			(r) => r,
			log
		);
		steps.push(genStartStep);
		if (!genStartStep.success) {
			session.close();
			return {
				ok: false,
				agentId: session.agentId,
				totalDuration: Date.now() - testStart,
				steps,
				error: 'Generation did not start',
			};
		}

		// Step 5: Wait for phase_implementing
		const { stepResult: implStartStep } = await runStep(
			'phase_implementing',
			async () => {
				const msg = await session!.wait.phase({ type: 'phase_implementing', timeoutMs: 120000 });
				const phase = 'phase' in msg ? msg.phase : undefined;
				return { type: msg.type, phaseName: phase?.name };
			},
			(r) => r,
			log
		);
		steps.push(implStartStep);

		// Step 6: Wait for files
		const { stepResult: filesStep } = await runStep(
			'files_generated',
			async () => {
				await new Promise<void>((resolve, reject) => {
					const timeout = setTimeout(() => reject(new Error('File generation timeout')), 120000);
					const checkFiles = () => {
						const paths = session!.files.listPaths();
						if (paths.length > 0) {
							clearTimeout(timeout);
							resolve();
						}
					};
					const interval = setInterval(checkFiles, 500);
					setTimeout(() => clearInterval(interval), 120000);
					session!.on('file', () => {
						const paths = session!.files.listPaths();
						if (paths.length > 0) {
							clearTimeout(timeout);
							clearInterval(interval);
							resolve();
						}
					});
					checkFiles();
				});
				return { fileCount: session!.files.listPaths().length, files: session!.files.listPaths().slice(0, 5) };
			},
			(r) => r,
			log
		);
		steps.push(filesStep);

		// Step 7: Wait for phase_implemented
		const { stepResult: implDoneStep } = await runStep(
			'phase_implemented',
			async () => {
				const msg = await session!.wait.phase({ type: 'phase_implemented', timeoutMs: 180000 });
				const phase = 'phase' in msg ? msg.phase : undefined;
				return { type: msg.type, phaseName: phase?.name };
			},
			(r) => r,
			log
		);
		steps.push(implDoneStep);

		// Step 8: Verify deployable state
		const { stepResult: deployableStep } = await runStep(
			'deployable',
			async () => {
				const files = session!.files.listPaths();
				const state = session!.state.get();
				if (files.length === 0) {
					throw new Error('No files generated');
				}
				return { files: files.length, previewUrl: state.previewUrl };
			},
			(r) => r,
			log
		);
		steps.push(deployableStep);
		if (!deployableStep.success) {
			session.close();
			return {
				ok: false,
				agentId: session.agentId,
				totalDuration: Date.now() - testStart,
				steps,
				error: 'App not deployable: ' + deployableStep.error,
			};
		}

		// Step 9: Get or deploy preview
		const { stepResult: deployStep } = await runStep(
			'get_preview',
			async () => {
				const currentState = session!.state.get();
				if (currentState.previewUrl) {
					log?.(`Preview URL already available: ${currentState.previewUrl}`);
					return { previewURL: currentState.previewUrl, source: 'validation_deployment' };
				}
				log?.('No preview URL yet, requesting deployment...');
				session!.deployPreview();
				const msg = await session!.wait.previewDeployed({ timeoutMs: 120000 });
				return { previewURL: msg.previewURL, source: 'requested_deployment' };
			},
			(r) => r,
			log
		);
		steps.push(deployStep);

		// Get final state
		const finalState = session.state.get();
		const previewUrl = finalState.previewUrl || (deployStep.details?.previewURL as string);
		const fileCount = session.files.listPaths().length;

		session.close();

		const result: FullTestResult = {
			ok: deployStep.success && !!previewUrl,
			agentId: session.agentId,
			previewUrl,
			totalDuration: Date.now() - testStart,
			steps,
		};

		log?.(`Test complete. Preview: ${previewUrl}, Files: ${fileCount}`);
		return result;
	} catch (error) {
		session?.close();
		return {
			ok: false,
			agentId: session?.agentId,
			totalDuration: Date.now() - testStart,
			steps,
			error: error instanceof Error ? error.message : String(error),
			stack: error instanceof Error ? error.stack : undefined,
		};
	}
}
