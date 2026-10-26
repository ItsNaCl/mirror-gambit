import Anthropic from '@anthropic-ai/sdk'
import { app, ipcMain, safeStorage } from 'electron'
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'

/**
 * The optional Claude coach. The page sends a description of the position (built from the
 * engine and the board reading, see src/lib/coach/claudeContext.ts) and a question; this
 * process adds the API key and calls Claude. The key is encrypted with the operating system's
 * key store (safeStorage) and never leaves this process. Nothing is sent unless the user
 * clicks a coach button.
 */

export const COACH_MODELS = ['claude-opus-5-5', 'claude-sonnet-5-5', 'claude-haiku-5-5'] as const
export type CoachModel = (typeof COACH_MODELS)[number]
const DEFAULT_MODEL: CoachModel = 'claude-opus-5-5'

/** Models that accept the server-side refusal fallback ("default" picks the fallback model). */
const FALLBACK_MODELS = new Set<CoachModel>(['claude-opus-5-5', 'claude-sonnet-5-5'])

type Mode = 'position' | 'move' | 'question' | 'game'
const MODES: Mode[] = ['position', 'move', 'question', 'game']

const LIMITS = { context: 24_000, question: 1_000, turn: 4_000, history: 12 }

// Frozen so it can be cached: nothing in here changes between requests.
const SYSTEM = `You are a chess coach inside Mirror Gambit, a study app. Your student is improving from beginner towards club level and wants to understand positions the way a strong player does.

You receive a description of a position: the FEN, the moves so far, the engine's best lines with scores, and a reading of the board (loose pieces, pins, pawn structure, king safety, outposts). Treat the engine lines and the board reading as the facts. Never invent moves, lines or evaluations that are not given; if you suggest a plan, keep it consistent with the engine's best line. If something is unclear from the data, say so rather than guess.

How to answer:
- Plain language. Use a chess term only if you explain it in the same sentence.
- Concrete: name squares and pieces ("the knight on f3", "the weak d5 square").
- Explain the idea behind a move: what it attacks, defends, prevents or prepares. One main idea is better than five.
- For a mistake: say what it allowed, what was better and why, and one habit that would have caught it.
- End with one short, practical takeaway the student can use in their next game.
- Keep it under 150 words unless asked for a game summary (then under 300 words).
- Scores are from White's point of view in pawns; +1.0 is about a pawn ahead for White. Translate them into words ("White is clearly better") instead of quoting decimals.
- No headings, no emoji. Short paragraphs or a few bullets.`

const EFFORT: Record<Mode, 'low' | 'medium'> = { position: 'low', move: 'low', question: 'low', game: 'medium' }

interface Turn {
  role: 'user' | 'assistant'
  text: string
}

export interface CoachAnswer {
  ok: true
  text: string
  model: string
  usage: { input: number; output: number; cacheRead: number; cacheWrite: number }
}

export interface CoachFailure {
  ok: false
  error: string
}

function keyFile() {
  return path.join(app.getPath('userData'), 'claude-key.bin')
}

function configFile() {
  return path.join(app.getPath('userData'), 'claude-coach.json')
}

function readModel(): CoachModel {
  try {
    const m = JSON.parse(readFileSync(configFile(), 'utf8')).model
    return COACH_MODELS.includes(m) ? m : DEFAULT_MODEL
  } catch {
    return DEFAULT_MODEL
  }
}

function readKey(): string | null {
  try {
    if (!existsSync(keyFile()) || !safeStorage.isEncryptionAvailable()) return null
    return safeStorage.decryptString(readFileSync(keyFile()))
  } catch {
    return null
  }
}

function isString(v: unknown, max: number): v is string {
  return typeof v === 'string' && v.length > 0 && v.length <= max
}

/** Checks everything the page sends; anything unexpected is refused before it reaches the API. */
function parseRequest(raw: unknown): { mode: Mode; context: string; question: string | null; history: Turn[] } | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  if (!MODES.includes(r.mode as Mode)) return null
  if (!isString(r.context, LIMITS.context)) return null
  const question = r.question === undefined || r.question === null ? null : isString(r.question, LIMITS.question) ? r.question : undefined
  if (question === undefined) return null
  const history: Turn[] = []
  if (r.history !== undefined) {
    if (!Array.isArray(r.history) || r.history.length > LIMITS.history) return null
    for (const t of r.history) {
      if (!t || typeof t !== 'object') return null
      const { role, text } = t as Record<string, unknown>
      if ((role !== 'user' && role !== 'assistant') || !isString(text, LIMITS.turn)) return null
      history.push({ role, text })
    }
  }
  return { mode: r.mode as Mode, context: r.context, question, history }
}

function friendlyError(e: unknown): string {
  if (e instanceof Anthropic.AuthenticationError) return 'Claude did not accept the API key. Check it in Settings.'
  if (e instanceof Anthropic.PermissionDeniedError) return 'This API key is not allowed to use that model.'
  if (e instanceof Anthropic.RateLimitError) return 'Too many requests right now. Wait a minute and try again.'
  if (e instanceof Anthropic.APIConnectionError) return 'Could not reach Claude. Check your internet connection.'
  // A 400 means the request itself was refused; its reason is the useful part to report.
  if (e instanceof Anthropic.BadRequestError) return `Claude refused the request: ${e.message.slice(0, 200)}`
  if (e instanceof Anthropic.APIError) return `Claude returned an error (${e.status ?? 'unknown'}). Try again in a moment.`
  return 'Something went wrong while asking the coach.'
}

async function ask(raw: unknown): Promise<CoachAnswer | CoachFailure> {
  const req = parseRequest(raw)
  if (!req) return { ok: false, error: 'The request was not valid.' }
  const apiKey = readKey()
  if (!apiKey) return { ok: false, error: 'Add your Claude API key in Settings first.' }
  const model = readModel()
  const client = new Anthropic({ apiKey, maxRetries: 2, timeout: 120_000 })

  // The position description opens the conversation; follow-up questions build on it.
  const first = req.question ? `${req.context}\n\nQuestion: ${req.question}` : req.context
  const messages: Anthropic.Beta.BetaMessageParam[] =
    req.history.length === 0
      ? [{ role: 'user', content: first }]
      : [{ role: 'user', content: req.context }, ...req.history.map((t) => ({ role: t.role, content: t.text })), ...(req.question ? [{ role: 'user' as const, content: req.question }] : [])]

  try {
    const response = await client.beta.messages.create({
      model,
      max_tokens: 8000,
      system: [{ type: 'text', text: SYSTEM, cache_control: { type: 'ephemeral' } }],
      messages,
      output_config: { effort: EFFORT[req.mode] },
      ...(FALLBACK_MODELS.has(model) ? { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' as const } : {}),
    })
    if (response.stop_reason === 'refusal') return { ok: false, error: 'Claude declined to answer that. Try asking in a different way.' }
    const text = response.content
      .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('\n')
      .trim()
    if (!text) return { ok: false, error: 'The coach did not return an answer. Try again.' }
    const u = response.usage
    return {
      ok: true,
      text,
      model: response.model,
      usage: { input: u.input_tokens, output: u.output_tokens, cacheRead: u.cache_read_input_tokens ?? 0, cacheWrite: u.cache_creation_input_tokens ?? 0 },
    }
  } catch (e) {
    return { ok: false, error: friendlyError(e) }
  }
}

export function setupCoach(log: (line: string) => void) {
  ipcMain.handle('coach:status', () => ({
    canStoreKey: safeStorage.isEncryptionAvailable(),
    hasKey: readKey() !== null,
    model: readModel(),
    models: COACH_MODELS,
  }))

  ipcMain.handle('coach:setKey', (_e, key: unknown) => {
    if (typeof key !== 'string' || !/^sk-ant-[A-Za-z0-9_-]{20,250}$/.test(key.trim())) return { ok: false, error: 'That does not look like a Claude API key (it starts with sk-ant-).' }
    if (!safeStorage.isEncryptionAvailable()) return { ok: false, error: 'This computer cannot store the key securely.' }
    writeFileSync(keyFile(), safeStorage.encryptString(key.trim()))
    log('[coach] API key saved')
    return { ok: true }
  })

  ipcMain.handle('coach:clearKey', () => {
    rmSync(keyFile(), { force: true })
    log('[coach] API key removed')
    return { ok: true }
  })

  ipcMain.handle('coach:setModel', (_e, model: unknown) => {
    if (!COACH_MODELS.includes(model as CoachModel)) return { ok: false, error: 'Unknown model.' }
    writeFileSync(configFile(), JSON.stringify({ model }))
    return { ok: true }
  })

  ipcMain.handle('coach:ask', async (_e, raw: unknown) => {
    const answer = await ask(raw)
    log(answer.ok ? `[coach] ${answer.model} in=${answer.usage.input} out=${answer.usage.output} cacheRead=${answer.usage.cacheRead}` : `[coach] failed: ${answer.error}`)
    return answer
  })
}
