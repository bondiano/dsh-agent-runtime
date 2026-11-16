import test from 'node:test'
import assert from 'node:assert/strict'
import vm from 'node:vm'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'

const localRequire = createRequire(import.meta.url)
let require = localRequire
try { localRequire.resolve('react-dom/server') }
catch { require = createRequire(new URL('../../../../packages/dsh-runtime/package.json', import.meta.url)) }
const React = require('react')
const { renderToStaticMarkup } = require('react-dom/server')

test('client mounts authenticated controls through existing DSH slots', () => {
  const source = readFileSync(new URL('../client.js', import.meta.url), 'utf8')
  let plugin
  vm.runInNewContext(source, { window: { __ModuleLoader__: { load(bundle) { plugin = bundle.factory(require) } } }, setTimeout, clearTimeout })
  const slots = []
  const ctx = {
    effect() {},
    get() { return { rpc: {} } },
    locale: { bind() { return key => key } },
    slots: {
      inject(name, register) { const result = register(); if (result?.next) for (const value of result) void value },
      register(meta, component) { slots.push({ meta, component }); return {} },
    },
  }
  plugin.apply(ctx)
  assert.equal(slots.length, 7)
  const panel = slots.find(slot => slot.meta.name === 'settings.models.footer')
  const html = renderToStaticMarkup(React.createElement(panel.component, panel.meta.inject()))
  assert.match(html, /aria-label="sessions"/)
  assert.match(html, /<form/)
  assert.match(html, /create/)
  assert.doesNotMatch(html, /skip-permissions|ExtraUsageEnabled/)
})

function helpers() {
  let plugin
  vm.runInNewContext(readFileSync(new URL('../client.js', import.meta.url), 'utf8'), {
    window: { __ModuleLoader__: { load(bundle) { plugin = bundle.factory(require) } } },
  })
  return plugin
}

test('mission task rows use nested events and canonical merged tasks without duplicates', () => {
  const { taskRows } = helpers()
  const rows = taskRows({ tasks: { worker: { id: 'worker', state: 'completed', title: 'Implementation' } } }, [
    { type: 'task', sequence: 1, task: { id: 'worker', state: 'running' } },
    { type: 'task', sequence: 2, task: { id: 'worker', state: 'completed' } },
    { type: 'task', sequence: 3, task: { id: 'validator', state: 'pending', dependsOn: ['worker'] } },
  ])
  assert.equal(rows.length, 2)
  assert.equal(rows[0].title, 'Implementation')
  assert.equal(rows[0].status, 'completed')
  assert.equal(rows[1].dependencies[0], 'worker')
})

test('expired, resolved and previous-run decisions cannot be answered', () => {
  const { pendingRequests } = helpers()
  const base = { type: 'permission', runId: 'current', sequence: 1 }
  const events = [
    { ...base, requestId: 'expired', expired: true },
    { ...base, requestId: 'resolved', resolved: true },
    { ...base, requestId: 'old', runId: 'previous' },
    { ...base, requestId: 'live' },
  ]
  assert.equal(pendingRequests({}, events, []).length, 0)
  const rows = pendingRequests({ activeRunId: 'current' }, events, [])
  assert.equal(rows.length, 1)
  assert.equal(rows[0].requestId, 'live')
  assert.equal(pendingRequests({ activeRunId: 'current' }, events, ['live']).length, 0)
})
