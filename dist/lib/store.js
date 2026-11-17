import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
// One host owns this store. Native transcripts remain in DSH's session store.
export class RuntimeStore {
    directory;
    pending;
    constructor(directory) { this.directory = directory; this.pending = Promise.resolve(); }
    async load() {
        try {
            return JSON.parse(await readFile(join(this.directory, 'sessions.json'), 'utf8'));
        }
        catch (error) {
            if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT')
                return [];
            throw error;
        }
    }
    save(sessions) {
        const data = JSON.stringify(sessions);
        const operation = this.pending.then(async () => {
            await mkdir(this.directory, { recursive: true, mode: 0o700 });
            const target = join(this.directory, 'sessions.json');
            await writeFile(`${target}.tmp`, data, { mode: 0o600 });
            await rename(`${target}.tmp`, target);
        });
        this.pending = operation.catch(() => { });
        return operation;
    }
    async artifact(sessionId, name, text) {
        const directory = join(this.directory, sessionId);
        await mkdir(directory, { recursive: true, mode: 0o700 });
        const path = join(directory, name);
        await writeFile(path, text, { mode: 0o600 });
        return path;
    }
}
