import { atom, read, update } from 'claude-code'
import type { EngineInterface as Engine, Register } from 'claude-code'

import { UPGRADE_PANE, dropUpgrade, isBusy, isUpgrading, loadUpgradeSwitch, renderUpgrade, startUpgrade, switchUpgrade } from './upgrade'

const ON_GREEN = '#4caf6e'
const ACCENT = '#d97757'
const EFFORT_BG = '#8b5a8c'
const WIDTH = 80

const isOpen = atom({ plugin: 'user-tools', key: 'isOpen' } as const, false)
const effort = atom({ plugin: 'user-tools', key: 'effort' } as const, null)
const effortOverride = atom({ plugin: 'user-tools', key: 'effortOverride' } as const, null)

type Choice = { label: string, value: string }
type Options = { title?: string, models?: string, efforts?: string, upgradeModel?: string }

const narratorOn = { plugin: 'narrator', key: 'isEnabled' } as const

/** `Label=value, value` → choices; a bare value is its own label. */
function choicesOf (text: string | undefined): Choice[] {
  return (text ?? '')
    .split(',')
    .map(part => part.trim())
    .filter(Boolean)
    .map(part => {
      const [label = '', value = ''] = part.includes('=') ? part.split('=', 2).map(s => s.trim()) : [part, part]
      return { label: label || value, value: value || label }
    })
}

/** `User Tools` → `U S E R   T O O L S`, the header's letterspacing. */
function spaced (text: string): string {
  return text.toUpperCase().split(' ').map(word => word.split('').join(' ')).join('   ')
}

// Whether the engine has /effort, asked once per load.
let hasEffortCommand: boolean | undefined

async function canSetEffort ($: Engine): Promise<boolean> {
  hasEffortCommand ??= (await $.command.list()).some(command => command.name === 'effort')
  return hasEffortCommand ?? false
}

function toggle ($: Engine) {
  return update($, isOpen, open => !open)
}

function pickModel ($: Engine, model: Choice) {
  $.command.run({ command: 'model', args: model.value })
    .then(() => $.ui.invalidate('ui.render'))
    .catch(() => $.ui.toast(`Could not switch to ${model.label}`))
}

async function pickEffort ($: Engine, level: Choice) {
  await update($, effort, () => level.value)
  if (await canSetEffort($)) {
    await update($, effortOverride, () => null)
    $.command.run({ command: 'effort', args: level.value })
      .catch(() => $.ui.toast(`Could not set effort ${level.label}`))
  } else {
    await update($, effortOverride, () => level.value)
    $.ui.toast(`Effort ${level.label} from the next request on`)
  }
}

/** The narrator lives in its own mod: /narrator switches it, and its state says where it stands. */
async function switchNarrator ($: Engine) {
  const { value: isOn = false } = await $.state.get(narratorOn)
  await $.command.run({ command: 'narrator', args: isOn ? 'off' : 'on' })
    .catch(() => $.ui.toast('Narrator is not installed: /plugin install narrator@jo4co-claude'))
}

export const register: Register = (on, options) => {
  const opts = options as Options
  const title = opts.title?.trim() || 'User Tools'
  const models = choicesOf(opts.models)
  const efforts = choicesOf(opts.efforts)
  const upgradeModel = opts.upgradeModel?.trim() || 'sonnet'

  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'user-tools', description: `Show or hide the ${title} panel` })
    await loadUpgradeSwitch($)
    return next(e)
  })

  // Prompt Upgrade: a prompt the person typed, while it is on, waits in its pane instead.
  on('prompt.submit', async ($, e, next) => {
    const isTyped = e.origin.kind === 'composer' && !e.command && !e.isMeta && e.turnId === undefined
    if (!isTyped || !e.text.trim() || !(await isUpgrading($))) return next(e)
    if (await isBusy($)) return { drop: 'Prompt Upgrade is still working on the last prompt: send or cancel it first.' }
    void startUpgrade($, e.text, upgradeModel)
    return { drop: 'Prompt Upgrade is working on it.' }
  })

  on('ui.render', { component: 'Pane', requestId: UPGRADE_PANE }, ($, e) => renderUpgrade($, e, upgradeModel))

  // Closing the pane by hand drops the prompt it held.
  on('ui.close', async ($, e, next) => {
    if (e.id === UPGRADE_PANE && e.origin.kind === 'person') await dropUpgrade($)
    return next(e)
  })

  on('command.run', { command: 'user-tools' }, async $ => {
    await toggle($)
    return { text: `${title} ${(await read($, isOpen)) ? 'shown' : 'hidden'}.` }
  })

  // Keeps the effort row on what the session really sends, and applies the panel's own choice
  // where the engine has no /effort command.
  on('turn.step', async function* ($, e, next) {
    if (e.agentId !== undefined || e.effort === undefined) return yield* next(e)
    const override = await read($, effortOverride)
    const sent = override ?? e.effort
    if (String(sent) !== (await read($, effort))) await update($, effort, () => String(sent))
    return yield* next(override ? { ...e, effort: override as typeof e.effort } : e)
  })

  // The footer button that shows or hides the panel, after whatever is drawn there already.
  on('ui.render', { component: 'SessionMode' }, async ($, e, next) => {
    const beneath = await next(e)
    const open = await read($, isOpen)
    const { Box, Button, Text } = $.ui.resolve(e)
    return (
      <Box flexDirection="row">
        {beneath}
        <Text dimColor>{'  '}</Text>
        <Button key="user-tools" plain onPress={() => void toggle($)}>
          <Text color="#ffffff" backgroundColor={ACCENT}>{` ◆ ${title} ${open ? '▴' : '▾'} `}</Text>
        </Button>
      </Box>
    )
  })

  // The panel itself: a framed box at the right end of the band above the prompt.
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey || !(await read($, isOpen))) return next(e)
    const { Box, Button, Text } = $.ui.resolve(e)
    const model = (await $.session.model()) ?? ''
    const level = await read($, effort)
    const isModel = (c: Choice) => model === c.value || model.includes(c.value)
    const modelLabel = models.find(isModel)?.label ?? model.replace(/^claude-/, '')
    const effortLabel = efforts.find(c => c.value === level)?.label ?? level
    const { value: isNarratorOn = false } = await $.state.get(narratorOn)
    const isUpgradeOn = await isUpgrading($)
    const width = Math.min(WIDTH, e.props.bodyColumns)

    const heading = (name: string) => (
      <Box flexDirection="row" marginTop={1}>
        <Text dimColor>{`── ${spaced(name)} ${'─'.repeat(Math.max(0, width - 8 - spaced(name).length))}`}</Text>
      </Box>
    )

    const setting = (key: string, name: string, hint: string, isOn: boolean, press: () => void) => (
      <Box flexDirection="row" justifyContent="space-between">
        <Box flexDirection="row">
          <Text color={isOn ? ON_GREEN : undefined} dimColor={!isOn}>{isOn ? '● ' : '○ '}</Text>
          <Text bold>{name}</Text>
          <Text dimColor>{`  ${hint}`}</Text>
        </Box>
        <Button key={key} plain onPress={press}>
          {isOn
            ? <Text color="#ffffff" backgroundColor={ON_GREEN}>{' ● On  '}</Text>
            : <Text dimColor>{' ○ Off '}</Text>}
        </Button>
      </Box>
    )

    const row = (name: string, list: Choice[], isOn: (c: Choice) => boolean, bg: string, press: (c: Choice) => void) => (
      <Box flexDirection="row">
        <Text dimColor>{name.padEnd(10)}</Text>
        {list.map(choice => (
          <Button key={`${name}:${choice.value}`} plain onPress={() => press(choice)}>
            {isOn(choice)
              ? <Text color="#ffffff" backgroundColor={bg}>{` ${choice.label} `}</Text>
              : <Text>{` ${choice.label} `}</Text>}
          </Button>
        ))}
      </Box>
    )

    return (
      <Box flexDirection="row" justifyContent="flex-end">
        <Box flexDirection="column" width={width} borderStyle="round" borderColor={ACCENT} paddingX={1}>
          <Box flexDirection="row" justifyContent="space-between" marginBottom={1}>
            <Text color={ACCENT} bold>{`◆  ${spaced(title)}`}</Text>
            <Text dimColor>{effortLabel ? `${modelLabel} · ${effortLabel}` : modelLabel}</Text>
          </Box>
          {row('MODEL', models, isModel, ACCENT, c => pickModel($, c))}
          {row('EFFORT', efforts, c => level === c.value, EFFORT_BG, c => void pickEffort($, c))}
          {heading('Settings')}
          {setting('setting:narrator', 'Narrator', 'reads each answer out loud', isNarratorOn, () => void switchNarrator($))}
          {setting('setting:upgrade', 'Prompt Upgrade', 'turns a prompt into a plan', isUpgradeOn, () => void switchUpgrade($))}
        </Box>
      </Box>
    )
  })
}
