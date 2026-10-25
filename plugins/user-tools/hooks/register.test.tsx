// Mod tests, run against the engine itself: `claude plugin test .`
import { expect, test } from 'claude-code/testing'
import type { On } from 'claude-code'

const BAND = {
  plugin: 'user-tools',
  component: 'AbovePrompt',
  props: {
    hasSurvey: false,
    isWorking: false,
    maxRows: 20,
    bodyColumns: 100,
    scroll: { offset: 0, bodyRows: 19 },
    view: {},
  },
} as const

const TOGGLE = {
  command: 'user-tools',
  args: '',
  origin: { kind: 'composer' },
  presentation: { isFullscreen: false, columns: 100 },
} as const

/** What sits beneath the mod: the commands it runs and the effort each request sends. */
function world (on: On, commands: string[] = ['model', 'effort']) {
  const ran: string[] = []
  const efforts: unknown[] = []
  on('command.list', () => ({ value: commands.map(name => ({ name })) as never }))
  on('command.run', ($, e) => {
    ran.push(`/${e.command} ${e.args}`)
    return { text: '' }
  })
  on('session.model', () => ({ value: 'claude-sonnet-5-5' }))
  on('ui.toast', () => ({ value: undefined }))
  on('store.get', () => ({ value: undefined }))
  on('store.set', () => ({ value: undefined }))
  on('clock.now', () => ({ value: 1 }))
  on('ui.render', ($, e) => {
    const { Box } = $.ui.resolve(e)
    return <Box key="engine" />
  })
  on('turn.step', async function* ($, e) {
    efforts.push(e.effort)
    return { turnId: e.turnId, index: e.index, answer: 'ok', toolUses: [] } as never
  })
  return { ran, efforts }
}

test('the panel shows only once /user-tools opens it', async ($, on) => {
  world(on)
  const closed = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect(await closed.find({ type: 'Text', text: /MODEL/ })).toBeUndefined()
  await closed.unmount()
  await $.command.run(TOGGLE)
  const open = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect((await open.find({ type: 'Text', text: /Sonnet 5.5 · / }))).toBeUndefined()
  expect((await open.find({ type: 'Text', text: /^Sonnet 5.5$/ }))).toBeDefined()
  await open.unmount()
})

test('a click on a model or an effort runs /model or /effort', async ($, on) => {
  const w = world(on)
  await $.command.run(TOGGLE)
  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...BAND, surface })
    await ui.press({ key: 'MODEL:claude-opus-5-5' })
    await ui.press({ key: 'EFFORT:xhigh' })
    await ui.unmount()
  }
  expect(w.ran).toEqual(['/model claude-opus-5-5', '/effort xhigh', '/model claude-opus-5-5', '/effort xhigh'])
})

test('without /effort the chosen effort is sent on each main request', async ($, on) => {
  const w = world(on, ['model'])
  await $.command.run(TOGGLE)
  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  await ui.press({ key: 'EFFORT:max' })
  await ui.unmount()
  for await (const _ of $.turn.step({ turnId: 't1', index: 0, model: 'claude-sonnet-5-5', effort: 'low', messageCount: 1 })) void _
  expect(w.efforts).toEqual(['max'])
})

const UPGRADE_PANE = {
  plugin: 'user-tools',
  component: 'Pane',
  requestId: 'prompt-upgrade',
  props: {
    title: 'Prompt Upgrade',
    isFocused: true,
    bodyColumns: 100,
    placement: 'dock',
    scroll: { offset: 0, bodyRows: 30 },
    view: {},
  },
} as const

const QUESTIONS = JSON.stringify({
  questions: [{ text: 'What is the main goal?', options: ['More orders', 'More foot traffic'] }],
})

/** Beneath the mod for Prompt Upgrade: the model, the prompts that reach Claude, the panes. */
function upgradeWorld (on: On) {
  const w = world(on)
  const prompts: string[] = []
  const asked: string[] = []
  on('prompt.submit', ($, e) => {
    prompts.push(e.text)
    return { text: e.text }
  })
  on('model.complete', ($, e) => {
    asked.push(String(e.prompt))
    const text = asked.length === 1 ? QUESTIONS : 'I need a 30-day marketing plan focused on more orders.'
    return { value: { isAnswered: true, text, usage: { input_tokens: 1, output_tokens: 1 } } as never }
  })
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('ui.close', () => ({ value: undefined }))
  return { ...w, prompts, asked }
}

test('the narrator row switches the narrator mod through /narrator', async ($, on) => {
  const w = world(on)
  await $.command.run(TOGGLE)
  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  await ui.press({ key: 'setting:narrator' })
  await ui.unmount()
  expect(w.ran).toContain('/narrator on')
})

test('with Prompt Upgrade on, a typed prompt is asked about, rewritten and sent', async ($, on) => {
  const w = upgradeWorld(on)
  await $.command.run(TOGGLE)
  const band = await $.ui.mount({ ...BAND, surface: 'terminal' })
  await band.press({ key: 'setting:upgrade' })
  await band.unmount()

  const held = await $.prompt.submit({ text: 'Build me a 30-day marketing plan for a pizza company.', wait: false, origin: { kind: 'composer' } })
  expect(held.drop).toBe('Prompt Upgrade is working on it.')
  expect(w.prompts).toEqual([])

  const pane = await $.ui.mount({ ...UPGRADE_PANE, surface: 'terminal' })
  expect(await pane.find({ type: 'Text', text: /What is the main goal\?/ })).toBeDefined()
  await pane.press({ key: 'q0:0' })
  await pane.press({ key: 'upgrade' })
  expect(w.asked[1]).toContain('More orders')
  expect(await pane.find({ type: 'Text', text: /30-day marketing plan focused/ })).toBeDefined()
  await pane.press({ key: 'send' })
  await pane.unmount()
  expect(w.prompts).toEqual(['I need a 30-day marketing plan focused on more orders.'])
})
