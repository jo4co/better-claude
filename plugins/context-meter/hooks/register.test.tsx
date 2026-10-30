// Mod tests, run against the engine itself: `claude plugin test .`
import { expect, mock, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { On, SessionContextUsage } from 'claude-code'

const WINDOW = 200_000
const BAND = { hasSurvey: false, isWorking: false, maxRows: 20, bodyColumns: 80, scroll: { offset: 0, bodyRows: 20 }, view: {} }

const fill = (percent?: number): SessionContextUsage =>
  percent === undefined ? { window: WINDOW } : { window: WINDOW, tokens: (WINDOW * percent) / 100, percent }

/**
 * Everything beneath the mod: the session's usage, what /context would count (`estimate`, null when it
 * cannot), how many times it was asked to count, and what the engine draws in the band.
 */
function world (on: On, context: SessionContextUsage = fill(), estimate: number | null = null) {
  const live = { context, estimate, counts: 0 }
  const clock = mock.clock(on, { now: 0 })
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  on('session.usage', ($, e) => {
    if (e.breakdown === undefined) return { value: { startedAt: 0, context: live.context, rateLimits: [] } }
    live.counts += 1
    const breakdown = live.estimate === null ? undefined : { percentage: live.estimate }
    return { value: { startedAt: 0, context: { ...live.context, breakdown }, rateLimits: [] } as never }
  })
  on('session.measure', ($, e) => ({ changed: e.changed }))
  on('ui.render', ($, e) => {
    const { Box, Text } = $.ui.resolve(e)
    return <Box key="engine"><Text>[Image #1] hover to preview</Text></Box>
  })
  return { live, clock }
}

const startSession = ($: Engine) => $.session.start({ cwd: '/project', surface: 'terminal', isInteractive: true })
const measure = ($: Engine, percent?: number) =>
  $.session.measure({ context: fill(percent), rateLimits: [], changed: ['context'] })
const band = ($: Engine, props: Partial<typeof BAND> = {}) =>
  $.ui.mount({ plugin: 'context-meter', surface: 'terminal', component: 'AbovePrompt', props: { ...BAND, ...props } })

test('shows the fill the session already has at start', async ($, on) => {
  world(on, fill(30))
  await startSession($)
  const ui = await band($)
  expect(await ui.find({ type: 'Text', text: 'context 30%' })).toMatchObject({ props: { dimColor: true } })
})

test('follows each measurement, yellow from 50% and red from 75%', async ($, on) => {
  world(on, fill(10))
  await startSession($)

  await measure($, 58)
  expect(await (await band($)).find({ type: 'Text', text: 'context 58%' })).toMatchObject({ props: { color: 'warning' } })

  await measure($, 82)
  expect(await (await band($)).find({ type: 'Text', text: 'context 82%' })).toMatchObject({ props: { color: 'error' } })
})

test('estimates the fill as /context does when the engine has none yet (a resumed session)', async ($, on) => {
  const w = world(on, fill(), 16)
  await startSession($)
  // Counting is not free, so it waits for the first check rather than holding up the start.
  await w.clock.advance(2000)
  expect(await (await band($)).find({ type: 'Text', text: 'context ~16%' })).toBeDefined()
})

test('swaps the estimate for the real figure on the next response', async ($, on) => {
  world(on, fill(), 16)
  await startSession($)
  await measure($, 17)
  expect(await (await band($)).find({ type: 'Text', text: 'context 17%' })).toBeDefined()
})

test('counts once per stretch without a reading, not on every check', async ($, on) => {
  const w = world(on, fill(), 16)
  await startSession($)
  await w.clock.advance(10_000)
  expect(w.live.counts).toBe(1)
})

test('estimates again after a compaction', async ($, on) => {
  const w = world(on, fill(82), 12)
  await startSession($)
  await measure($)
  expect(await (await band($)).find({ type: 'Text', text: 'context ~12%' })).toBeDefined()
  expect(w.live.counts).toBe(1)
})

test('estimates again after a rewind, which changes the fill without a measurement', async ($, on) => {
  const w = world(on, fill(6), 3)
  await startSession($)
  expect(await (await band($)).find({ type: 'Text', text: 'context 6%' })).toBeDefined()

  // Rewound: the engine drops its reading until the next response, and raises no session.measure.
  w.live.context = fill()
  await w.clock.advance(2000)
  expect(await (await band($)).find({ type: 'Text', text: 'context ~3%' })).toBeDefined()
})

test('shows nothing when there is neither a reading nor an estimate', async ($, on) => {
  world(on, fill(), null)
  await startSession($)
  expect(await (await band($)).find({ key: 'context-meter' })).toBeUndefined()
})

test('takes its thresholds from the settings', { options: { warnAt: 40, dangerAt: 60 } }, async ($, on) => {
  world(on, fill(10))
  await startSession($)
  await measure($, 45)
  expect(await (await band($)).find({ type: 'Text', text: 'context 45%' })).toMatchObject({ props: { color: 'warning' } })
  await measure($, 60)
  expect(await (await band($)).find({ type: 'Text', text: 'context 60%' })).toMatchObject({ props: { color: 'error' } })
})

test('keeps what the engine and other plugins draw in the band, above the meter', async ($, on) => {
  world(on, fill(30))
  await startSession($)
  const ui = await band($)
  expect(await ui.find({ key: 'engine' })).toBeDefined()
  expect(await ui.find({ key: 'context-meter' })).toBeDefined()
})

test('yields the band to a survey', async ($, on) => {
  world(on, fill(30))
  await startSession($)
  const ui = await band($, { hasSurvey: true })
  expect(await ui.find({ key: 'context-meter' })).toBeUndefined()
})
