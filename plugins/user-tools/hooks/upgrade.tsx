// Prompt Upgrade: holds a prompt back, asks a few quick questions about it and rewrites it into a
// prompt that asks Claude for a plan, then lets the person send, edit or drop it.
import { atom, read, update } from 'claude-code'
import type { EngineInterface as Engine, RenderInput } from 'claude-code'

import type { Question, Upgrade } from '../types'

export const UPGRADE_PANE = 'prompt-upgrade'
const YELLOW = '#e8b84a'
const STEPS = ['Your prompt', 'Questions', 'Rewrite', 'Review'] as const

const isUpgradeOn = atom({ plugin: 'user-tools', key: 'isUpgradeOn' } as const, false)
// Change the tag when Upgrade's fields change: it declines what an earlier version stored.
const upgrade = atom({ plugin: 'user-tools', key: 'upgrade' } as const, null, { shape: 'upgrade-1' })

const ASK = `You help a person turn a short request into a good request for a plan.
Ask up to 3 multiple-choice questions whose answers would most change the plan (goal, audience, scope, budget, constraints, timeline...).
Each question has 3 or 4 short, concrete options. Write in the same language as the request.
Answer with JSON only, no prose: {"questions":[{"text":"...","options":["...","..."]}]}`

const REWRITE = `Rewrite the person's request into a clear prompt that asks Claude to first produce a plan.
Use their answers as facts; where they skipped, let Claude choose sensible assumptions and state them.
Structure: the goal, the context and constraints, what the plan must cover, and the format of the deliverable (phases or steps, owners, timeline, how success is measured).
Write it in the same language as the request, in the person's voice ("I need..."). Output only the rewritten prompt.`

/** The first JSON object in a model's answer, or undefined. */
function jsonIn (text: string): unknown {
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start < 0 || end <= start) return undefined
  try {
    return JSON.parse(text.slice(start, end + 1))
  } catch {
    return undefined
  }
}

function questionsIn (text: string): Question[] {
  const parsed = jsonIn(text) as { questions?: unknown } | undefined
  if (!Array.isArray(parsed?.questions)) return []
  return parsed.questions
    .filter((q): q is { text: string, options: unknown[] } => typeof q?.text === 'string' && Array.isArray(q?.options))
    .slice(0, 3)
    .map(q => ({ text: q.text, options: q.options.filter((o): o is string => typeof o === 'string').slice(0, 4) }))
}

/** Writes the upgrade only while it is still the one `id` names: a cancelled one stays gone. */
function patch ($: Engine, id: number, fn: (now: Upgrade) => Upgrade) {
  return update($, upgrade, now => (now && now.id === id ? fn(now) : now))
}

/** Holds `prompt` back and starts asking about it. */
export async function startUpgrade ($: Engine, prompt: string, model: string) {
  const id = await $.clock.now()
  const fresh: Upgrade = { id, prompt, stage: 'questions', questions: null, answers: [], typing: null, rewritten: null, error: null }
  await update($, upgrade, () => fresh)
  void $.ui.open({ id: UPGRADE_PANE, title: 'Prompt Upgrade', focus: true })
  const r = await $.model.complete({ model, system: ASK, prompt: `Request: ${prompt}`, maxTokens: 800, effort: 'low' })
  const questions = r.isAnswered ? questionsIn(r.text) : []
  if (questions.length === 0) return rewrite($, id, model)
  await patch($, id, now => ({ ...now, questions, answers: questions.map(() => null) }))
}

async function rewrite ($: Engine, id: number, model: string) {
  let asked = ''
  await patch($, id, now => {
    asked = (now.questions ?? [])
      .map((q, i) => `- ${q.text} ${now.answers[i] ? `→ ${now.answers[i]}` : '→ (skipped)'}`)
      .join('\n')
    return { ...now, stage: 'rewrite', typing: null }
  })
  const now = await read($, upgrade)
  if (!now || now.id !== id) return
  const r = await $.model.complete({
    model,
    system: REWRITE,
    prompt: `Request: ${now.prompt}\n\nAnswers:\n${asked || '(none)'}`,
    maxTokens: 2000,
  })
  await patch($, id, up => r.isAnswered && r.text.trim()
    ? { ...up, stage: 'review', rewritten: r.text.trim() }
    : { ...up, stage: 'error', error: 'The model did not answer. Send the original or cancel.' })
}

export async function endUpgrade ($: Engine) {
  await update($, upgrade, () => null)
  await $.ui.close({ id: UPGRADE_PANE })
}

async function send ($: Engine, text: string) {
  await endUpgrade($)
  await $.prompt.submit({ text, asUser: true })
}

async function editInPrompt ($: Engine, text: string) {
  await endUpgrade($)
  await $.prompt.fill({ text, mode: 'replace' })
}

function answer ($: Engine, id: number, index: number, value: string | null) {
  return patch($, id, now => ({ ...now, answers: now.answers.map((a, i) => (i === index ? value : a)), typing: null }))
}

function typeOther ($: Engine, id: number, index: number) {
  return patch($, id, now => ({ ...now, typing: index }))
}

/** The switch, as the person left it last session. */
export async function loadUpgradeSwitch ($: Engine) {
  const stored = (await $.store.get('isUpgradeOn')) === true
  await update($, isUpgradeOn, () => stored)
}

export function isUpgrading ($: Engine) {
  return read($, isUpgradeOn)
}

/** Whether a prompt is held back already. */
export async function isBusy ($: Engine) {
  return (await read($, upgrade)) !== null
}

export async function switchUpgrade ($: Engine) {
  let isOn = false
  await update($, isUpgradeOn, now => (isOn = !now))
  await $.store.set('isUpgradeOn', isOn)
  if (!isOn && (await isBusy($))) await endUpgrade($)
}

/** The pane closed by hand: the prompt it held is dropped. */
export async function dropUpgrade ($: Engine) {
  await update($, upgrade, () => null)
}

export async function renderUpgrade ($: Engine, e: RenderInput<'Pane'>, model: string) {
  const table = $.ui.resolve(e)
  const { Box, Button, Text } = table
  // A surface without a text field (mobile) offers the options alone.
  const Input = 'Input' in table ? table.Input : undefined
  const up = await read($, upgrade)
  if (!up) return <Text dimColor>No prompt to upgrade. Turn on Prompt Upgrade in User Tools and write one.</Text>

  const step = { questions: 1, rewrite: 2, review: 3, error: 2 }[up.stage]
  const answered = up.answers.filter(a => a !== null).length
  const chip = (key: string, label: string, isOn: boolean, press: () => void) => (
    <Button key={key} plain onPress={press}>
      {isOn ? <Text color="#000000" backgroundColor={YELLOW}>{` ${label} `}</Text> : <Text>{` ${label} `}</Text>}
    </Button>
  )

  return (
    <Box flexDirection="column">
      <Box flexDirection="row" justifyContent="space-between">
        <Text bold color={YELLOW}>PROMPT UPGRADE</Text>
        {up.questions ? <Text dimColor>{`${answered} of ${up.questions.length} answered`}</Text> : null}
      </Box>
      <Box flexDirection="row" marginBottom={1}>
        {STEPS.map((name, i) => (
          <Text color={i === step ? YELLOW : undefined} dimColor={i > step} bold={i === step}>
            {`${i < step ? '✓' : i === step ? '●' : '○'} ${name}${i < STEPS.length - 1 ? '  ──  ' : ''}`}
          </Text>
        ))}
      </Box>
      <Box flexDirection="column" borderStyle="single" borderDimColor paddingX={1}>
        <Text dimColor bold>YOUR PROMPT</Text>
        <Text>{up.prompt}</Text>
      </Box>

      {up.stage === 'questions' && !up.questions && <Text dimColor>Thinking of a few questions…</Text>}
      {up.stage === 'questions' && up.questions && (
        <Box flexDirection="column">
          <Box flexDirection="row" justifyContent="space-between" marginTop={1}>
            <Text bold>A FEW QUICK QUESTIONS</Text>
            <Text dimColor>pick one each, or skip</Text>
          </Box>
          {up.questions.map((q, i) => {
            const given = up.answers[i] ?? null
            const isOther = given !== null && given !== '' && !q.options.includes(given)
            return (
              <Box flexDirection="column" marginTop={1}>
                <Box flexDirection="row">
                  <Text color="#000000" backgroundColor={YELLOW}>{` ${i + 1} `}</Text>
                  <Text bold>{` ${q.text}`}</Text>
                </Box>
                <Box flexDirection="row" flexWrap="wrap" paddingLeft={3}>
                  {q.options.map((option, o) => chip(`q${i}:${o}`, option, given === option, () => void answer($, up.id, i, option)))}
                  {Input && chip(`q${i}:other`, isOther ? `Other: ${given}` : 'Other (type it)', isOther, () => void typeOther($, up.id, i))}
                  {chip(`q${i}:skip`, 'Skip', given === '', () => void answer($, up.id, i, ''))}
                </Box>
                {up.typing === i && Input && (
                  <Box paddingLeft={3}>
                    <Input key={`q${i}:input`} placeholder="Your answer" submitLabel="OK" autoFocus onSubmit={(value: string) => void answer($, up.id, i, value.trim() || null)} />
                  </Box>
                )}
              </Box>
            )
          })}
          <Box flexDirection="row" marginTop={1}>
            {chip('upgrade', answered === up.questions.length ? 'Upgrade now' : 'Skip the rest, upgrade now', true, () => void rewrite($, up.id, model))}
            <Text>{'  '}</Text>
            <Button key="cancel" plain onPress={() => void endUpgrade($)}>Cancel</Button>
          </Box>
        </Box>
      )}

      {up.stage === 'rewrite' && <Text dimColor>{'\n'}Rewriting your prompt into a plan request…</Text>}

      {up.stage === 'review' && up.rewritten && (
        <Box flexDirection="column" marginTop={1}>
          <Text bold>UPGRADED PROMPT</Text>
          <Box borderStyle="single" borderColor={YELLOW} paddingX={1}>
            <Text>{up.rewritten}</Text>
          </Box>
          <Box flexDirection="row">
            {chip('send', 'Send', true, () => void send($, up.rewritten ?? up.prompt))}
            <Text>{'  '}</Text>
            <Button key="edit" plain onPress={() => void editInPrompt($, up.rewritten ?? up.prompt)}>Edit in prompt</Button>
            <Text>{'  '}</Text>
            <Button key="original" plain dimColor onPress={() => void send($, up.prompt)}>Send original</Button>
            <Text>{'  '}</Text>
            <Button key="cancel" plain dimColor onPress={() => void endUpgrade($)}>Cancel</Button>
          </Box>
        </Box>
      )}

      {up.stage === 'error' && (
        <Box flexDirection="column" marginTop={1}>
          <Text color="red">{up.error}</Text>
          <Box flexDirection="row">
            {chip('original', 'Send original', true, () => void send($, up.prompt))}
            <Text>{'  '}</Text>
            <Button key="cancel" plain onPress={() => void endUpgrade($)}>Cancel</Button>
          </Box>
        </Box>
      )}
    </Box>
  )
}
