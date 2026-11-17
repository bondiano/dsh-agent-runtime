import test from 'node:test';
import assert from 'node:assert/strict';
import { AgentRuntime } from '../lib/runtime.js';
function fixture(saved = [], overrides = {}) {
    let state = structuredClone(saved);
    const store = { load: async () => state, save: async (rows) => { state = structuredClone(rows); }, artifact: async () => '/local/result.patch' };
    const workspaces = { prepare: async (id, options) => ({ cwd: `/work/${id}`, source: options.cwd, git: true }), acquire: () => () => { }, patch: async () => null };
    const runtime = new AgentRuntime({ store, workspaces, question: undefined, ...overrides });
    let calls = 0;
    const adapter = { id: 'fake', capabilities: () => ({ resume: true }), create: async () => ({ id: 'provider' }),
        resume: async () => { }, close: async () => { }, getUsage: async () => null,
        async *send() { calls++; yield { type: 'text', text: 'hello' }; }, cancel: async () => { } };
    runtime.register(adapter);
    return { runtime, adapter, store, workspaces, calls: () => calls, state: () => state };
}
const collect = async (stream) => { const rows = []; for await (const row of stream)
    rows.push(row); return rows; };
test('catalog caches adapter models and treats a runtime without a catalog as empty', async () => {
    const { runtime, adapter } = fixture();
    let calls = 0;
    adapter.catalog = async () => { calls++; return { models: [{ id: 'm1', name: 'One' }] }; };
    assert.deepEqual(await runtime.catalog('fake'), { models: [{ id: 'm1', name: 'One' }] });
    assert.deepEqual(await runtime.catalog('fake'), { models: [{ id: 'm1', name: 'One' }] });
    assert.equal(calls, 1);
    const bare = fixture();
    assert.deepEqual(await bare.runtime.catalog('fake'), { models: [] });
});
test('session identity is independent from provider/run identity; usage can be null', async () => {
    const { runtime } = fixture();
    const session = await runtime.create({ runtime: 'fake', cwd: '/source' });
    const events = await collect(runtime.send(session.id, { text: 'go' }));
    assert.notEqual(session.id, session.providerSessionId);
    assert.deepEqual(events.map(row => row.type), ['started', 'text', 'settled']);
    assert.deepEqual(events.map(row => row.sequence), [1, 2, 3]);
    assert.equal((await runtime.events(session.id, 1)).events.length, 2);
    assert.equal(await runtime.getUsage(session.id), null);
    await assert.rejects(runtime.fork(session.id), /unsupported/);
});
test('busy sessions and stale cancellation cannot interrupt another run', async () => {
    const { runtime, adapter } = fixture();
    let release;
    adapter.send = async function* () { yield { type: 'text' }; await new Promise(resolve => { release = resolve; }); };
    const session = await runtime.create({ runtime: 'fake', cwd: '/source' });
    const stream = runtime.send(session.id, { text: 'go' });
    const started = await stream.next();
    await stream.next();
    const finishing = stream.next();
    await assert.rejects(collect(runtime.send(session.id, { text: 'again' })), /busy/);
    await assert.rejects(runtime.cancel(session.id, 'stale'), /no longer active/);
    await runtime.cancel(session.id, started.value.runId);
    release();
    await finishing;
    await stream.next();
    assert.equal(runtime.session(session.id).status, 'cancelled');
});
test('restart marks active runs disconnected and never resends messages', async () => {
    const { runtime, calls } = fixture([{ id: 'old', runtime: 'fake', providerSessionId: 'provider', status: 'running', events: [], sequence: 0, settings: {}, cwd: '/work' }]);
    await runtime.ready;
    assert.equal(runtime.session('old').status, 'disconnected');
    await assert.rejects(collect(runtime.send('old', { text: 'go' })), /Resume/);
    await runtime.resume('old');
    assert.equal(calls(), 0);
});
test('Mission approval cannot be supplied as a model argument and is consumed per run', async () => {
    let questions = 0, allow = false;
    const { runtime, adapter } = fixture([], { question: async () => { questions++; return allow; } });
    runtime.adapters.delete('fake');
    adapter.id = 'droid';
    runtime.register(adapter);
    await assert.rejects(runtime.create({ runtime: 'droid', cwd: '/source', mode: 'mission', missionConfirmed: true }), /not confirmed/);
    allow = true;
    const session = await runtime.create({ runtime: 'droid', cwd: '/source', mode: 'mission' });
    await collect(runtime.send(session.id, { text: 'first' }));
    assert.equal(questions, 2);
    await collect(runtime.send(session.id, { text: 'next' }));
    assert.equal(questions, 3);
});
test('failures release run lock, preserve error and allow a subsequent turn', async () => {
    const { runtime, adapter } = fixture();
    const session = await runtime.create({ runtime: 'fake', cwd: '/source' });
    adapter.send = async function* () { throw new Error('lost connection'); };
    await assert.rejects(collect(runtime.send(session.id, { text: 'go' })), /lost connection/);
    assert.equal(runtime.session(session.id).activeRunId, undefined);
    assert.equal(runtime.session(session.id).status, 'failed');
    assert.equal((await runtime.events(session.id)).events.at(-1).type, 'error');
});
test('provider cancellation and errors cannot settle as successful; stale patches are cleared', async () => {
    const { runtime, adapter } = fixture();
    const session = await runtime.create({ runtime: 'fake', cwd: '/source' });
    runtime.session(session.id).patchPath = '/previous.patch';
    adapter.send = async function* () { yield { type: 'completed', status: 'cancelled' }; };
    await collect(runtime.send(session.id, { text: 'go' }));
    assert.equal(runtime.session(session.id).status, 'cancelled');
    assert.equal(runtime.session(session.id).patchPath, undefined);
    adapter.send = async function* () { yield { type: 'error', message: 'provider rejected' }; };
    await assert.rejects(collect(runtime.send(session.id, { text: 'go' })), /provider rejected/);
    assert.equal(runtime.session(session.id).status, 'failed');
});
test('model arguments cannot turn specialized mode into a writable native session', async () => {
    const { runtime } = fixture();
    await assert.rejects(runtime.create({ runtime: 'fake', cwd: '/source', mode: 'review' }), /require Droid/);
});
