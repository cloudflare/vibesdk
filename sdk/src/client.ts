import type {
	ApiResponse,
	AppDetails,
	AppListItem,
	BuildOptions,
	BuildStartEvent,
	Credentials,
	PublicAppsQuery,
	VibeClientOptions,
} from './types';
import { HttpClient } from './http';
import { parseNdjsonStream } from './ndjson';
import { BuildSession } from './session';

function toQueryString(query: Record<string, string | number | undefined>): string {
	const params = new URLSearchParams();
	for (const [k, v] of Object.entries(query)) {
		if (v === undefined) continue;
		params.set(k, String(v));
	}
	const s = params.toString();
	return s ? `?${s}` : '';
}

export class VibeClient {
	private http: HttpClient;

	constructor(private options: VibeClientOptions) {
		this.http = new HttpClient(options);
	}

	get baseUrl(): string {
		return this.http.baseUrl;
	}

	/**
	 * Creates a new agent/app from a prompt and returns a BuildSession.
	 *
	 * Current platform requirement: `token` must be a valid JWT access token.
	 * Later: `apiKey` will be exchanged for a short-lived JWT.
	 */
	async build(prompt: string, options: BuildOptions = {}): Promise<BuildSession> {
		const body = {
			query: prompt,
			language: options.language,
			frameworks: options.frameworks,
			selectedTemplate: options.selectedTemplate,
			behaviorType: options.behaviorType,
			projectType: options.projectType,
			images: options.images,
			// Future: credentials
			credentials: options.credentials,
		};

		const resp = await this.http.fetchRaw('/api/agent', {
			method: 'POST',
			headers: await this.http.headers({ 'Content-Type': 'application/json' }),
			body: JSON.stringify(body),
		});

		if (!resp.body) {
			throw new Error('Missing response body from /api/agent');
		}

		let start: BuildStartEvent | null = null;

		for await (const obj of parseNdjsonStream(resp.body)) {
			if (!start) {
				start = obj as BuildStartEvent;
				continue;
			}
			const o = obj as { chunk?: unknown };
			if (typeof o.chunk === 'string') {
				options.onBlueprintChunk?.(o.chunk);
			}
		}

		if (!start) {
			throw new Error('No start event received from /api/agent');
		}

		const session = new BuildSession(this.options, start, {
			getAuthToken: () => this.http.getToken(),
			...(options.credentials ? { defaultCredentials: options.credentials } : {}),
		});
		if (options.autoConnect ?? true) {
			session.connect();
			if (options.autoGenerate ?? true) {
				session.startGeneration();
			}
		}

		return session;
	}

	/** Connect to an existing agent/app by id. */
	async connect(agentId: string, options: { credentials?: Credentials } = {}): Promise<BuildSession> {
		const data = await this.http.fetchJson<ApiResponse<{ websocketUrl: string; agentId: string }>>(
			`/api/agent/${agentId}/connect`,
			{ method: 'GET', headers: await this.http.headers() }
		);

		if (!data.success) {
			throw new Error(data.error.message);
		}

		const start: BuildStartEvent = {
			agentId: data.data.agentId,
			websocketUrl: data.data.websocketUrl,
		};

		return new BuildSession(this.options, start, {
			getAuthToken: () => this.http.getToken(),
			...(options.credentials ? { defaultCredentials: options.credentials } : {}),
		});
	}

	apps = {
		listPublic: async (query: PublicAppsQuery = {}) => {
			const qs = toQueryString({
				limit: query.limit,
				page: query.page,
				sort: query.sort,
				order: query.order,
				period: query.period,
				framework: query.framework,
				search: query.search,
			});
			return this.http.fetchJson<ApiResponse<{ apps: AppListItem[]; pagination?: unknown }>>(
				`/api/apps/public${qs}`,
				{ method: 'GET', headers: await this.http.headers() }
			);
		},

		listMine: async () => {
			return this.http.fetchJson<ApiResponse<{ apps: AppListItem[] }>>('/api/apps', {
				method: 'GET',
				headers: await this.http.headers(),
			});
		},

		get: async (appId: string) => {
			return this.http.fetchJson<ApiResponse<AppDetails>>(`/api/apps/${appId}`, {
				method: 'GET',
				headers: await this.http.headers(),
			});
		},

		getGitCloneToken: async (appId: string) => {
			return this.http.fetchJson<
				ApiResponse<{ token: string; expiresIn: number; expiresAt: string; cloneUrl: string }>
			>(`/api/apps/${appId}/git/token`, {
				method: 'POST',
				headers: await this.http.headers({ 'Content-Type': 'application/json' }),
			});
		},
	};
}
