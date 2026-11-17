# DSH Agent Runtime

Local Cordis registry for autonomous `droid`, `cursor` and `native` sessions.
The existing Cursor LLM provider and ACP delegates continue to work separately.

## Chat tools

- `runtime_create`: `{runtime,cwd,model?,provider?}` creates an isolated session.
- `runtime_send`: `{sessionId,text}` sends a task and waits for settlement.
- `runtime_resume`, `runtime_close`, `runtime_list`, `runtime_cancel` manage sessions.
- `runtime_fork`, `runtime_settings` expose adapter capabilities without emulation.
- `runtime_apply`: applies the saved patch after a real user confirmation and source-drift check.
- `droid_review`, `droid_spec`, `droid_mission`: `{cwd,text,model?,specModel?,workerModel?,validatorModel?}`.

Native sessions must be started by a live DSH agent in chat. External sessions
can also be created and continued in Settings → Models → Agent runtimes. The
same panel is available inside runtime tool cards. It shows tool events, pending
decisions, usage, task dependencies and artifact paths. Provider-specific details
remain available in disclosures. UI actions use the authenticated DSH RPC channel.

## Isolation and integration

Git tasks receive detached worktrees under `$DSH_HOME/plugins/agent-runtime/<profile-scope>/worktrees`.
Snapshots contain HEAD plus tracked staged/unstaged changes; ignored and untracked
source files are deliberately not copied. Commit or explicitly track required new
source files before starting. Requested subdirectories remain the runtime cwd.
Non-Git directories permit one writer at a time; frozen review/spec require Git.

The output patch contains changes relative to that snapshot, including newly
created unignored files. Worktrees and patches remain available after completion,
failure and cancellation. They are never automatically removed or merged.
`runtime_apply` checks that source HEAD and tracked changes still match the
snapshot, then runs `git apply --check` before applying. A conflict requires manual
integration. For a Role Team with multiple isolated worker attempts, apply the
reported patches in candidate order or integrate the final worktree manually;
each candidate is based on the preceding one, not necessarily the original root.

## Factory workflows

Review freezes the tracked diff, identifies it with SHA-256, enforces a read-tool
allowlist and validates the returned JSON findings. Spec saves a planning artifact
and intercepts `ExitSpecMode` so approving a plan cannot begin implementation.
Missions require an explicit DSH user confirmation for every launch, high
autonomy and already-enabled Factory Extra Usage. This plugin does not enable
Extra Usage or expose a raw Factory model API.

Ordinary sessions use the workstation's `allow` policy and high autonomy. Droid
permission and AskUser requests retain their offered options/question identities;
the runtime panel can answer pending requests. Fork, permission callbacks, usage
and settings are exposed according to each adapter's capabilities. Native usage
is currently unknown (`null`); Cursor does not advertise fork or permission callbacks.

## Persistence and API

`agentRuntime` is a Cordis service. `register(adapter)` returns a disposer.
The adapter contract is in `types.d.ts`; service IDs differ from provider session
IDs, and every send has a separate run ID. One send may run per session. Cancel
requires the exact active run ID and preserves the reusable session.

Metadata and the most recent 2,000 events per session are stored atomically in
`$DSH_HOME/plugins/agent-runtime/<profile-scope>/sessions.json` with private filesystem permissions.
Profile scopes keep desktop and web metadata independent.
Native transcripts remain in DSH's existing persistence. Replayed events include
sequence numbers and `firstSequence`; large event payloads are explicitly clipped.
After host restart sessions become disconnected, pending questions expire, and
reconnect never resends a prompt. Provider auth stays with Factory/Cursor/DSH;
credentials are not copied into runtime metadata.

The browser uses `agent-runtime.*` POST RPC methods through the authenticated
connection registry: list, create, events, resume, send, cancel, respond, close,
fork, settings and usage. Browser sends run independently of the polling request;
explicit cancellation interrupts them. Plugin disposal cancels active work and
closes provider connections.

## Validation

Run `node --test extensions/dsh/dsh-{agent-runtime,runtime-droid,runtime-cursor,runtime-native}/test/*.test.js`
from the workstation repository root, plus `node --test scripts/dsh-runtime.integration.test.mjs`, the Role Team and configuration installer suites.
For this standalone repository, run `npm install` then `npm test`; the cross-runtime
Cordis integration test belongs to workstation.
Tests use fake providers/processes and temporary Git repositories; they do not
consume model quota. A successful non-inference protocol handshake does not prove
subscription billing, live tool approvals or billable Mission execution.

## Model catalog

`catalog(runtime)` lists model ids with a 60-second per-runtime cache and backs
the `runtime_models` chat tool through optional `catalog()` methods on the
registered adapters. The role-team settings picker uses it for Cursor and
Factory Droid model ids.
