import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, RenderNode, SessionContextUsage, Timer } from 'claude-code'

import type { Fill } from '../types'

const SYNC_MS = 2000

const percent = atom({ plugin: 'context-meter', key: 'percent' } as const, null as Fill)

// One count at a time: a check that comes while one runs leaves it be.
let isCounting = false
let lastFill: Fill = null
let timer: Timer | undefined

/** Whether a drawing beneath shows nothing: no text, no control (the engine's own node is empty). */
function isBlank (node: RenderNode | undefined): boolean {
  if (node === undefined || node === null) return true
  if (typeof node === 'string') return node.trim() === ''
  return (node.type === 'Box' || node.type === 'Text') && (node.children ?? []).every(isBlank)
}

/** Writes the fill when it differs from the one shown (an equal write would redraw for nothing). */
async function show ($: EngineInterface, next: Fill) {
  if (lastFill?.value === next?.value && lastFill?.isEstimate === next?.isEstimate) return
  lastFill = next
  await update($, percent, () => next)
}

/**
 * Takes the engine's figure; while it has none (no response yet in this window: a fresh, resumed,
 * compacted or rewound session), counts the window once as /context does, and keeps that estimate
 * until the next response. `canCount` false only takes a figure (the start, which counting would hold up).
 */
async function sync ($: EngineInterface, context: SessionContextUsage, canCount: boolean) {
  if (context.percent !== undefined) return show($, { value: context.percent, isEstimate: false })
  if (lastFill?.isEstimate || !canCount || isCounting) return

  isCounting = true
  try {
    const { breakdown } = (await $.session.usage({ breakdown: 'full' })).context
    await show($, breakdown ? { value: breakdown.percentage, isEstimate: true } : null)
  } finally {
    isCounting = false
  }
}

export const register: Register = (on, options) => {
  const warnAt = typeof options.warnAt === 'number' ? options.warnAt : 50
  const dangerAt = typeof options.dangerAt === 'number' ? options.dangerAt : 75
  const colorFor = (value: number) => (value >= dangerAt ? 'error' : value >= warnAt ? 'warning' : undefined)
  isCounting = false
  lastFill = null
  timer?.cancel()
  timer = undefined

  on('session.start', async ($, e, next) => {
    timer?.cancel()
    isCounting = false
    lastFill = null
    await update($, percent, () => null)
    await sync($, (await $.session.usage()).context, false)
    // A resume or a rewind changes the fill without a measurement, so the meter reads the figure
    // again (the plain call is free) and counts when the engine has none.
    timer = $.clock.every(SYNC_MS, async () => { await sync($, (await $.session.usage()).context, true) })
    return next(e)
  })

  on('session.end', ($, e, next) => {
    timer?.cancel()
    timer = undefined
    return next(e)
  })

  on('session.measure', async ($, e, next) => {
    if (e.changed.includes('context')) await sync($, e.context, true)
    return next(e)
  })

  // Right above the prompt's top line, at its right end; what the engine and other plugins draw there stays above it.
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey) return next(e)
    const [fill, beneath] = await Promise.all([read($, percent), next(e)])
    if (fill === null) return beneath

    const { Box, Text } = $.ui.resolve(e)
    const color = colorFor(fill.value)

    return (
      <Box flexDirection="column">
        {isBlank(beneath) ? null : beneath}
        <Box key="context-meter" width={e.props.bodyColumns} justifyContent="flex-end">
          <Text color={color} dimColor={color === undefined}>context {fill.isEstimate ? '~' : ''}{Math.round(fill.value)}%</Text>
        </Box>
      </Box>
    )
  })
}
