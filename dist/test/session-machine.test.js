import test from 'node:test';
import assert from 'node:assert/strict';
import { agentRuntimeSessionMachine, initialStatus, nextStatus } from '../lib/session.machine.js';
test('session machine owns every runtime status', () => {
    assert.equal(initialStatus(), 'idle');
    let status = initialStatus();
    for (const event of ['SEND', 'WAITING', 'RESUME_RUN', 'COMPLETE', 'SEND', 'CANCEL', 'RESUME']) {
        status = nextStatus(status, event);
    }
    assert.equal(status, 'idle');
    assert.equal(nextStatus('idle', 'FAIL'), 'failed');
    assert.equal(nextStatus('failed', 'SEND'), 'running');
});
test('restore disconnects every non-closed status', () => {
    for (const status of ['idle', 'running', 'waiting', 'completed', 'cancelled', 'failed']) {
        assert.equal(nextStatus(status, 'RESTORE'), 'disconnected');
    }
    assert.equal(nextStatus('disconnected', 'RESUME'), 'idle');
});
test('illegal transitions fail loudly', () => {
    assert.throws(() => nextStatus('disconnected', 'SEND'), /illegal runtime session transition/);
    assert.throws(() => nextStatus('closed', 'CLOSE'), /illegal runtime session transition/);
    assert.equal(agentRuntimeSessionMachine.id, 'agentRuntimeSession');
});
