/**
 * SDAE — Spec-Driven Autonomous Engine
 *
 * Barrel export for the complete SDAE core. Import from here rather than
 * reaching into submodules directly:
 *
 *   import { DSLCompiler, DAGRunner, SDAECache, MasterBibleSchema } from 'worker/sdae';
 */

// Types and enums
export {
	DSL_VERSION,
	OP_TYPES,
	type OpType,
	type NodeStatus,
	type RunStatus,
	type OnFailAction,
	type SandboxIsolation,
	type AuditLevel,
	type BibleVersion,
} from './types';

// IR — schemas, types, and content hash
export {
	// Zod schemas (for runtime validation)
	OpTypeSchema,
	OnFailActionSchema,
	NodeStatusSchema,
	RunStatusSchema,
	SandboxIsolationSchema,
	AuditLevelSchema,
	RetryPolicySchema,
	DAGNodeSchema,
	ExecutionPolicySchema,
	GovernanceSpecSchema,
	BibleMetadataSchema,
	MasterBibleSchema,

	// Per-op parameter schemas
	OP_SCHEMAS,
	ScrapeDynamicParamsSchema,
	ScrapeStaticParamsSchema,
	ParseHtmlParamsSchema,
	ExtractJsonLdParamsSchema,
	LoginFormParamsSchema,
	ApiCallParamsSchema,
	CodeGenerateParamsSchema,
	FileWriteParamsSchema,
	TestRunParamsSchema,
	BrowserActionParamsSchema,
	WaitForSelectorParamsSchema,
	TransformDataParamsSchema,
	ValidateOutputParamsSchema,
	NotifyUserParamsSchema,
	DbMigrateParamsSchema,
	DeployAppParamsSchema,
	StyleGenerateParamsSchema,
	ComponentGenerateParamsSchema,

	// Inferred TypeScript types
	type RetryPolicy,
	type DAGNode,
	type ExecutionPolicy,
	type GovernanceSpec,
	type BibleMetadata,
	type MasterBible,

	// Result / context types
	type ValidationResult,
	type CompilationResult,
	type NodeOutput,
	type NodeResult,
	type RunResult,
	type RunContext,
	type NodeContext,
	type CachedResult,

	// Functions
	computeContentHash,
} from './ir';

// Compiler
export { DSLCompiler } from './compiler';

// Runner
export { DAGRunner, WorkerRegistry, type WorkerFn } from './runner';

// Cache
export { SDAECache } from './cache';

// Cost-Quality Multitenant Layer
export {
	TenantPolicySchema,
	PolicyEngine,
	ModelRouter,
	QualityGate,
	UsageTracker,
	handleGenerationRequest,
	type TenantPolicy,
	type BudgetState,
	type GuardResult,
	type RoutingContext,
	type QualityContext,
	type QualityResult,
	type UsageEvent,
	type QualityEvent,
	type RoutingDecision,
	type RetryOutcome,
	type UsageSummary,
	type RequestContext,
	type GenerationResult,
} from './cost-quality';

// Spec Generator
export {
	SpecGenerator,
	type SpecInput,
	type SpecModelConfig,
	type CriticResult,
	type PreMortemResult,
	type FailureMode,
} from './spec-generator';

// Form Engine
export {
	FormEngine,
	type IntentClassification,
	type DynamicForm,
	type FormSection,
	type FormField,
	type FormUpdate,
	type FormTemplate,
} from './form-engine';
