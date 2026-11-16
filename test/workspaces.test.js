import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, readFile, writeFile, rm, realpath } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { execFileSync } from 'node:child_process'
import { Workspaces } from '../lib/workspaces.js'

test('isolated worktree snapshots tracked dirty files and exports only its changes', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'dsh-workspaces-'))
  t.after(() => rm(directory, { recursive: true, force: true }))
  const git = args => execFileSync('git', ['-C', directory, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
  git(['init']); git(['config', 'user.name', 'Test']); git(['config', 'user.email', 'test@example.invalid'])
  await writeFile(join(directory, 'code.txt'), 'base\n'); git(['add', '.']); git(['commit', '-m', 'base'])
  await writeFile(join(directory, 'code.txt'), 'dirty\n')
  await writeFile(join(directory, 'staged.txt'), 'already staged\n'); git(['add', 'staged.txt'])
  const manager = new Workspaces(join(directory, '.git', 'agent-worktrees'))
  const workspace = await manager.prepare('task', { cwd: directory, mode: 'agent' })
  assert.equal(await readFile(join(workspace.cwd, 'code.txt'), 'utf8'), 'dirty\n')
  assert.equal(await readFile(join(workspace.cwd, 'staged.txt'), 'utf8'), 'already staged\n')
  const session = { id: 'task', cwd: workspace.cwd, workspace }
  assert.equal(await manager.patch(session), '')
  await writeFile(join(workspace.cwd, 'code.txt'), 'result\n')
  const patch = await manager.patch(session)
  assert.match(patch, /-dirty\n\+result/)
  assert.equal(await readFile(join(directory, 'code.txt'), 'utf8'), 'dirty\n')
  await manager.applyResult(session, patch)
  assert.equal(await readFile(join(directory, 'code.txt'), 'utf8'), 'result\n')
  await assert.rejects(manager.applyResult(session, patch), /Source changed/)
})

test('non-Git writers serialize and review refuses an unfrozen workspace', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'dsh-workspaces-'))
  t.after(() => rm(directory, { recursive: true, force: true }))
  const manager = new Workspaces(join(directory, 'copies'))
  const workspace = await manager.prepare('one', { cwd: directory, mode: 'agent' })
  const release = manager.acquire({ id: 'one', cwd: directory, workspace })
  assert.throws(() => manager.acquire({ id: 'two', cwd: directory, workspace }), /active writer/)
  release(); manager.acquire({ id: 'two', cwd: directory, workspace })()
  await assert.rejects(manager.prepare('review', { cwd: directory, mode: 'review' }), /require a Git/)
})

test('a monorepo task keeps its requested subdirectory inside the worktree', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'dsh-subproject-'))
  t.after(() => rm(directory, { recursive: true, force: true }))
  const git = args => execFileSync('git', ['-C', directory, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
  git(['init']); git(['config', 'user.name', 'Test']); git(['config', 'user.email', 'test@example.invalid'])
  await mkdir(join(directory, 'project'))
  await writeFile(join(directory, 'project', 'file'), 'base'); git(['add', '.']); git(['commit', '-m', 'base'])
  const manager = new Workspaces(join(directory, '.git', 'copies'))
  const workspace = await manager.prepare('task', { cwd: join(directory, 'project'), mode: 'agent' })
  assert.equal(workspace.cwd, join(workspace.root, 'project'))
  assert.equal(workspace.sourceCwd, await realpath(join(directory, 'project')))
  assert.equal(await readFile(join(workspace.cwd, 'file'), 'utf8'), 'base')
})
