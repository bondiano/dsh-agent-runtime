import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { bridgeMessage } from '../lib/context.js';
test('context bridge forwards selected text artifacts and constraints with bounds', async (t) => {
    const directory = await mkdtemp(join(tmpdir(), 'dsh-context-'));
    t.after(() => rm(directory, { recursive: true, force: true }));
    const path = join(directory, 'plan.md');
    await writeFile(path, 'approved plan');
    const message = await bridgeMessage({ text: 'Implement', context: 'component A', constraints: ['No new dependencies'], artifacts: [path] });
    assert.match(message.text, /approved plan/);
    assert.match(message.text, /No new dependencies/);
    await assert.rejects(bridgeMessage({ text: 'go', artifacts: ['relative'] }), /absolute/);
    await writeFile(path, 'x'.repeat(100_001));
    await assert.rejects(bridgeMessage({ text: 'go', artifacts: [path] }), /below 100 KB/);
});
