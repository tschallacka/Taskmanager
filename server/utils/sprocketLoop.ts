// Sprocket's answer on OpenRouter, run on the server: the model is given the run's tools (sprocketRun.ts), each tool
// call it makes is executed here as the person, the results go back to the model, and the final text is streamed to
// the browser. The browser only shows the steps (`agent_tool` events) and the answer; it runs no tools itself.
import { createError } from 'h3'
import { db } from '../db'
import { aiUsageRecords } from '../db/schema'
import type { ApiKeyContext } from './api-keys'
import { runSprocketTool, sprocketRunToolSpecs } from './sprocketRun'

/** Model round trips one answer may take. A runaway loop of tool calls stops here. */
const MAX_STEPS = 8
/** A tool result longer than this is cut before it goes back to the model, to keep the prompt small. */
const MAX_RESULT_CHARS = 60_000
/** A byte goes out this often while tools run, so a proxy does not close the idle stream. */
const HEARTBEAT_MS = 10_000

export interface Usage {
  inputTokens: number
  outputTokens: number
  totalTokens: number
  cost: number
}

interface ProviderToolCall {
  id: string
  type: 'function'
  function: { name: string, arguments: string }
}

export interface ProviderMessage {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string | null
  tool_calls?: ProviderToolCall[]
  tool_call_id?: string
}

interface ChatCompletion {
  choices?: Array<{ message?: { content?: string | null, tool_calls?: ProviderToolCall[] } }>
  usage?: { prompt_tokens?: number, completion_tokens?: number, total_tokens?: number, cost?: number }
  error?: { message?: string }
}

export interface ToolStep {
  id: string
  name: string
  state: 'running' | 'done' | 'failed'
}

function emptyUsage(): Usage {
  return { inputTokens: 0, outputTokens: 0, totalTokens: 0, cost: 0 }
}

function addUsage(total: Usage, part: ChatCompletion['usage']): void {
  if (!part) return
  total.inputTokens += part.prompt_tokens ?? 0
  total.outputTokens += part.completion_tokens ?? 0
  total.totalTokens += part.total_tokens ?? 0
  total.cost += part.cost ?? 0
}

function parseArguments(raw: string): Record<string, unknown> {
  if (!raw.trim()) return {}
  try {
    const value = JSON.parse(raw) as unknown
    return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
  } catch {
    return {}
  }
}

/** One completion without streaming: the model's text, or the tool calls it wants run. */
async function complete(
  apiKey: string,
  model: string,
  messages: ProviderMessage[],
  tools: ReturnType<typeof sprocketRunToolSpecs>,
  thinking: boolean
): Promise<ChatCompletion> {
  const send = (reasoning: { effort?: 'none' | 'medium', exclude?: boolean }) => fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'HTTP-Referer': 'https://taskmanager.local',
      'X-Title': 'Taskmanager',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ model, messages, tools, reasoning, stream: false })
  })

  let res: Response
  try {
    res = await send(thinking ? { effort: 'medium' } : { effort: 'none', exclude: true })
    // Mandatory-thinking models reject `effort: none`; retry once with reasoning hidden instead.
    if (!thinking && !res.ok && [400, 422, 500].includes(res.status)) {
      res = await send({ exclude: true })
    }
  } catch (error) {
    console.error('[AI Chat] Unable to reach OpenRouter', { model, error })
    throw createError({ statusCode: 502, statusMessage: 'Could not reach OpenRouter. Check the server connection and try again.' })
  }

  if (!res.ok) {
    const body = await res.json().catch(() => null) as ChatCompletion | null
    const message = body?.error?.message ?? `OpenRouter request failed (${res.status})`
    console.error('[AI Chat] OpenRouter request failed', { model, status: res.status, error: body })
    throw createError({ statusCode: 502, statusMessage: message })
  }
  return await res.json() as ChatCompletion
}

export interface AnswerResult {
  text: string
  usage: Usage
  /** Whether the model used any tool to answer. */
  usedTools: boolean
}

/**
 * The answer to one conversation, with the run's tools. The model may call tools in several steps; each call is run as
 * the person (runSprocketTool) and its result sent back. Stops with the model's text, or after MAX_STEPS.
 */
export async function answerWithTools(opts: {
  apiKey: string
  model: string
  messages: ProviderMessage[]
  context: ApiKeyContext
  thinking: boolean
  onStep: (step: ToolStep) => void
}): Promise<AnswerResult> {
  const tools = sprocketRunToolSpecs(opts.context)
  const usage = emptyUsage()
  const messages = [...opts.messages]
  let usedTools = false

  for (let step = 0; step < MAX_STEPS; step++) {
    const completion = await complete(opts.apiKey, opts.model, messages, tools, opts.thinking)
    addUsage(usage, completion.usage)
    const message = completion.choices?.[0]?.message
    const calls = message?.tool_calls ?? []

    if (!calls.length) return { text: message?.content ?? '', usage, usedTools }

    usedTools = true
    messages.push({ role: 'assistant', content: message?.content ?? null, tool_calls: calls })
    for (const call of calls) {
      const name = call.function.name
      opts.onStep({ id: call.id, name, state: 'running' })
      let content: string
      let state: ToolStep['state'] = 'done'
      try {
        const value = await runSprocketTool(name, parseArguments(call.function.arguments), opts.context)
        content = JSON.stringify(value) ?? 'null'
      } catch (error) {
        state = 'failed'
        content = `Error: ${error instanceof Error ? error.message : 'the tool failed'}`
      }
      if (content.length > MAX_RESULT_CHARS) content = `${content.slice(0, MAX_RESULT_CHARS)}… (cut short)`
      opts.onStep({ id: call.id, name, state })
      messages.push({ role: 'tool', tool_call_id: call.id, content })
    }
  }
  throw createError({ statusCode: 502, statusMessage: 'Sprocket took too many steps on this question. Ask it in smaller parts.' })
}

/**
 * The chat answer as NDJSON, the same protocol the browser reads: `agent_tool` for each step, `ping` while it works,
 * then the text as `delta` and `done`, or `error`. Usage is recorded once the answer ends.
 */
export function sprocketAnswerStream(opts: {
  userId: string
  apiKey: string
  model: string
  messages: ProviderMessage[]
  context: ApiKeyContext
  thinking: boolean
  /** Gives back the message counted against the daily limit; called when no answer came of it. */
  refund?: () => Promise<void>
}): Response {
  const encoder = new TextEncoder()
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let open = true
      const send = (obj: unknown) => {
        if (!open) return
        try {
          controller.enqueue(encoder.encode(JSON.stringify(obj) + '\n'))
        } catch {
          open = false
        }
      }
      const heartbeat = setInterval(() => send({ type: 'ping' }), HEARTBEAT_MS)
      let usage = emptyUsage()
      let usedTools = false
      try {
        const result = await answerWithTools({
          ...opts,
          onStep: step => send({ type: 'agent_tool', id: step.id, name: step.name, state: step.state })
        })
        usage = result.usage
        usedTools = result.usedTools
        if (result.text) send({ type: 'delta', text: result.text })
        send({ type: 'done' })
      } catch (error) {
        console.error('[AI Chat] Answer failed', { model: opts.model, error })
        await opts.refund?.().catch(refundError => console.error('[AI Chat] Failed to refund the message count', { refundError }))
        send({ type: 'error', message: error instanceof Error ? error.message : 'Sprocket could not answer' })
      } finally {
        clearInterval(heartbeat)
        try {
          await db.insert(aiUsageRecords).values({
            id: crypto.randomUUID(),
            userId: opts.userId,
            action: usedTools ? 'chat-tools' : 'chat',
            model: opts.model,
            inputTokens: usage.inputTokens,
            outputTokens: usage.outputTokens,
            totalTokens: usage.totalTokens,
            cost: usage.cost.toFixed(8)
          })
        } catch (error) {
          console.error('[AI Chat] Failed to save usage record', { userId: opts.userId, error })
        }
        try {
          controller.close()
        } catch {
          // Already closed by the runtime.
        }
      }
    }
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'application/x-ndjson; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      'X-Accel-Buffering': 'no'
    }
  })
}
