import test from 'node:test';
import assert from 'node:assert/strict';
import { runtimeTools, runToEnd } from '../lib/tools.js';
import { fetchRouteFor } from '../lib/rpc.js';
test('spec artifact is authoritative and is not duplicated by streamed text', async () => {
    const service = { session: () => ({ status: 'completed' }), async *send() {
            yield { type: 'text', text: 'Thinking' };
            yield { type: 'artifact', kind: 'spec', text: 'The plan' };
            yield { type: 'text', text: 'The plan' };
        } };
    assert.equal((await runToEnd(service, 'id', 'plan', {})).text, 'The plan');
});
test('tools render host content blocks from canonical output, not input arguments', () => {
    const tools = runtimeTools({}, {});
    const tool = tools.find(row => row.name === 'runtime_send');
    assert.deepEqual(tool.output.render({ text: 'prompt' }, { text: 'result' }), [{ type: 'text', text: 'result' }]);
});
test('apply rechecks result after real user confirmation', async () => {
    let applied = false;
    const session = { id: 'session', patchPath: '/old.patch', workspace: { source: '/original' } };
    const service = { session: () => session, live: new Map(), operations: new Set(),
        question: async () => { session.patchPath = '/new.patch'; return true; },
        workspaces: { applyResult: async () => { applied = true; } } };
    const tool = runtimeTools(service, {}).find(row => row.name === 'runtime_apply');
    await assert.rejects(tool.execute({ sessionId: session.id }, {}), /changed during confirmation/);
    assert.equal(applied, false);
});
test('cancelled review preserves stop reason and does not parse a partial report', async () => {
    const service = { create: async () => ({ id: 'session', workspace: { diff: 'diff', diffHash: 'hash' } }),
        session: () => ({ status: 'cancelled' }), async *send() { yield { type: 'text', text: 'partial' }; } };
    const tool = runtimeTools(service, {}).find(row => row.name === 'droid_review');
    assert.deepEqual(await tool.execute({ cwd: '/project', text: 'review' }, {}), { sessionId: 'session', text: 'partial', status: 'cancelled' });
});
test('RPC enforces method envelopes and returns server-response errors', async () => {
    const route = fetchRouteFor('agent-runtime.list', async () => { throw new Error('unavailable'); });
    const request = method => new Request('http://localhost/api/agent-runtime.list', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'client-request', rpcId: 'rpc-1', method, payload: {} }) });
    assert.equal((await route.fetch(request('other'))).status, 400);
    const response = await (await route.fetch(request('agent-runtime.list'))).json();
    assert.equal(response.rpcId, 'rpc-1');
    assert.equal(response.result.ok, false);
    assert.equal(response.result.error.message, 'unavailable');
});
