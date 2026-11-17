import { readFile } from 'node:fs/promises';
export async function runToEnd(service, id, text, context) {
    let output = '';
    let specPlan;
    for await (const event of service.send(id, typeof text === 'string' ? { text } : text, context)) {
        if (event.type === 'text')
            output += event.text ?? '';
        if (event.type === 'completed' && event.text && !output)
            output = event.text;
        if (event.type === 'artifact' && event.kind === 'spec' && event.text)
            specPlan = event.text;
    }
    return { sessionId: id, text: specPlan ?? output, status: service.session(id).status };
}
const string = { type: 'string' };
const output = { schema: { type: 'object', additionalProperties: true },
    render: (_args, value) => [{ type: 'text', text: value.text ?? JSON.stringify(value) }] };
const definition = (name, description, properties, required, execute) => ({ name, description,
    parameters: { type: 'object', properties, required, additionalProperties: false }, output, execute });
export function runtimeTools(service, ctx) {
    const context = exec => ({ parent: exec.agent, signal: exec.signal });
    const settings = { runtime: { type: 'string', enum: ['native', 'cursor', 'droid'] }, cwd: string, model: string, provider: string,
        onlyTools: { type: 'array', items: string, minItems: 1 }, autonomy: { type: 'string', enum: ['off', 'low', 'medium', 'high'] } };
    const tools = [
        definition('runtime_create', 'Create an isolated runtime session. runtime defaults to native. Use runtime_send to begin.', settings, ['cwd'], (args, exec) => service.create(args, context(exec))),
        definition('runtime_resume', 'Reconnect an existing runtime session without resending its last message.', { sessionId: string }, ['sessionId'], (args, exec) => service.resume(args.sessionId, context(exec))),
        definition('runtime_send', 'Send a bounded task or follow-up to a runtime session and await its result. Explicit context, constraints and selected text artifacts are forwarded; parent history is not. Runtime permission requests appear in the runtime panel.', { sessionId: string, text: string, context: string, constraints: { type: 'array', items: string }, artifacts: { type: 'array', items: string, maxItems: 10 } }, ['sessionId', 'text'], (args, exec) => runToEnd(service, args.sessionId, args, context(exec))),
        definition('runtime_list', 'List runtime capabilities and sessions.', {}, [], () => service.list()),
        definition('runtime_models', 'List the model ids one agent runtime advertises. Use them as runtime_create model values.', { runtime: { type: 'string', enum: ['cursor', 'droid'] } }, ['runtime'], async (args) => {
            const { models } = await service.catalog(args.runtime);
            return { runtime: args.runtime, models,
                text: models.length === 0 ? `${args.runtime} advertises no models` : models.map(model => `${model.id}${model.name && model.name !== model.id ? ` — ${model.name}` : ''}`).join('\n') };
        }),
        definition('runtime_cancel', 'Interrupt the exact active run while preserving its session.', { sessionId: string, runId: string }, ['sessionId', 'runId'], async (args) => { await service.cancel(args.sessionId, args.runId); return { text: 'Interrupted' }; }),
        definition('runtime_close', 'Release an idle runtime connection; keep persisted history and worktree.', { sessionId: string }, ['sessionId'], async (args) => { await service.close(args.sessionId); return { text: 'Closed' }; }),
        definition('runtime_fork', 'Fork a supported idle runtime session; capabilities describe availability.', { sessionId: string }, ['sessionId'], args => service.fork(args.sessionId)),
        definition('runtime_settings', 'Update a supported idle runtime session model settings.', { sessionId: string, model: string, specModel: string, reasoningEffort: string }, ['sessionId'], args => service.updateSettings(args.sessionId, args).then(() => ({ text: 'Settings updated' }))),
        definition('runtime_apply', 'Apply a reviewed runtime patch to its original workspace after an explicit user confirmation. Refuses source drift.', { sessionId: string }, ['sessionId'], async (args, exec) => {
            const session = service.session(args.sessionId);
            if (!session.patchPath || service.live.has(session.id))
                throw new Error('No settled patch to apply');
            const selectedPatch = session.patchPath;
            const approved = await service.question?.({ title: 'Apply runtime changes', text: `Apply ${session.patchPath} to ${session.workspace.source}?`, context: context(exec) });
            if (!approved)
                throw new Error('Patch application was not confirmed');
            if (service.live.has(session.id) || service.operations.has(session.id) || session.patchPath !== selectedPatch)
                throw new Error('Runtime result changed during confirmation; review it again');
            service.operations.add(session.id);
            let release, releaseSource;
            try {
                release = service.workspaces.acquire(session);
                releaseSource = service.workspaces.acquireSource(session);
                await service.workspaces.applyResult(session, await readFile(selectedPatch, 'utf8'));
            }
            finally {
                releaseSource?.();
                release?.();
                service.operations.delete(session.id);
            }
            return { text: 'Patch applied', sessionId: session.id };
        }),
    ];
    for (const mode of ['review', 'spec', 'mission']) {
        tools.push(definition(`droid_${mode}`, mode === 'review'
            ? 'Independent read-only Droid review of a frozen tracked Git diff (HEAD to working tree, excluding untracked files). Returns validated findings.'
            : mode === 'spec' ? 'Plan with Droid Spec Mode and save the plan without starting implementation.'
                : 'Run a Factory Mission in an isolated worktree. Requires a real DSH user confirmation, high autonomy and already-enabled Extra Usage.', { cwd: string, text: string, model: string, specModel: string, workerModel: string, validatorModel: string }, ['cwd', 'text'], async (args, exec) => {
            const session = await service.create({ ...args, runtime: 'droid', mode,
                ...(['review', 'spec'].includes(mode) ? { onlyTools: mode === 'review' ? ['Read', 'Grep', 'Glob', 'LS'] : ['Read', 'Grep', 'Glob', 'LS', 'ExitSpecMode'] } : {}) }, context(exec));
            let prompt = args.text;
            if (mode === 'review')
                prompt = `${args.text}\nReview ONLY this frozen tracked Git diff (SHA-256 ${session.workspace.diffHash}). Read-only; no implementation. Return JSON only: {"findings":[{"severity":"blocker|major|minor","file":"path","line":1,"description":"actionable issue"}]}.\n${session.workspace.diff}`;
            if (mode === 'spec')
                prompt = `${args.text}\nPlanning only. Produce a complete implementation plan. Do not implement it.`;
            const result = await runToEnd(service, session.id, prompt, context(exec));
            if (result.status !== 'completed')
                return result;
            let artifact = result.text;
            if (mode === 'review') {
                const parsed = JSON.parse(result.text.replace(/^```(?:json)?\s*|\s*```$/g, ''));
                if (!Array.isArray(parsed.findings) || parsed.findings.some(f => !['blocker', 'major', 'minor'].includes(f.severity) || typeof f.file !== 'string' || !Number.isInteger(f.line) || f.line < 1 || typeof f.description !== 'string'))
                    throw new Error('Droid review returned invalid findings; raw events retained');
                artifact = JSON.stringify({ diffHash: session.workspace.diffHash, findings: parsed.findings }, null, 2);
                result.findings = parsed.findings;
            }
            const path = await service.store.artifact(session.id, mode === 'review' ? 'review.json' : mode === 'spec' ? 'spec.md' : 'mission.md', artifact);
            await service.append(service.session(session.id), null, { type: 'artifact', path, kind: mode });
            return { ...result, artifact: path };
        }));
    }
    return tools;
}
