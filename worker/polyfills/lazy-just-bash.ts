// Lazy `just-bash`. The 1.5 MB bash emulator is only used inside tool executions
// (`@cloudflare/think/tools/workspace`, `agents/skills`), which construct `Bash` and use
// `exec` and `fs` in async code. The real module loads on the first use instead of at
// Worker startup. Sync `fs` calls (`getAllPaths`) happen after `exec`, when the real
// instance exists, and are forwarded directly.
type RealModule = typeof import('just-bash/browser');
let realModule: Promise<RealModule> | null = null;
const loadReal = () => (realModule ??= import('just-bash/browser'));
const LAZY_COMMAND = Symbol('lazy-command');

export function defineCommand(name: string, impl: unknown): any {
	return { [LAZY_COMMAND]: true, name, impl };
}

export class Bash {
	readonly fs: any;
	private readonly options: any;
	private instance: Promise<any> | null = null;
	private ready: any = null;

	constructor(options: any) {
		this.options = options;
		this.fs = new Proxy(
			{},
			{
				get: (_target, method: string | symbol) => {
					if (this.ready) {
						const value = this.ready.fs[method];
						return typeof value === 'function' ? value.bind(this.ready.fs) : value;
					}
					return (...args: unknown[]) => this.get().then((bash) => bash.fs[method](...args));
				},
			},
		);
	}

	private get(): Promise<any> {
		return (this.instance ??= loadReal().then((m) => {
			const options = { ...this.options };
			if (Array.isArray(options.customCommands)) {
				options.customCommands = options.customCommands.map((c: any) =>
					c && c[LAZY_COMMAND] ? m.defineCommand(c.name, c.impl) : c,
				);
			}
			this.ready = new m.Bash(options);
			return this.ready;
		}));
	}

	async exec(...args: unknown[]): Promise<any> {
		return (await this.get()).exec(...args);
	}
}
