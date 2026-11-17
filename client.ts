/** Runtime control surface; all mutations use DSH's authenticated RPC channel. */

/** One selectable option of a pending decision. */
interface DecisionOption { label?: string; name?: string; value?: string; id?: string }

/** One question of a pending ask-user decision. */
interface DecisionQuestion { question: string }

/** One event row replayed from a runtime session feed. */
interface RuntimeEvent {
  type: string
  sequence: number
  runId?: string
  id?: string
  taskId?: string
  requestId?: string
  resolved?: boolean
  expired?: boolean
  text?: string
  status?: string
  kind?: string
  path?: string
  usage?: unknown
  task?: RuntimeTask
  options?: DecisionOption[]
  questions?: DecisionQuestion[]
  raw?: { options?: DecisionOption[]; questions?: DecisionQuestion[]; params?: unknown; message?: string }
  [key: string]: unknown
}

/** One merged Mission task row. */
interface RuntimeTask {
  id?: string
  taskId?: string
  sequence?: number
  title?: string
  text?: string
  state?: string
  status?: string
  parentId?: string
  dependsOn?: string[]
  dependencies?: string[]
  [key: string]: unknown
}

/** Session row as the `list` and `events` RPCs return it. */
interface RuntimeSessionRow {
  id: string
  runtime: string
  status: string
  cwd: string
  activeRunId?: string
  usage?: unknown
  tasks?: Record<string, RuntimeTask>
  [key: string]: unknown
}

interface RuntimeListResult { sessions: RuntimeSessionRow[]; runtimes: (string | { id: string })[] }
interface RuntimeEventsResult { events?: RuntimeEvent[]; session?: RuntimeSessionRow | null }
interface RpcResponse<T> { ok: boolean; value: T; error?: { message?: string } }

/** DSH authenticated RPC channel. */
interface RpcConnection { call<T>(path: string, method: string, data?: object): Promise<RpcResponse<T>> }

type Translate = (key: string) => string

/** React surface the panel uses; DSH injects the real module. */
interface ReactModule {
  createElement(type: unknown, props?: unknown, ...children: unknown[]): unknown
  useState<S>(initial: S): [S, (value: S | ((previous: S) => S)) => void]
  useEffect(setup: () => void | (() => void), deps?: unknown[]): void
}

function isReactModule(value: unknown): value is ReactModule {
  return typeof value === 'object' && value !== null && 'createElement' in value && 'useState' in value && 'useEffect' in value
}

/** Locale dictionaries service. */
interface LocaleService {
  register(namespace: string, dictionaries: Record<string, Record<string, string>>): unknown
  bind(namespace: string): Translate
}

/** DSH slot registry the panels mount into. */
interface SlotsService {
  inject(name: string, register: () => unknown): void
  register(meta: Record<string, unknown>, component: unknown): unknown
}

/** Cordis client context slice the panel uses. */
interface ClientContext {
  effect(callback: () => unknown, label?: string): unknown
  get(name: 'connection'): { rpc?: RpcConnection } | undefined
  locale: LocaleService
  slots: SlotsService
}
/** The client plugin this bundle installs. */
interface ClientPlugin {
  taskRows(session: RuntimeSessionRow | null | undefined, events: RuntimeEvent[]): RuntimeTask[]
  pendingRequests(session: RuntimeSessionRow | null | undefined, events: RuntimeEvent[], resolved: (string | undefined)[]): RuntimeEvent[]
  inject: string[]
  apply(ctx: ClientContext): void
}

interface ModuleBundle { id: string; factory(require: (id: string) => unknown): ClientPlugin }
interface ModuleLoader { load(bundle: ModuleBundle): unknown }
interface Window { __ModuleLoader__: ModuleLoader }

window.__ModuleLoader__.load({
  id: '@local/dsh-agent-runtime',
  factory(require) {
    const react = require('react')
    if (!isReactModule(react)) throw new Error('The agent-runtime panel requires React')
    const React = react
    const h = React.createElement
    const NS = 'agentRuntime'
    const en = { title: 'Agent runtimes', refresh: 'Refresh', empty: 'No runtime sessions yet.', runtime: 'Runtime', directory: 'Working directory', model: 'Model (optional)', message: 'Message', create: 'Create session', send: 'Send', cancel: 'Stop run', resume: 'Reconnect', events: 'Events', tasks: 'Mission tasks', usage: 'Usage', unknown: 'Not reported', answer: 'Answer', submit: 'Submit answer', raw: 'Provider details', error: 'Request failed', mission: 'Launch Missions from droid_mission in chat. DSH asks for confirmation before each launch.', disconnected: 'Disconnected: reconnect to continue. Messages are never resent automatically.', waiting: 'Waiting for a decision', sessions: 'Sessions', details: 'Runtime session', artifacts: 'Artifacts', nativeNote: 'Native sessions require a parent agent: start them from a runtime tool in chat.', loading: 'Loading…' }
    const ru = { title: 'Агентные runtime', refresh: 'Обновить', empty: 'Сессий runtime пока нет.', runtime: 'Runtime', directory: 'Рабочий каталог', model: 'Модель (необязательно)', message: 'Сообщение', create: 'Создать сессию', send: 'Отправить', cancel: 'Остановить запуск', resume: 'Переподключить', events: 'События', tasks: 'Задачи Mission', usage: 'Использование', unknown: 'Нет данных', answer: 'Ответ', submit: 'Отправить ответ', raw: 'Данные провайдера', error: 'Ошибка запроса', mission: 'Запускайте Missions через droid_mission в чате. DSH запрашивает подтверждение перед каждым запуском.', disconnected: 'Соединение потеряно: переподключитесь для продолжения. Сообщения автоматически не повторяются.', waiting: 'Ожидается решение', sessions: 'Сессии', details: 'Сессия runtime', artifacts: 'Артефакты', nativeNote: 'Нативным сессиям нужен родительский агент: запускайте их инструментом runtime из чата.', loading: 'Загрузка…' }
    const zh = { ...en, title: '代理运行时', refresh: '刷新', empty: '暂无运行时会话。', directory: '工作目录', model: '模型（可选）', message: '消息', create: '创建会话', send: '发送', cancel: '停止运行', resume: '重新连接', events: '事件', tasks: '任务', usage: '用量', unknown: '未报告', answer: '回答', submit: '提交回答', raw: '提供方详情', error: '请求失败', sessions: '会话', details: '运行时会话', artifacts: '产物', nativeNote: '原生会话需要父代理：请从聊天中的运行时工具启动。', loading: '加载中…' }
    const CSS = `
.dsh-runtime{min-width:0;max-width:100%;box-sizing:border-box;color:var(--dsw-alias-label-primary);font:inherit;max-width:74rem}
.dsh-runtime h3,.dsh-runtime h4{font:inherit;font-weight:600;margin:1.4rem 0 .7rem}
.dsh-runtime label{display:grid;gap:.35rem;min-width:0}.dsh-runtime-form{display:grid;grid-template-columns:repeat(auto-fit,minmax(12rem,1fr));gap:.85rem}
.dsh-runtime input,.dsh-runtime textarea,.dsh-runtime select,.dsh-runtime button{font:inherit;color:inherit;background:var(--dsw-alias-background-primary);border:1px solid var(--dsw-alias-border-primary);border-radius:6px;padding:.5rem .7rem;min-width:0}
.dsh-runtime input,.dsh-runtime select{width:100%;box-sizing:border-box}.dsh-runtime textarea{width:100%;box-sizing:border-box;min-height:5rem;resize:vertical}.dsh-runtime button{cursor:pointer}.dsh-runtime button:hover{background:var(--dsw-alias-background-secondary)}
.dsh-runtime button:disabled{opacity:.5;cursor:default}.dsh-runtime :focus-visible{outline:2px solid var(--dsw-alias-label-primary);outline-offset:3px}
.dsh-runtime-actions{display:flex;gap:.5rem;flex-wrap:wrap;margin:.7rem 0}.dsh-runtime-layout{display:grid;grid-template-columns:minmax(10rem,1fr) minmax(0,3fr);gap:1.4rem}
.dsh-runtime-list{list-style:none;padding:0}.dsh-runtime-list button{width:100%;text-align:start;overflow-wrap:anywhere;margin-bottom:.35rem}.dsh-runtime-list [aria-pressed=true]{font-weight:600;background:var(--dsw-alias-background-secondary)}
.dsh-runtime pre{white-space:pre-wrap;overflow-wrap:anywhere;max-height:22rem;overflow:auto;font-size:.85em}.dsh-runtime details{padding:.5rem 0;border-bottom:1px solid var(--dsw-alias-border-primary)}
.dsh-runtime summary{cursor:pointer}.dsh-runtime-note{color:var(--dsw-alias-label-secondary);line-height:1.5;max-width:72ch}.dsh-runtime [role=alert]{padding:.7rem;border:1px solid currentColor;overflow-wrap:anywhere}
.dsh-runtime-task{padding:.55rem 0;overflow-wrap:anywhere}.dsh-runtime small{font-variant-numeric:tabular-nums}.dsh-runtime-event{border-bottom:1px solid var(--dsw-alias-border-primary);padding:.55rem 0}
@media(max-width:640px){.dsh-runtime-layout{grid-template-columns:1fr}.dsh-runtime-form{grid-template-columns:1fr}}
`
    const dump = value => JSON.stringify(value, null, 2)
    const messageOf = (error: unknown) => error instanceof Error ? error.message : String(error)
    async function call<T>(rpc: RpcConnection, method: string, data: object = {}) {
      const result = await rpc.call<T>('/api', `agent-runtime.${method}`, data)
      if (!result.ok) throw new Error(result.error?.message ?? 'RPC failed')
      return result.value
    }
    function Decision({ event, rpc, sessionId, t, done, onError }: { event: RuntimeEvent; rpc: RpcConnection; sessionId: string; t: Translate; done: () => void; onError: (message: string) => void }) {
      const [answers, setAnswers] = React.useState<Record<number, string>>({})
      const [busy, setBusy] = React.useState(false)
      const options = event.options ?? event.raw?.options ?? []
      const questions = event.questions ?? event.raw?.questions ?? []
      async function respond(value) {
        setBusy(true)
        try { await call(rpc, 'respond', { sessionId, requestId: event.requestId, answer: event.type === 'permission' ? { selectedOption: value } : value }); done() }
        catch (error) { onError(messageOf(error)) }
        finally { setBusy(false) }
      }
      return h('section', { 'aria-label': t('waiting') }, h('strong', null, t('waiting')),
        h('pre', null, event.text ?? dump(event.questions ?? event.raw?.params ?? event)),
        h('div', { className: 'dsh-runtime-actions' }, options.map((option, index) => h('button', {
          key: index, type: 'button', disabled: busy,
          onClick: () => respond(typeof option === 'string' ? option : option.value ?? option.id ?? option),
        }, typeof option === 'string' ? option : option.label ?? option.name ?? dump(option)))),
        event.type === 'permission' ? null : h('form', { onSubmit: e => { e.preventDefault(); void respond({ answers: questions.map((question, index) => ({ index, question: question.question, answer: answers[index] ?? '' })) }) } },
          questions.map((question, index) => h('label', { key: index }, question.question, h('textarea', { value: answers[index] ?? '', onChange: e => setAnswers(values => ({ ...values, [index]: e.target.value })), required: true }))),
          h('button', { type: 'submit', disabled: busy || !questions.length || questions.some((question, index) => !(answers[index] ?? '').trim()) }, t('submit'))))
    }
    function taskRows(session: RuntimeSessionRow | null | undefined, events: RuntimeEvent[]): RuntimeTask[] {
      const tasks = new Map<string, RuntimeTask>()
      for (const event of events) {
        if (event.type !== 'task') continue
        const task = event.task ?? event
        const id = task.id ?? task.taskId
        if (id) tasks.set(id, { ...tasks.get(id), ...task, id })
      }
      for (const [id, task] of Object.entries(session?.tasks ?? {})) tasks.set(id, { ...tasks.get(id), ...task, id })
      return [...tasks.values()].map(task => ({ ...task, status: task.state ?? task.status ?? '', dependencies: task.dependsOn ?? task.dependencies ?? [] }))
    }
    function pendingRequests(session: RuntimeSessionRow | null | undefined, events: RuntimeEvent[], resolved: (string | undefined)[]): RuntimeEvent[] {
      if (!session?.activeRunId) return []
      return events.filter(event => ['permission', 'ask-user', 'question'].includes(event.type)
        && event.runId === session?.activeRunId && !event.resolved && !event.expired
        && !resolved.includes(event.requestId)
        && !events.some(later => later.sequence > event.sequence && later.requestId === event.requestId && ['permission-resolved', 'decision'].includes(later.type)))
    }
    function Panel({ rpc, t }: { rpc: RpcConnection; t: Translate }) {
      const [data, setData] = React.useState<RuntimeListResult>({ sessions: [], runtimes: [] })
      const [selected, select] = React.useState('')
      const [events, setEvents] = React.useState<RuntimeEvent[]>([])
      const [session, setSession] = React.useState<RuntimeSessionRow | null | undefined>(null)
      const [error, setError] = React.useState('')
      const [busy, setBusy] = React.useState(false)
      const [runtime, setRuntime] = React.useState('native')
      const [cwd, setCwd] = React.useState('')
      const [model, setModel] = React.useState('')
      const [text, setText] = React.useState('')
      const [resolved, setResolved] = React.useState<Array<string | undefined>>([])
      const refresh = async () => setData(await call<RuntimeListResult>(rpc, 'list'))
      React.useEffect(() => {
        let alive = true
        let timer
        async function load() {
          try {
            const next = await call<RuntimeListResult>(rpc, 'list')
            if (alive) { setData(next); setError('') }
            if (selected) {
              const feed = await call<RuntimeEventsResult>(rpc, 'events', { sessionId: selected, after: 0 })
              if (alive) { setEvents(feed.events ?? []); setSession(feed.session) }
            }
          } catch (err) { if (alive) setError(messageOf(err)) }
          if (alive) timer = setTimeout(load, 2000)
        }
        setEvents([]); setSession(null); setResolved([])
        void load()
        return () => { alive = false; clearTimeout(timer) }
      }, [rpc, selected])
      async function act(method: string, payload: object) {
        setBusy(true); setError('')
        try {
          const result = await call<{ id?: string; session?: { id?: string } }>(rpc, method, payload)
          if (method === 'create') select(result.id ?? result.session?.id ?? '')
          if (method === 'send') setText('')
          await refresh()
        } catch (err) { setError(messageOf(err)) }
        finally { setBusy(false) }
      }
      const current = session ?? data.sessions.find(row => row.id === selected)
      const pending = pendingRequests(current, events, resolved)
      const tasks = taskRows(current, events)
      const runtimes = data.runtimes.map(row => typeof row === 'string' ? row : row.id)
      return h('section', { className: 'dsh-runtime' }, h('h3', null, t('title')),
        error ? h('p', { role: 'alert' }, error) : null,
        h('form', { onSubmit: e => { e.preventDefault(); void act('create', { runtime, cwd, ...(model ? { model } : {}) }) } },
          h('div', { className: 'dsh-runtime-form' },
            h('label', null, t('runtime'), h('select', { value: runtime, onChange: e => setRuntime(e.target.value) }, [...new Set(['native', ...runtimes])].map(id => h('option', { key: id, value: id }, id)))),
            h('label', null, t('directory'), h('input', { value: cwd, required: true, onChange: e => setCwd(e.target.value) })),
            h('label', null, t('model'), h('input', { value: model, onChange: e => setModel(e.target.value) }))),
          h('div', { className: 'dsh-runtime-actions' }, h('button', { type: 'submit', disabled: busy }, t('create')), h('button', { type: 'button', onClick: () => void act('list', {}), disabled: busy }, t('refresh')))),
        h('p', { className: 'dsh-runtime-note' }, t('mission')), runtime === 'native' ? h('p', { className: 'dsh-runtime-note' }, t('nativeNote')) : null,
        h('div', { className: 'dsh-runtime-layout' },
          h('nav', { 'aria-label': t('sessions') }, data.sessions.length ? h('ul', { className: 'dsh-runtime-list' }, data.sessions.map(row => h('li', { key: row.id }, h('button', { type: 'button', 'aria-pressed': row.id === selected, onClick: () => select(row.id) }, `${row.runtime} · ${row.status}`, h('br'), h('small', null, row.cwd))))) : h('p', null, t('empty'))),
          current ? h('section', { 'aria-label': t('details') },
            h('h4', null, `${current.runtime} · ${current.status}`), h('p', { className: 'dsh-runtime-note' }, current.cwd),
            current.status === 'disconnected' ? h('p', { role: 'status' }, t('disconnected')) : null,
            h('div', { className: 'dsh-runtime-actions' }, h('button', { disabled: busy || !current.activeRunId, onClick: () => void act('cancel', { sessionId: selected, runId: current.activeRunId }) }, t('cancel')), h('button', { disabled: busy || !!current.activeRunId, onClick: () => void act('resume', { sessionId: selected }) }, t('resume'))),
            pending.map(event => h(Decision, { key: event.requestId, event, rpc, sessionId: selected, t, onError: setError, done: () => setResolved(items => [...items, event.requestId]) })),
            h('form', { onSubmit: e => { e.preventDefault(); void act('send', { sessionId: selected, text }) } }, h('label', null, t('message'), h('textarea', { value: text, onChange: e => setText(e.target.value), required: true })), h('button', { disabled: busy || !!current.activeRunId || !text.trim() }, t('send'))),
            h('h4', null, t('usage')), h('pre', null, current.usage ? dump(current.usage) : t('unknown')),
            tasks.length ? h('section', null, h('h4', null, t('tasks')), h('ul', null, tasks.map(task => h('li', { key: task.taskId ?? task.id ?? task.sequence, className: 'dsh-runtime-task' }, task.title ?? task.text ?? task.id, ' · ', task.status ?? '', task.parentId ? ` ← ${task.parentId}` : '', task.dependencies?.length ? ` ← ${task.dependencies.join(', ')}` : '')))) : null,
            h('h4', null, t('artifacts')), events.filter(event => event.type === 'artifact').map(event => h('details', { key: `artifact-${event.sequence}` }, h('summary', null, event.kind ?? event.path ?? 'Artifact'), h('pre', null, event.text ?? event.path ?? dump(event)))),
            h('h4', null, t('events')), events.map(event => h('div', { key: event.sequence, className: 'dsh-runtime-event' }, h('small', null, `${event.sequence} · ${event.type}`), event.text ? h('pre', null, event.text) : null, h('details', null, h('summary', null, t('raw')), h('pre', null, dump(event)))))) : null))
    }
    function ToolPanel(props: { rpc: RpcConnection; t: Translate }) {
      return h('details', { className: 'dsh-runtime' }, h('summary', null, props.t('title')), h(Panel, props))
    }
    return {
      taskRows, pendingRequests,
      inject: ['slots', 'locale', 'connection'],
      apply(ctx: ClientContext) {
        ctx.effect(() => ctx.locale.register(NS, { en, ru, zh }), 'runtime dictionaries')
        ctx.effect(() => { const style = document.createElement('style'); style.textContent = CSS; document.head.append(style); return () => style.remove() }, 'runtime styles')
        const rpc = ctx.get('connection')?.rpc
        if (!rpc) return
        const t = ctx.locale.bind(NS)
        const inject = () => ({ rpc, t })
        ctx.slots.inject('settings.models.footer', () => ctx.slots.register({ name: 'settings.models.footer', id: 'agent-runtime', order: 30, locale: NS, inject }, Panel))
        ctx.slots.inject('tool.call.toolview', function* () {
          for (const key of ['runtime_send', 'droid_review', 'droid_spec', 'droid_mission', 'runtime_create', 'runtime_resume']) yield ctx.slots.register({ name: 'tool.call.toolview', key, locale: NS, inject }, ToolPanel)
        })
      },
    }
  },
})
