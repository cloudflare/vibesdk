/**
 * AppDatabaseController
 *
 * Read-only inspector endpoints for the space-generated app's Durable
 * Object storage. Powers the "DB" tab in the chat UI.
 *
 * The LLM-generated worker exports `class App extends DurableObject` from
 * its main module. SpaceDO hosts that class as a Facet (`app:<branch>`)
 * via the Worker Loader and exposes its SQLite storage through the
 * inspector RPC methods (`listAppTables`, `queryAppTable`,
 * `wipeAppDatabase`). The inspector methods themselves are injected into
 * a subclass of the user's App at load time (see the space package's
 * `inspector-wrapper.ts`), so the LLM does not have to write any
 * boilerplate.
 *
 * All endpoints accept an `:agentId` path param. A session's space is
 * always its agent id (one space per session), so the SpaceDO stub is
 * resolved by `SPACE_DO.idFromName(agentId)`.
 */
import { BaseController } from '../baseController';
import { createLogger } from '../../../logger';
import { getAgentState } from '../../../agents';
import { RouteContext } from '../../types/route-context';
import { ApiResponse, ControllerResponse } from '../types';
import type {
	ListAppTablesResponse,
	QueryAppTableResponse,
	WipeAppDatabaseResponse,
} from './types';
import type {
	AppDatabaseReadResult,
	AppDatabaseTable,
} from '@space-do/space';

interface SpaceDbStub extends DurableObjectStub {
	listAppTables(branch: string): Promise<AppDatabaseTable[]>;
	queryAppTable(
		branch: string,
		table: string,
		opts: {
			limit?: number;
			offset?: number;
			orderBy?: string;
			orderDir?: 'asc' | 'desc';
		},
	): Promise<AppDatabaseReadResult>;
	wipeAppDatabase(branch: string): Promise<{ ok: true }>;
}

interface AgentStateLite {
	currentBranch?: string;
}

const MAX_PAGE_SIZE = 200;
const DEFAULT_PAGE_SIZE = 50;

export class AppDatabaseController extends BaseController {
	static logger = createLogger('AppDatabaseController');

	private static async resolveSpaceContext(
		env: Env,
		agentId: string,
		branchOverride?: string,
	): Promise<{ stub: SpaceDbStub; spaceName: string; branch: string }> {
		// One space per session: the space is always the agent id.
		const spaceName = agentId;
		let branch = branchOverride ?? 'main';

		try {
			const state = (await getAgentState(env, agentId)) as unknown as AgentStateLite;
			if (!branchOverride && state?.currentBranch) branch = state.currentBranch;
		} catch (e) {
			this.logger.debug(
				`Could not resolve agent state for ${agentId}; falling back to defaults`,
				{ error: e instanceof Error ? e.message : String(e) },
			);
		}

		const ns = (env as unknown as { SPACE_DO?: DurableObjectNamespace }).SPACE_DO;
		if (!ns) {
			throw new Error('SPACE_DO binding is not configured');
		}
		const stub = ns.get(ns.idFromName(spaceName)) as unknown as SpaceDbStub;
		return { stub, spaceName, branch };
	}

	static async listTables(
		request: Request,
		env: Env,
		_: ExecutionContext,
		context: RouteContext,
	): Promise<ControllerResponse<ApiResponse<ListAppTablesResponse>>> {
		try {
			const agentId = context.pathParams.agentId;
			if (!agentId) {
				return this.createErrorResponse<ListAppTablesResponse>(
					'Missing agent ID',
					400,
				);
			}
			const params = this.parseQueryParams(request);
			const { stub, branch } = await this.resolveSpaceContext(
				env,
				agentId,
				params.get('branch') ?? undefined,
			);
			const tables = await stub.listAppTables(branch);
			return this.createSuccessResponse<ListAppTablesResponse>({ branch, tables });
		} catch (e) {
			return this.handleError(e, 'list app tables') as ControllerResponse<
				ApiResponse<ListAppTablesResponse>
			>;
		}
	}

	static async queryTable(
		request: Request,
		env: Env,
		_: ExecutionContext,
		context: RouteContext,
	): Promise<ControllerResponse<ApiResponse<QueryAppTableResponse>>> {
		try {
			const agentId = context.pathParams.agentId;
			if (!agentId) {
				return this.createErrorResponse<QueryAppTableResponse>(
					'Missing agent ID',
					400,
				);
			}
			const params = this.parseQueryParams(request);
			const table = params.get('table');
			if (!table) {
				return this.createErrorResponse<QueryAppTableResponse>(
					'Missing table parameter',
					400,
				);
			}
			const rawLimit = Number(params.get('limit') ?? DEFAULT_PAGE_SIZE);
			const rawOffset = Number(params.get('offset') ?? 0);
			const limit = Math.max(
				1,
				Math.min(MAX_PAGE_SIZE, Number.isFinite(rawLimit) ? rawLimit : DEFAULT_PAGE_SIZE),
			);
			const offset = Math.max(
				0,
				Number.isFinite(rawOffset) ? rawOffset : 0,
			);
			const orderBy = params.get('orderBy') || undefined;
			const orderDirRaw = params.get('orderDir');
			const orderDir: 'asc' | 'desc' | undefined =
				orderDirRaw === 'asc' || orderDirRaw === 'desc' ? orderDirRaw : undefined;

			const { stub, branch } = await this.resolveSpaceContext(
				env,
				agentId,
				params.get('branch') ?? undefined,
			);
			const result = await stub.queryAppTable(branch, table, {
				limit,
				offset,
				orderBy,
				orderDir,
			});
			return this.createSuccessResponse<QueryAppTableResponse>({
				branch,
				table,
				columns: result.columns,
				rows: result.rows,
				totalCount: result.totalCount,
				limit,
				offset,
			});
		} catch (e) {
			return this.handleError(e, 'query app table') as ControllerResponse<
				ApiResponse<QueryAppTableResponse>
			>;
		}
	}

	static async wipe(
		request: Request,
		env: Env,
		_: ExecutionContext,
		context: RouteContext,
	): Promise<ControllerResponse<ApiResponse<WipeAppDatabaseResponse>>> {
		try {
			const agentId = context.pathParams.agentId;
			if (!agentId) {
				return this.createErrorResponse<WipeAppDatabaseResponse>(
					'Missing agent ID',
					400,
				);
			}
			const bodyResult = await this.parseJsonBody<{ branch?: string }>(request);
			const body = bodyResult.success ? (bodyResult.data ?? {}) : {};
			const { stub, branch } = await this.resolveSpaceContext(env, agentId, body.branch);
			await stub.wipeAppDatabase(branch);
			return this.createSuccessResponse<WipeAppDatabaseResponse>({ ok: true });
		} catch (e) {
			return this.handleError(e, 'wipe app database') as ControllerResponse<
				ApiResponse<WipeAppDatabaseResponse>
			>;
		}
	}
}
