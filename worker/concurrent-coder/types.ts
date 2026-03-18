/**
 * Concurrent Coder – shared type definitions
 * Provider-agnostic, no hardcoded model names.
 */

/* ------------------------------------------------------------------ */
/*  Agent identifiers                                                  */
/* ------------------------------------------------------------------ */
export type AgentRole =
	| 'architect'
	| 'coder'
	| 'tester'
	| 'debugger'
	| 'reviewer'
	| 'deployer';

/* ------------------------------------------------------------------ */
/*  Session / pipeline                                                 */
/* ------------------------------------------------------------------ */
export interface SessionMeta {
	id: string;
	prompt: string;
	createdAt: string;
	status: SessionStatus;
}

export type SessionStatus =
	| 'pending'
	| 'running'
	| 'paused'
	| 'completed'
	| 'failed'
	| 'aborted';

export interface TimelineEvent {
	id: string;
	sessionId: string;
	agent: AgentRole | 'orchestrator';
	action: string;
	detail: string;
	timestamp: string;
}

/* ------------------------------------------------------------------ */
/*  LLM                                                                */
/* ------------------------------------------------------------------ */
export interface LLMMessage {
	role: 'system' | 'user' | 'assistant';
	content: string;
}

export interface LLMRequestOptions {
	model?: string;
	messages: LLMMessage[];
	temperature?: number;
	maxTokens?: number;
	responseFormat?: 'text' | 'json';
}

export interface LLMResponse {
	content: string;
	usage?: { promptTokens: number; completionTokens: number };
}

/* ------------------------------------------------------------------ */
/*  Agent request / response                                           */
/* ------------------------------------------------------------------ */
export interface AgentRequest {
	sessionId: string;
	spec?: string;
	code?: string | Record<string, string>;
	architecture?: string;
	testResults?: string;
	debugInfo?: string;
	reviewResult?: ReviewResult;
	iteration?: number;
	superpowers?: string[];
}

export interface AgentResponse {
	status: 'ok' | 'aborted' | 'error';
	agent: AgentRole;
	result?: unknown;
	error?: string;
}

/* ------------------------------------------------------------------ */
/*  Reviewer                                                           */
/* ------------------------------------------------------------------ */
export interface ReviewResult {
	score: number;
	issues: ReviewIssue[];
	fixes: string[];
	ast: ASTAnalysis;
	worldModel: WorldModelResult;
	lintResults: LintResult[];
}

export interface ReviewIssue {
	severity: 'error' | 'warning' | 'info';
	message: string;
	line?: number;
	file?: string;
}

export interface ASTAnalysis {
	functionCount: number;
	classCount: number;
	importCount: number;
	exportCount: number;
	maxDepth: number;
	complexity: number;
	issues: string[];
}

export interface WorldModelResult {
	predictedStates: string[];
	transitions: WorldModelTransition[];
	edgeCases: string[];
	unreachableCodeDetected: boolean;
}

export interface WorldModelTransition {
	from: string;
	to: string;
	action: string;
	probability: number;
}

export interface LintResult {
	rule: string;
	severity: 'error' | 'warning';
	message: string;
	line?: number;
}

/* ------------------------------------------------------------------ */
/*  Queue                                                              */
/* ------------------------------------------------------------------ */
export interface QueueJob {
	type: 'agent-task';
	sessionId: string;
	agent: AgentRole;
	payload: AgentRequest;
}

/* ------------------------------------------------------------------ */
/*  Superpowers / Skills                                               */
/* ------------------------------------------------------------------ */
export interface Superpower {
	name: string;
	filename: string;
	content: string;
}

/* ------------------------------------------------------------------ */
/*  Erase                                                              */
/* ------------------------------------------------------------------ */
export interface EraseRequest {
	sessionIds: string[];
	eraseLongTerm: boolean;
}

/* ------------------------------------------------------------------ */
/*  Concurrent-Coder–specific Env additions                            */
/* ------------------------------------------------------------------ */
export interface CCEnv {
	/* Durable Object namespaces */
	ORCHESTRATOR: DurableObjectNamespace;
	ARCHITECT: DurableObjectNamespace;
	CODER: DurableObjectNamespace;
	TESTER: DurableObjectNamespace;
	DEBUGGER: DurableObjectNamespace;
	REVIEWER: DurableObjectNamespace;
	DEPLOYER: DurableObjectNamespace;

	/* Storage */
	DB: D1Database;
	CACHE: KVNamespace;
	VECTORIZE_INDEX: VectorizeIndex;
	TEMPLATES: R2Bucket;

	/* Queue */
	BG_QUEUE: Queue<QueueJob>;

	/* AI Gateway */
	AI: Ai;

	/* Vars */
	DEFAULT_MODEL: string;
	COMPLEX_MODEL: string;
	MAX_DEBUG_ITERATIONS: string;
	REVIEW_THRESHOLD: string;

	/* Existing bindings forwarded */
	DISPATCHER: DispatchNamespace;
}
