import { homedir } from 'node:os'
import { join } from 'node:path'
import { createHash } from 'node:crypto'
import { AgentRuntime } from './lib/runtime.js'
import { RuntimeStore } from './lib/store.js'
import { Workspaces } from './lib/workspaces.js'
import { runtimeTools, runToEnd } from './lib/tools.js'
import { registerRpc } from './lib/rpc.js'

export { AgentRuntime } from './lib/runtime.js'
export const inject = ['tools']
export async function apply(ctx) {
  const profile = ctx.get('profileContext')?.dir ?? process.env.DSH_PROFILE_DIR ?? 'default'
  const scope = createHash('sha256').update(profile).digest('hex').slice(0, 16)
  const directory = join(process.env.DSH_HOME || join(homedir(), '.dsh'), 'plugins', 'agent-runtime', scope)
  const question = async ({ title, text, context = {} }) => {
    const questions = ctx.get('userQuestions')
    if (!questions?.ask) throw new Error('DSH user-question service unavailable')
    const result = await questions.ask({ questions: [{ id: 'runtime-confirm', header: title, question: text,
      options: [{ label: 'Confirm', description: 'Run the described action' }, { label: 'Cancel', description: 'Leave it unstarted' }] }],
      ...(context.parent ? { agent: context.parent } : {}), ...(context.signal ? { signal: context.signal } : {}) })
    return result.answers?.find(answer => answer.id === 'runtime-confirm')?.selected?.[0] === 'Confirm'
  }
  const service = new AgentRuntime({ store: new RuntimeStore(directory), workspaces: new Workspaces(join(directory, 'worktrees')), question })
  await service.ready
  ctx.provide('agentRuntime', service)
  for (const tool of runtimeTools(service, ctx)) ctx.effect(() => ctx.tools.register(tool), `runtime tool ${tool.name}`)
  const starting = new Set()
  registerRpc(ctx, service, (id, text) => {
    if (starting.has(id)) throw new Error('Session is busy')
    starting.add(id)
    void runToEnd(service, id, text, {}).catch(error => ctx.logger?.warn?.(`runtime ${id}: ${error.message}`)).finally(() => starting.delete(id))
  })
  ctx.inject(['systemPrompt'], scope => scope.effect(() => scope.get('systemPrompt').section({
    name: 'tool:agent-runtime', order: 2820,
    text: 'Agent runtimes are available: runtime_create/runtime_send/runtime_resume/runtime_list, droid_review, droid_spec and droid_mission. They preserve each provider harness. Runtime writing tasks use isolated Git worktrees; review returned patches and use runtime_apply to integrate. Missions require explicit user confirmation. No automatic provider fallback.',
  }), 'runtime guidance'))
  ctx.effect(() => () => {
    for (const [id, active] of service.live) void service.cancel(id, active.runId).catch(() => {})
    for (const adapter of service.adapters.values()) {
      if (adapter.dispose) void adapter.dispose()
      else for (const session of service.sessions.values()) if (session.runtime === adapter.id) void adapter.close(session.providerSessionId).catch(() => {})
    }
  }, 'runtime shutdown')
}
