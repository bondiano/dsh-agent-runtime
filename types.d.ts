export interface RuntimeCapabilities {
  resume: boolean; streaming: boolean; usage: boolean; permissions: boolean;
  fork: boolean; settings?: boolean; spec?: boolean; missions: boolean;
}
export interface AgentOptions {
  cwd: string; mode?: 'agent' | 'review' | 'spec' | 'mission'; model?: string;
  provider?: string; reasoningEffort?: string; specModel?: string;
  autonomy?: 'off' | 'low' | 'medium' | 'high'; onlyTools?: string[];
}
export interface AgentSession { id: string; cwd?: string }
export interface AgentMessage { text: string; context?: string; constraints?: string[]; artifacts?: string[] }
export interface AgentEvent { type: string; text?: string; raw?: unknown; [key: string]: unknown }
export interface RuntimeContext { runId: string; signal?: AbortSignal; parent?: unknown; policy?: 'allow' }
export interface AgentRuntime {
  id: string;
  capabilities(): RuntimeCapabilities | Promise<RuntimeCapabilities>;
  create(options: AgentOptions): Promise<AgentSession>;
  resume(sessionId: string, options: AgentOptions): Promise<AgentSession>;
  send(sessionId: string, message: AgentMessage, context: RuntimeContext): AsyncIterable<AgentEvent>;
  cancel(sessionId: string, runId: string): Promise<void>;
  close(sessionId: string): Promise<void>;
  getUsage(sessionId: string): Promise<unknown | null>;
  fork?(sessionId: string, options?: object): Promise<AgentSession>;
  updateSettings?(sessionId: string, settings: Partial<AgentOptions>): Promise<unknown>;
  respond?(sessionId: string, requestId: string, answer: unknown): Promise<void>;
}
