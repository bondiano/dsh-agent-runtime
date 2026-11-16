import { readFile, stat } from 'node:fs/promises'
import { isAbsolute } from 'node:path'

/** Explicit context only: never forward the parent transcript or credentials. */
export async function bridgeMessage(message) {
  if (typeof message?.text !== 'string' || !message.text.trim()) throw new Error('Message text is required')
  const parts = [message.text]
  if (message.context !== undefined) {
    if (typeof message.context !== 'string') throw new Error('Context must be text')
    parts.push(`Context:\n${message.context}`)
  }
  if (message.constraints !== undefined) {
    if (!Array.isArray(message.constraints) || message.constraints.some(value => typeof value !== 'string')) throw new Error('Constraints must be strings')
    parts.push(`Constraints:\n${message.constraints.join('\n')}`)
  }
  if (message.artifacts !== undefined) {
    if (!Array.isArray(message.artifacts) || message.artifacts.length > 10) throw new Error('At most 10 explicit artifact paths are supported')
    for (const path of message.artifacts) {
      if (typeof path !== 'string' || !isAbsolute(path)) throw new Error('Artifact paths must be absolute')
      const metadata = await stat(path)
      if (!metadata.isFile() || metadata.size > 100_000) throw new Error('Context artifact must be a file below 100 KB')
      parts.push(`Artifact ${path}:\n${await readFile(path, 'utf8')}`)
    }
  }
  const text = parts.join('\n\n')
  if (text.length > 1_000_000) throw new Error('Message exceeds 1,000,000 characters; attach a bounded context instead')
  return { text }
}
