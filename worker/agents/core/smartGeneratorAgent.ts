import { Agent, AgentContext } from "agents";
import { AgentInitArgs, BehaviorType } from "./types";
import { AgentState, CurrentDevState, MAX_PHASES } from "./state";
import { AgentInfrastructure, BaseAgentBehavior } from "./baseAgent";
import { createObjectLogger, StructuredLogger } from '../../logger';
import { Blueprint } from "../schemas";
import { InferenceContext } from "../inferutils/config.types";

export class CodeGeneratorAgent extends Agent<Env, AgentState> implements AgentInfrastructure<AgentState> {
    public _logger: StructuredLogger | undefined;
    private behavior: BaseAgentBehavior<AgentState>;
    private onStartDeferred?: { props?: Record<string, unknown>; resolve: () => void };
    
        
    initialState: AgentState = {
        blueprint: {} as Blueprint, 
        projectName: "",
        query: "",
        generatedPhases: [],
        generatedFilesMap: {},
        behaviorType: 'phasic',
        sandboxInstanceId: undefined,
        templateName: '',
        commandsHistory: [],
        lastPackageJson: '',
        pendingUserInputs: [],
        inferenceContext: {} as InferenceContext,
        sessionId: '',
        hostname: '',
        conversationMessages: [],
        currentDevState: CurrentDevState.IDLE,
        phasesCounter: MAX_PHASES,
        mvpGenerated: false,
        shouldBeGenerating: false,
        reviewingInitiated: false,
        projectUpdatesAccumulator: [],
        lastDeepDebugTranscript: null,
    };

    constructor(ctx: AgentContext, env: Env) {
        super(ctx, env);
                
        this.sql`CREATE TABLE IF NOT EXISTS full_conversations (id TEXT PRIMARY KEY, messages TEXT)`;
        this.sql`CREATE TABLE IF NOT EXISTS compact_conversations (id TEXT PRIMARY KEY, messages TEXT)`;

        const behaviorTypeProp = (ctx.props as Record<string, unknown>)?.behaviorType as BehaviorType | undefined;
        const behaviorType = this.state.behaviorType || behaviorTypeProp || 'phasic';
        if (behaviorType === 'phasic') {
            this.behavior = new PhasicAgentBehavior(this);
        } else {
            this.behavior = new AgenticAgentBehavior(this);
        }
    }

    async initialize(
        initArgs: AgentInitArgs<AgentState>,
        ..._args: unknown[]
    ): Promise<AgentState> {
        const { inferenceContext } = initArgs;
        this.initLogger(inferenceContext.agentId, inferenceContext.userId);
        
        await this.behavior.initialize(initArgs);
        return this.behavior.state;
    }

    private initLogger(agentId: string, userId: string, sessionId?: string) {
        this._logger = createObjectLogger(this, 'CodeGeneratorAgent');
        this._logger.setObjectId(agentId);
        this._logger.setFields({
            agentId,
            userId,
        });
        if (sessionId) {
            this._logger.setField('sessionId', sessionId);
        }
        return this._logger;
    }

    logger(): StructuredLogger {
        if (!this._logger) {
            this._logger = this.initLogger(this.getAgentId(), this.state.inferenceContext.userId, this.state.sessionId);
        }
        return this._logger;
    }

    getAgentId() {
        return this.state.inferenceContext.agentId;
    }
}