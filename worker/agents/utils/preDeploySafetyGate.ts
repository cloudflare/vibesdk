import * as t from '@babel/types';
import type { FileOutputType, PhaseConceptType } from '../schemas';
import type { TemplateDetails } from '../../services/sandbox/sandboxTypes';
import type { InferenceContext } from '../inferutils/config.types';
import { parseCode, generateCode } from '../../services/code-fixer/utils/ast';
import { RealtimeCodeFixer } from '../assistants/realtimeCodeFixer';

export interface SafetyFinding {
	message: string;
	line?: number;
	column?: number;
}

function logSafetyGateError(context: string, error: unknown, extra?: Record<string, unknown>) {
	try {
		const payload = {
			context,
			...extra,
			error:
				error instanceof Error
					? { message: error.message, stack: error.stack }
					: { message: String(error) },
		};
		console.error('[preDeploySafetyGate]', payload);
	} catch {
		// Intentionally swallow all logging failures
	}
}

function getNodeLoc(node: t.Node): { line?: number; column?: number } {
	if (node.loc) {
		return { line: node.loc.start.line, column: node.loc.start.column + 1 };
	}
	return {};
}

function unwrapExpression(expression: t.Expression): t.Expression {
	let current = expression;
	while (true) {
		if (t.isParenthesizedExpression(current)) {
			current = current.expression;
			continue;
		}
		if (t.isTSAsExpression(current)) {
			current = current.expression;
			continue;
		}
		if (t.isTSTypeAssertion(current)) {
			current = current.expression;
			continue;
		}
		if (t.isTSNonNullExpression(current)) {
			current = current.expression;
			continue;
		}
		break;
	}
	return current;
}

function getReturnExpression(fn: t.ArrowFunctionExpression | t.FunctionExpression): t.Expression | null {
	if (t.isExpression(fn.body)) {
		return unwrapExpression(fn.body);
	}
	for (const stmt of fn.body.body) {
		if (t.isReturnStatement(stmt) && stmt.argument && t.isExpression(stmt.argument)) {
			return unwrapExpression(stmt.argument);
		}
	}
	return null;
}

function isUseLikeHookCallee(callee: t.Expression | t.V8IntrinsicIdentifier): callee is t.Identifier {
	return t.isIdentifier(callee) && callee.name.startsWith('use');
}

function isUseEffectCallee(callee: t.Expression | t.V8IntrinsicIdentifier): boolean {
	if (t.isIdentifier(callee) && callee.name === 'useEffect') return true;
	if (t.isMemberExpression(callee) && t.isIdentifier(callee.property) && callee.property.name === 'useEffect') return true;
	return false;
}

type WalkState = {
	inComponent: boolean;
	nestedFunctionDepth: number;
	parent?: t.Node;
};

function getChildNodes(node: t.Node): t.Node[] {
	const keys = t.VISITOR_KEYS[node.type] || [];
	const out: t.Node[] = [];
	for (const key of keys) {
		const value = (node as any)[key] as unknown;
		if (!value) continue;
		if (Array.isArray(value)) {
			for (const item of value) {
				if (item && typeof item.type === 'string') out.push(item as t.Node);
			}
		} else if (value && typeof (value as any).type === 'string') {
			out.push(value as t.Node);
		}
	}
	return out;
}

function isLikelyComponentFunctionNode(node: t.Node, parent?: t.Node): boolean {
	if (t.isFunctionDeclaration(node)) {
		return Boolean(node.id && /^[A-Z]/.test(node.id.name));
	}
	if (t.isArrowFunctionExpression(node) || t.isFunctionExpression(node)) {
		if (parent && t.isVariableDeclarator(parent) && t.isIdentifier(parent.id)) {
			return /^[A-Z]/.test(parent.id.name);
		}
	}
	return false;
}

function walk(node: t.Node, state: WalkState, onNode: (node: t.Node, state: WalkState) => void) {
	let nextState = state;

	const isFunctionNode =
		t.isFunctionDeclaration(node) || t.isFunctionExpression(node) || t.isArrowFunctionExpression(node);

	if (isFunctionNode) {
		const enteringComponent = !state.inComponent && isLikelyComponentFunctionNode(node, state.parent);
		if (enteringComponent) {
			nextState = { ...state, inComponent: true, nestedFunctionDepth: 0, parent: node };
		} else if (state.inComponent) {
			nextState = { ...state, nestedFunctionDepth: state.nestedFunctionDepth + 1, parent: node };
		} else {
			nextState = { ...state, parent: node };
		}
	} else {
		nextState = { ...state, parent: node };
	}

	onNode(node, nextState);

	for (const child of getChildNodes(node)) {
		walk(child, nextState, onNode);
	}
}

function functionBodyContainsSetState(fn: t.ArrowFunctionExpression | t.FunctionExpression): boolean {
	try {
		let found = false;
		const bodyNode: t.Node = t.isBlockStatement(fn.body) ? fn.body : t.expressionStatement(fn.body);
		walk(bodyNode, { inComponent: false, nestedFunctionDepth: 0 }, (node) => {
			if (!t.isCallExpression(node)) return;
			if (t.isIdentifier(node.callee) && /^set[A-Z]/.test(node.callee.name)) {
				found = true;
			}
		});
		return found;
	} catch (error) {
		logSafetyGateError('functionBodyContainsSetState failed', error);
		return false;
	}
}

function detectSelectorAllocations(ast: t.File): SafetyFinding[] {
	const findings: SafetyFinding[] = [];
	try {
		walk(ast, { inComponent: false, nestedFunctionDepth: 0 }, (node) => {
			if (!t.isCallExpression(node)) return;
			const { callee, arguments: args } = node;
			if (!isUseLikeHookCallee(callee)) return;
			if (args.length === 0) return;
			const firstArg = args[0];
			if (!t.isArrowFunctionExpression(firstArg) && !t.isFunctionExpression(firstArg)) return;

			const ret = getReturnExpression(firstArg);
			if (!ret) return;

			if (t.isObjectExpression(ret) || t.isArrayExpression(ret)) {
				findings.push({
					message:
						"Potential external-store selector instability: a 'use*' hook selector returns a new object/array. This can cause getSnapshot/max-update-depth loops. Rewrite to select a single stable value per hook call and derive objects/arrays outside the selector (e.g. useMemo).",
					...getNodeLoc(node),
				});
				return;
			}

			if (t.isCallExpression(ret) && t.isMemberExpression(ret.callee)) {
				const prop = ret.callee.property;
				if (t.isIdentifier(prop) && ['map', 'filter', 'reduce', 'sort', 'slice', 'concat'].includes(prop.name)) {
					findings.push({
						message:
							"Potential external-store selector instability: a 'use*' hook selector returns an allocated array via map/filter/reduce/sort/etc. Select the raw stable collection from the hook and derive with useMemo outside the selector.",
						...getNodeLoc(node),
					});
					return;
				}
			}

			if (
				t.isCallExpression(ret) &&
				t.isMemberExpression(ret.callee) &&
				t.isIdentifier(ret.callee.object) &&
				ret.callee.object.name === 'Object' &&
				t.isIdentifier(ret.callee.property) &&
				['values', 'keys', 'entries'].includes(ret.callee.property.name)
			) {
				findings.push({
					message:
						"Potential external-store selector instability: a 'use*' hook selector returns Object.values/keys/entries (allocates a new array). Select the raw object from the hook and derive with useMemo outside the selector.",
					...getNodeLoc(node),
				});
			}
		});
	} catch (error) {
		logSafetyGateError('detectSelectorAllocations failed', error);
		return [];
	}
	return findings;
}

function detectSetStateInRender(ast: t.File): SafetyFinding[] {
	const findings: SafetyFinding[] = [];
	try {
		walk(ast, { inComponent: false, nestedFunctionDepth: 0 }, (node, state) => {
			if (!state.inComponent) return;
			if (state.nestedFunctionDepth !== 0) return;
			if (!t.isCallExpression(node)) return;
			if (!t.isIdentifier(node.callee)) return;
			if (!/^set[A-Z]/.test(node.callee.name)) return;

			findings.push({
				message:
					"State setter appears to be called during the component render phase (not inside an event handler or effect). This can cause an infinite render loop / 'Maximum update depth exceeded'. Move the state update into a handler or a guarded useEffect.",
				...getNodeLoc(node),
			});
		});
	} catch (error) {
		logSafetyGateError('detectSetStateInRender failed', error);
		return [];
	}
	return findings;
}

function detectUseEffectMissingDeps(ast: t.File): SafetyFinding[] {
	const findings: SafetyFinding[] = [];
	try {
		walk(ast, { inComponent: false, nestedFunctionDepth: 0 }, (node) => {
			if (!t.isCallExpression(node)) return;
			if (!isUseEffectCallee(node.callee)) return;
			const args = node.arguments;
			if (args.length !== 1) return;
			const fn = args[0];
			if (!t.isArrowFunctionExpression(fn) && !t.isFunctionExpression(fn)) return;
			if (!functionBodyContainsSetState(fn)) return;

			findings.push({
				message:
					"useEffect that sets state is missing a dependency array. This is a common cause of 'Maximum update depth exceeded'. Add a deps array and guard the state update.",
				...getNodeLoc(node),
			});
		});
	} catch (error) {
		logSafetyGateError('detectUseEffectMissingDeps failed', error);
		return [];
	}
	return findings;
}

export function detectPreDeploySafetyFindings(code: string): SafetyFinding[] {
	let ast: t.File;
	try {
		ast = parseCode(code);
	} catch (error) {
		logSafetyGateError('parseCode failed in detectPreDeploySafetyFindings', error);
		return [{ message: 'Failed to parse file for safety checks; skipping deterministic scan.' }];
	}

	return [...detectSelectorAllocations(ast), ...detectUseEffectMissingDeps(ast), ...detectSetStateInRender(ast)];
}

function tryDeterministicSplitObjectSelectorDestructuring(code: string): { code: string; changed: boolean } {
	let ast: t.File;
	try {
		ast = parseCode(code);
	} catch (error) {
		logSafetyGateError('parseCode failed in deterministic split', error);
		return { code, changed: false };
	}

	let changed = false;

	function tryRewriteVariableDeclaration(decl: t.VariableDeclaration): t.VariableDeclaration[] | null {
		if (decl.declarations.length !== 1) return null;
		const d = decl.declarations[0];
		if (!t.isVariableDeclarator(d)) return null;
		if (!t.isObjectPattern(d.id)) return null;
		if (!d.init || !t.isCallExpression(d.init)) return null;
		if (!t.isIdentifier(d.init.callee) || !d.init.callee.name.startsWith('use')) return null;

		const hookName = d.init.callee.name;
		const selectorArg = d.init.arguments[0];
		if (!selectorArg || (!t.isArrowFunctionExpression(selectorArg) && !t.isFunctionExpression(selectorArg))) return null;

		const ret = getReturnExpression(selectorArg);
		if (!ret || !t.isObjectExpression(ret)) return null;

		const param = selectorArg.params[0];
		if (!param || !t.isIdentifier(param)) return null;

		const objectProps: Array<{ key: string; memberProp: string }> = [];
		for (const prop of ret.properties) {
			if (!t.isObjectProperty(prop) || prop.computed) return null;
			const key = t.isIdentifier(prop.key) ? prop.key.name : t.isStringLiteral(prop.key) ? prop.key.value : null;
			if (!key) return null;
			if (!t.isMemberExpression(prop.value) || prop.value.computed) return null;
			if (!t.isIdentifier(prop.value.object) || prop.value.object.name !== param.name) return null;
			if (!t.isIdentifier(prop.value.property)) return null;
			objectProps.push({ key, memberProp: prop.value.property.name });
		}

		const destructured = new Map<string, string>();
		for (const p of d.id.properties) {
			if (!t.isObjectProperty(p) || p.computed) return null;
			const key = t.isIdentifier(p.key) ? p.key.name : t.isStringLiteral(p.key) ? p.key.value : null;
			if (!key) return null;
			const local = t.isIdentifier(p.value) ? p.value.name : null;
			if (!local) return null;
			destructured.set(key, local);
		}

		const replacements: t.VariableDeclaration[] = [];
		for (const { key, memberProp } of objectProps) {
			const localName = destructured.get(key);
			if (!localName) return null;
			replacements.push(
				t.variableDeclaration(decl.kind, [
					t.variableDeclarator(
						t.identifier(localName),
						t.callExpression(t.identifier(hookName), [
							t.arrowFunctionExpression(
								[t.identifier(param.name)],
								t.memberExpression(t.identifier(param.name), t.identifier(memberProp)),
							)
						]),
					),
				]),
			);
		}

		return replacements.length > 0 ? replacements : null;
	}

	function rewriteInStatements(statements: t.Statement[]) {
		for (let i = 0; i < statements.length; i++) {
			const stmt = statements[i];
			if (t.isVariableDeclaration(stmt)) {
				const replacements = tryRewriteVariableDeclaration(stmt);
				if (replacements) {
					statements.splice(i, 1, ...replacements);
					changed = true;
					i += replacements.length - 1;
					continue;
				}
			}

			// Recurse into any nested statement lists
			const keys = t.VISITOR_KEYS[stmt.type] || [];
			for (const key of keys) {
				const value = (stmt as any)[key] as any;
				if (!value) continue;
				if (t.isBlockStatement(value)) {
					rewriteInStatements(value.body);
				} else if (t.isProgram(value)) {
					rewriteInStatements(value.body);
				} else if (Array.isArray(value)) {
					for (const item of value) {
						if (item && t.isBlockStatement(item)) rewriteInStatements(item.body);
					}
				} else if (value && t.isStatement(value)) {
					// e.g. IfStatement consequent/alternate can be a single Statement
					if (t.isBlockStatement(value)) rewriteInStatements(value.body);
				}
			}
		}
	}

	try {
		rewriteInStatements(ast.program.body);
	} catch (error) {
		logSafetyGateError('deterministic split rewrite failed', error);
		return { code, changed: false };
	}

	if (!changed) return { code, changed: false };
	try {
		return { code: generateCode(ast).code, changed: true };
	} catch (error) {
		logSafetyGateError('generateCode failed in deterministic split', error);
		return { code, changed: false };
	}
}

export async function runPreDeploySafetyGate(args: {
	files: FileOutputType[];
	env: Env;
	inferenceContext: InferenceContext;
	query: string;
	template: TemplateDetails;
	phase: PhaseConceptType;
}): Promise<FileOutputType[]> {
	try {
		const updatedFiles: FileOutputType[] = [];
		const needsFixer: Array<{ file: FileOutputType; findings: SafetyFinding[] }> = [];

		for (const file of args.files) {
			if (!/\.(ts|tsx|js|jsx)$/.test(file.filePath)) {
				updatedFiles.push(file);
				continue;
			}

			const splitResult = tryDeterministicSplitObjectSelectorDestructuring(file.fileContents);
			const afterDeterministic = splitResult.changed ? splitResult.code : file.fileContents;

			const secondFindings = detectPreDeploySafetyFindings(afterDeterministic);

			const updated: FileOutputType = splitResult.changed ? { ...file, fileContents: afterDeterministic } : file;
			updatedFiles.push(updated);

			if (secondFindings.length > 0) {
				needsFixer.push({ file: updated, findings: secondFindings });
			}
		}

		if (needsFixer.length === 0) {
			return updatedFiles;
		}

		let realtimeCodeFixer: RealtimeCodeFixer;
		try {
			realtimeCodeFixer = new RealtimeCodeFixer(args.env, args.inferenceContext);
		} catch (error) {
			logSafetyGateError('RealtimeCodeFixer constructor failed', error);
			return updatedFiles;
		}

		const fixedResults = await Promise.allSettled(
			needsFixer.map(async ({ file, findings }) => {
				const issuesText = findings.map((f) => {
					const loc = f.line
						? `${file.filePath}:${f.line}${typeof f.column === 'number' ? `:${f.column}` : ''}`
						: file.filePath;
					return `${loc} - ${f.message}`;
				});

				try {
					return await realtimeCodeFixer.run(
						file,
						{ query: args.query, template: args.template },
						args.phase,
						issuesText,
						3,
					);
				} catch (error) {
					logSafetyGateError('RealtimeCodeFixer.run threw', error, { filePath: file.filePath });
					return file;
				}
			}),
		);

		const fixedByPath = new Map<string, FileOutputType>();
		for (const res of fixedResults) {
			if (res.status === 'fulfilled') {
				fixedByPath.set(res.value.filePath, res.value);
			} else {
				logSafetyGateError('RealtimeCodeFixer.run rejected', res.reason);
			}
		}

		return updatedFiles.map((f) => fixedByPath.get(f.filePath) ?? f);
	} catch (error) {
		logSafetyGateError('runPreDeploySafetyGate unexpected failure', error);
		return args.files;
	}
}
