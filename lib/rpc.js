const endpoints = ['list', 'create', 'events', 'resume', 'send', 'cancel', 'respond', 'close', 'fork', 'settings', 'usage']

export function fetchRouteFor(method, handler) {
  return {
    path: `/api/${method}`, methods: ['POST'], requestBody: 'buffered',
    async fetch(request) {
      if (request.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !== 'application/json') return new Response('JSON required', { status: 415 })
      let body
      try { body = await request.json() } catch { return new Response('Invalid JSON', { status: 400 }) }
      if (body?.type !== 'client-request' || typeof body.rpcId !== 'string' || body.method !== method) return new Response('Invalid RPC envelope', { status: 400 })
      let result
      try { result = { ok: true, value: await handler(body.payload ?? {}) } }
      catch (error) { result = { ok: false, error: { code: 'runtime/error', message: error.message } } }
      return Response.json({ type: 'server-response', rpcId: body.rpcId, result })
    },
  }
}

export function registerRpc(ctx, service, background) {
  ctx.inject(['connection'], scope => {
    for (const endpoint of endpoints) {
      const route = fetchRouteFor(`agent-runtime.${endpoint}`, async args => {
        if (!args || typeof args !== 'object' || Array.isArray(args)) throw new Error('Object payload required')
        switch (endpoint) {
          case 'list': return service.list()
          case 'create': return service.create(args)
          case 'events': return service.events(args.sessionId, args.after)
          case 'resume': return service.resume(args.sessionId)
          case 'send': {
            // Detach from the HTTP request lifetime; cancellation is an explicit run operation.
            const session = service.session(args.sessionId)
            if (typeof args.text !== 'string' || !args.text.trim() || args.text.length > 1_000_000) throw new Error('A bounded non-empty message is required')
            if (service.live.has(session.id)) throw new Error('Session is busy')
            background(session.id, args.text)
            return { sessionId: session.id, status: 'starting' }
          }
          case 'cancel': await service.cancel(args.sessionId, args.runId); return {}
          case 'respond': await service.respond(args.sessionId, args.requestId, args.answer); return {}
          case 'close': await service.close(args.sessionId); return {}
          case 'fork': return service.fork(args.sessionId)
          case 'settings': await service.updateSettings(args.sessionId, args.settings ?? {}); return {}
          case 'usage': return service.getUsage(args.sessionId)
        }
      })
      scope.effect(() => scope.get('connection').fetch.register(route), `runtime RPC ${endpoint}`)
    }
  })
}
