# dsh-agent-runtime Contributor Guide

Shared Cordis `agentRuntime` registry (`@local/dsh-agent-runtime`) managing autonomous `droid`, `cursor`, and `native` sessions in DSH. See [README.md](README.md), [DESIGN.md](DESIGN.md), [PRODUCT.md](PRODUCT.md), and [../AGENTS.md](../AGENTS.md).

## Layout

- `index.ts`: Cordis plugin `apply`, registry wiring, and tool/RPC registration.
- `client.ts`: browser settings & runtime panel (`Settings -> Models -> Agent runtimes` and chat tool cards). Note: currently near the 20,000-byte staged-file limit — split helpers into submodules before growing it.
- `lib/`: `runtime.ts`, `session.machine.ts` (`agentRuntimeSession` XState v5 machine), `workspaces.ts` (detached Git worktrees), `tools.ts`, `rpc.ts`, `context.ts`, `store.ts`.
- `types.d.ts`: shared runtime/adapter contracts consumed by `dsh-runtime-*` plugins.
- `test/`: `node:test` suites covering client, context, runtime, session machine, tools/RPC, and workspaces.

## Invariants

- **Worktree isolation:** Git tasks run in detached worktrees under `$DSH_HOME/plugins/agent-runtime/<profile-scope>/worktrees` and are never auto-deleted or auto-merged. `runtime_apply` must check source `HEAD` and tracked changes for drift and run `git apply --check` before applying.
- **Explicit Mission confirmation:** `missionConfirmed: true` may only be set after an actual user confirmation through the host question flow — never from a model tool argument or client boolean.
- **Capabilities honesty:** Never emulate unsupported adapter operations (e.g., `fork`, missing `usage` must stay `null`, not `0`).
- **UI authority:** Follow [DESIGN.md](DESIGN.md) — use incumbent DSH styles and `--dsw-alias-*` tokens; no custom fonts, replacement branding, or raster assets. Keep `client.ts` classic-script compatible.

## Verification

```sh
npm ci
npm run check     # tsc --noEmit && tsc && node --test dist/test/*.test.js
```

Sync `../machines` if `lib/session.machine.ts` changes, and update `../repositories.json` snapshot metadata from the workstation root.
