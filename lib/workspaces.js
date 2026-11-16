import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { mkdir, realpath } from 'node:fs/promises'
import { join, resolve, relative } from 'node:path'
import { createHash } from 'node:crypto'

const execute = promisify(execFile)
const hash = text => createHash('sha256').update(text).digest('hex')
async function git(cwd, args) {
  return (await execute('git', ['-C', cwd, ...args], { maxBuffer: 16 * 1024 * 1024 })).stdout
}
async function apply(cwd, patch, check = false) {
  if (!patch) return
  await new Promise((resolvePromise, reject) => {
    const child = execFile('git', ['-C', cwd, 'apply', ...(check ? ['--check'] : []), '--binary', '-'],
      { maxBuffer: 1024 * 1024 }, error => error ? reject(error) : resolvePromise())
    child.stdin.on('error', reject)
    child.stdin.end(patch)
  })
}

export class Workspaces {
  constructor(directory) { this.directory = directory; this.locks = new Map() }
  async prepare(id, options) {
    const source = await realpath(resolve(options.cwd))
    let root
    try { root = (await git(source, ['rev-parse', '--show-toplevel'])).trim() }
    catch {
      if (['review', 'spec'].includes(options.mode)) throw new Error('Review and spec snapshots require a Git repository')
      return { cwd: source, source, git: false }
    }
    const head = (await git(root, ['rev-parse', 'HEAD'])).trim()
    const original = await git(root, ['diff', '--binary', 'HEAD', '--'])
    // Deliberately includes tracked changes only; untracked files are not copied.
    await mkdir(this.directory, { recursive: true, mode: 0o700 })
    const cwd = join(this.directory, id)
    await git(root, ['worktree', 'add', '--detach', cwd, head])
    await apply(cwd, original)
    // Applied patches may contain newly staged source files, including tracked ignored files.
    await git(cwd, ['add', '--all', '--force', '--', '.'])
    const baseline = (await git(cwd, ['write-tree'])).trim()
    return { cwd: join(cwd, relative(root, source)), root: cwd, source: root, sourceCwd: source, git: true, head, baseline, originalHash: hash(original), diff: original, diffHash: hash(original) }
  }
  acquire(session) {
    const key = session.workspace.git ? session.workspace.root ?? session.cwd : session.workspace.source
    if (this.locks.has(key)) throw new Error('Workspace already has an active writer')
    this.locks.set(key, session.id)
    return () => { if (this.locks.get(key) === session.id) this.locks.delete(key) }
  }
  acquireSource(session) {
    const key = `source:${session.workspace.source}`
    if (this.locks.has(key)) throw new Error('Another patch is being applied to this source')
    this.locks.set(key, session.id)
    return () => { if (this.locks.get(key) === session.id) this.locks.delete(key) }
  }
  async patch(session) {
    if (!session.workspace.git) return null
    const root = session.workspace.root ?? session.cwd
    await git(root, ['add', '-N', '.'])
    return git(root, ['diff', '--binary', session.workspace.baseline, '--'])
  }
  async applyResult(session, patch) {
    const workspace = session.workspace
    if (!workspace.git) throw new Error('No isolated Git result')
    const head = (await git(workspace.source, ['rev-parse', 'HEAD'])).trim()
    const original = await git(workspace.source, ['diff', '--binary', 'HEAD', '--'])
    if (head !== workspace.head || hash(original) !== workspace.originalHash) throw new Error('Source changed since snapshot; review and apply the patch manually')
    await apply(workspace.source, patch, true)
    await apply(workspace.source, patch)
  }
}
