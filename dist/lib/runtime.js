import { randomUUID } from 'node:crypto';
import { bridgeMessage } from './context.js';
import { initialStatus, nextStatus } from './session.machine.js';
const clone = value => JSON.parse(JSON.stringify(value));
const sessionOptions = options => Object.fromEntries(['model', 'provider', 'reasoningEffort', 'specModel', 'autonomy', 'onlyTools', 'workerModel', 'validatorModel']
    .filter(key => options[key] !== undefined).map(key => [key, options[key]]));
export class AgentRuntime {
    store;
    workspaces;
    question;
    adapters;
    sessions;
    live;
    parents;
    missionCredits;
    operations;
    catalogs;
    ready;
    constructor({ store, workspaces, question }) {
        this.store = store;
        this.workspaces = workspaces;
        this.question = question;
        this.adapters = new Map();
        this.sessions = new Map();
        this.live = new Map();
        this.parents = new Map();
        this.missionCredits = new Set();
        this.operations = new Set();
        this.catalogs = new Map();
        this.ready = this.restore();
    }
    async restore() {
        for (const session of await this.store.load()) {
            if (session.status !== 'closed') {
                try {
                    session.status = nextStatus(session.status, 'RESTORE');
                }
                catch {
                    session.status = 'disconnected';
                }
            }
            for (const event of session.events ?? [])
                if (['permission', 'ask-user'].includes(event.type))
                    event.expired = true;
            delete session.activeRunId;
            this.sessions.set(session.id, session);
        }
    }
    persist() { return this.store.save([...this.sessions.values()]); }
    register(adapter) {
        if (this.adapters.has(adapter.id))
            throw new Error(`Duplicate runtime ${adapter.id}`);
        this.adapters.set(adapter.id, adapter);
        return () => { if (this.adapters.get(adapter.id) === adapter)
            this.adapters.delete(adapter.id); };
    }
    adapter(id) { const adapter = this.adapters.get(id); if (!adapter)
        throw new Error(`Runtime unavailable: ${id}`); return adapter; }
    session(id) { const session = this.sessions.get(id); if (!session)
        throw new Error('Unknown runtime session'); return session; }
    async list() {
        await this.ready;
        return { sessions: clone([...this.sessions.values()]), runtimes: await Promise.all([...this.adapters.values()].map(async (adapter) => ({ id: adapter.id, capabilities: await adapter.capabilities() }))) };
    }
    // Catalogs are account metadata, not session state: cache them briefly so the
    // settings picker does not spawn a provider process on every keystroke.
    async catalog(runtime) {
        await this.ready;
        const adapter = this.adapter(runtime);
        if (typeof adapter.catalog !== 'function')
            return { models: [] };
        const cached = this.catalogs.get(runtime);
        if (cached && Date.now() - cached.at < 60_000)
            return cached.value;
        const value = await adapter.catalog({ cwd: process.cwd() });
        this.catalogs.set(runtime, { at: Date.now(), value });
        return value;
    }
    async create(options = {}, context = {}) {
        await this.ready;
        if (typeof options.cwd !== 'string' || !options.cwd.trim())
            throw new Error('cwd is required');
        const runtime = options.runtime ?? 'native';
        const adapter = this.adapter(runtime);
        const mode = options.mode ?? 'agent';
        if (!['agent', 'review', 'spec', 'mission'].includes(mode))
            throw new Error('Unknown runtime mode');
        if (mode === 'mission' && runtime !== 'droid')
            throw new Error('Missions require Droid');
        if (['review', 'spec'].includes(mode) && runtime !== 'droid')
            throw new Error('Review and spec modes require Droid');
        if (mode === 'mission')
            await this.confirmMission(options, context);
        const id = randomUUID();
        const workspace = await this.workspaces.prepare(id, { ...options, mode });
        const settings = { ...sessionOptions(options), mode, autonomy: options.autonomy ?? 'high',
            ...(['review', 'spec'].includes(mode) ? { onlyTools: ['Read', 'Grep', 'Glob', 'LS', ...(mode === 'spec' ? ['ExitSpecMode'] : [])] } : {}) };
        const provider = await adapter.create({ ...settings, missionConfirmed: mode === 'mission', cwd: workspace.cwd, parent: context.parent });
        const session = { id, runtime, providerSessionId: provider.id, cwd: workspace.cwd, workspace, mode, settings,
            ownerSessionId: context.parent?.sessionId ?? context.parent?.session?.id ?? null,
            status: initialStatus(), sequence: 0, events: [], usage: null, tasks: {} };
        this.sessions.set(id, session);
        if (mode === 'mission')
            this.missionCredits.add(id);
        if (context.parent)
            this.parents.set(id, context.parent);
        try {
            await this.persist();
        }
        catch (error) {
            await adapter.close(provider.id).catch(() => { });
            session.status = nextStatus(session.status, 'FAIL');
            throw error;
        }
        return clone(session);
    }
    async confirmMission(options, context) {
        if (!this.question)
            throw new Error('Mission requires the DSH user-question service');
        const answer = await this.question({ title: 'Factory Mission', text: `Run Mission in ${options.cwd}? Autonomy: high. Factory Extra Usage must already be enabled and may incur charges. Models: ${options.model ?? 'Factory default'}; workers: ${options.workerModel ?? 'default'}; validators: ${options.validatorModel ?? 'default'}.`, context });
        if (answer !== true)
            throw new Error('Mission was not confirmed');
    }
    async resume(id, context = {}) {
        await this.ready;
        const session = this.session(id);
        if (this.live.has(id) || this.operations.has(id))
            throw new Error('Session is busy');
        this.operations.add(id);
        try {
            if (session.mode === 'mission')
                await this.confirmMission({ ...session.settings, cwd: session.workspace.source }, context);
            await this.adapter(session.runtime).resume(session.providerSessionId, { ...session.settings, missionConfirmed: session.mode === 'mission', cwd: session.cwd, parent: context.parent });
            if (session.mode === 'mission')
                this.missionCredits.add(id);
            if (context.parent)
                this.parents.set(id, context.parent);
            session.status = nextStatus(session.status, 'RESUME');
            await this.persist();
            return clone(session);
        }
        finally {
            this.operations.delete(id);
        }
    }
    async append(session, runId, event) {
        // Bound replay memory; callers detect a gap through firstSequence.
        const encoded = JSON.stringify(event);
        const bounded = encoded.length > 256_000 ? { type: event.type, text: encoded.slice(0, 64_000), truncated: true } : event;
        const row = { ...bounded, sessionId: session.id, runtime: session.runtime, runId, sequence: ++session.sequence, timestamp: Date.now() };
        session.events.push(row);
        if (session.events.length > 2000)
            session.events.shift();
        if (row.type === 'usage')
            session.usage = row.usage ?? row;
        if (row.type === 'task') {
            const task = row.task ?? row;
            const key = task.id ?? task.workerSessionId ?? task.featureId;
            if (key)
                session.tasks[key] = { ...session.tasks[key], ...task };
        }
        await this.persist();
        return row;
    }
    async *send(id, message, context = {}) {
        await this.ready;
        message = await bridgeMessage(message);
        const session = this.session(id);
        if (this.live.has(id) || this.operations.has(id))
            throw new Error('Session is busy');
        if (['disconnected', 'closed'].includes(session.status))
            throw new Error('Resume the session before sending');
        if (typeof message?.text !== 'string' || !message.text.trim())
            throw new Error('Message text is required');
        if (message.text.length > 1_000_000)
            throw new Error('Message exceeds 1,000,000 characters; attach a bounded context instead');
        if (session.mode === 'mission' && !this.missionCredits.delete(id))
            await this.confirmMission({ ...session.settings, cwd: session.workspace.source }, context);
        if (this.live.has(id) || this.operations.has(id))
            throw new Error('Session is busy');
        const adapter = this.adapter(session.runtime);
        const runId = randomUUID();
        const controller = new AbortController();
        const signal = context.signal ? AbortSignal.any([context.signal, controller.signal]) : controller.signal;
        const release = this.workspaces.acquire(session);
        this.live.set(id, { runId, controller });
        delete session.patchPath;
        session.activeRunId = runId;
        session.status = nextStatus(session.status, 'SEND');
        const parent = context.parent ?? this.parents.get(id);
        try {
            yield await this.append(session, runId, { type: 'started' });
            for await (const event of adapter.send(session.providerSessionId, message, { runId, signal, parent, policy: 'allow' })) {
                if (event.type === 'error')
                    throw new Error(event.text ?? event.message ?? event.raw?.message ?? 'Runtime failed');
                if (event.type === 'cancelled')
                    controller.abort();
                if (event.type === 'completed' && ['cancelled', 'aborted'].includes(event.status ?? ''))
                    controller.abort();
                if (event.type === 'completed' && ['failed', 'error'].includes(event.status ?? ''))
                    throw new Error(`Runtime ended: ${event.status}`);
                if (event.type === 'permission' || event.type === 'ask-user')
                    session.status = nextStatus(session.status, 'WAITING');
                if (event.type === 'permission-resolved')
                    session.status = nextStatus(session.status, 'RESUME_RUN');
                yield await this.append(session, runId, event);
            }
            session.status = nextStatus(session.status, signal.aborted ? 'CANCEL' : 'COMPLETE');
            session.usage = await Promise.resolve(adapter.getUsage(session.providerSessionId)).catch(() => null);
            if (session.mode !== 'review' && session.mode !== 'spec') {
                const patch = await this.workspaces.patch(session);
                if (patch) {
                    session.patchPath = await this.store.artifact(id, `${runId}.patch`, patch);
                    yield await this.append(session, runId, { type: 'artifact', path: session.patchPath, kind: 'patch' });
                }
            }
            yield await this.append(session, runId, { type: 'settled', status: session.status });
        }
        catch (error) {
            session.status = nextStatus(session.status, signal.aborted ? 'CANCEL' : 'FAIL');
            yield await this.append(session, runId, { type: 'error', text: error instanceof Error ? error.message : String(error) });
            throw error;
        }
        finally {
            for (const event of session.events)
                if (event.runId === runId && ['permission', 'ask-user'].includes(event.type))
                    event.resolved = true;
            delete session.activeRunId;
            this.live.delete(id);
            release();
            await this.persist();
        }
    }
    async cancel(id, runId) {
        const session = this.session(id);
        const active = this.live.get(id);
        if (!active || active.runId !== runId)
            throw new Error('Run is no longer active');
        active.controller.abort();
        await this.adapter(session.runtime).cancel(session.providerSessionId, runId);
    }
    async close(id) {
        const session = this.session(id);
        if (session.status === 'closed')
            return clone(session);
        if (this.live.has(id) || this.operations.has(id))
            throw new Error('Cancel the active run first');
        this.operations.add(id);
        try {
            await this.adapter(session.runtime).close(session.providerSessionId);
            session.status = nextStatus(session.status, 'CLOSE');
            this.parents.delete(id);
            await this.persist();
        }
        finally {
            this.operations.delete(id);
        }
    }
    async respond(id, requestId, answer) {
        const session = this.session(id);
        if (!this.live.has(id))
            throw new Error('No active run');
        const adapter = this.adapter(session.runtime);
        if (!adapter.respond)
            throw new Error('Runtime does not support responses');
        await adapter.respond(session.providerSessionId, requestId, answer);
        for (const event of session.events)
            if (event.requestId === requestId)
                event.resolved = true;
        session.status = nextStatus(session.status, 'ANSWER');
        await this.persist();
    }
    async fork(id, options = {}) {
        const session = this.session(id);
        const adapter = this.adapter(session.runtime);
        if (!adapter.fork)
            throw new Error('Fork unsupported');
        if (this.live.has(id) || this.operations.has(id))
            throw new Error('Session is busy');
        this.operations.add(id);
        try {
            const provider = await adapter.fork(session.providerSessionId, options);
            const child = { ...clone(session), id: randomUUID(), providerSessionId: provider.id, status: initialStatus(), sequence: 0, events: [], tasks: {}, patchPath: undefined };
            // A fork shares its source worktree and therefore its writer lock.
            this.sessions.set(child.id, child);
            if (this.parents.has(id))
                this.parents.set(child.id, this.parents.get(id));
            await this.persist();
            return clone(child);
        }
        finally {
            this.operations.delete(id);
        }
    }
    async updateSettings(id, settings) {
        const session = this.session(id);
        const adapter = this.adapter(session.runtime);
        if (this.live.has(id) || this.operations.has(id))
            throw new Error('Session is busy');
        if (!adapter.updateSettings)
            throw new Error('Settings updates unsupported');
        this.operations.add(id);
        try {
            const safe = sessionOptions(settings);
            await adapter.updateSettings(session.providerSessionId, safe);
            Object.assign(session.settings, safe);
            await this.persist();
        }
        finally {
            this.operations.delete(id);
        }
    }
    async getUsage(id) { const s = this.session(id); return this.adapter(s.runtime).getUsage(s.providerSessionId); }
    async events(id, after = 0) {
        await this.ready;
        const session = this.session(id);
        return { session: clone(session), events: clone(session.events.filter(row => row.sequence > after)), firstSequence: session.events[0]?.sequence ?? 0 };
    }
}
