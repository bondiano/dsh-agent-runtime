/**
 * One managed runtime session (lib/runtime.js).
 *
 * The persisted `session.status` string is the machine state; every write goes
 * through `nextStatus`, so an illegal transition fails instead of silently
 * producing a status the UI cannot explain.
 */
import { initialTransition, transition } from 'xstate'
import { createMachine } from 'xstate'

export const agentRuntimeSessionMachine = createMachine({
  id: 'agentRuntimeSession',
  initial: 'idle',
  states: {
    idle: {
      on: {
        SEND: 'running',
        FAIL: 'failed',
        RESTORE: 'disconnected',
        CLOSE: 'closed',
      },
    },
    running: {
      on: {
        ANSWER: 'running',
        WAITING: 'waiting',
        COMPLETE: 'completed',
        CANCEL: 'cancelled',
        FAIL: 'failed',
        RESTORE: 'disconnected',
        CLOSE: 'closed',
      },
    },
    waiting: {
      on: {
        WAITING: 'waiting',
        RESUME_RUN: 'running',
        ANSWER: 'running',
        COMPLETE: 'completed',
        CANCEL: 'cancelled',
        FAIL: 'failed',
        RESTORE: 'disconnected',
        CLOSE: 'closed',
      },
    },
    completed: {
      on: {
        SEND: 'running',
        RESUME: 'idle',
        RESTORE: 'disconnected',
        CLOSE: 'closed',
      },
    },
    cancelled: {
      on: {
        SEND: 'running',
        RESUME: 'idle',
        RESTORE: 'disconnected',
        CLOSE: 'closed',
      },
    },
    failed: {
      on: {
        SEND: 'running',
        RESUME: 'idle',
        RESTORE: 'disconnected',
        CLOSE: 'closed',
      },
    },
    disconnected: {
      on: { RESUME: 'idle', RESTORE: 'disconnected', CLOSE: 'closed' },
    },
    closed: { type: 'final' },
  },
})

/** The status a freshly created session starts in. */
export function initialStatus(): string {
  // Flat machine: the resolved value is always one state name.
  return initialTransition(agentRuntimeSessionMachine)[0].value as string
}

/**
 * Apply one event to a persisted status.
 * @param {string} status current `session.status`.
 * @param {string | { type: string }} event event type or event object.
 * @returns {string} the next status.
 */
export function nextStatus(status: string, event: string | { type: string }): string {
  const eventObject = typeof event === 'string' ? { type: event } : event
  const snapshot = agentRuntimeSessionMachine.resolveState({ value: status })
  if (!snapshot.can(eventObject)) {
    throw new Error(`illegal runtime session transition: ${status} --${eventObject.type}-->`)
  }
  return transition(agentRuntimeSessionMachine, snapshot, eventObject)[0].value as string
}
