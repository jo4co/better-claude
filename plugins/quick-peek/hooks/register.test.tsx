// Mod tests, run against the engine itself: `claude plugin test .`
import { expect, mock, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { On } from 'claude-code'

import { blocks, inline, items, wrap } from './markdown'
import { pathOfSpan, pathsIn, resolve } from './paths'

const VIDEO = '/Users/ana/videos/borrador.mp4'
const FOLDER = '/Users/ana/videos'
const README = '/project/app/README.md'
const SCREEN = { columns: 60, rows: 40, isFullscreen: true }

/**
 * Everything beneath the mod: the session, the files that are there, the programs it runs, the
 * window's program, and what the engine draws.
 */
function world (on: On, { system = 'Darwin', env = {} }: { system?: string; env?: Record<string, string> } = {}) {
  const clock = mock.clock(on, { now: 0 })
  mock.env(on, { HOME: '/Users/ana', ...env })
  const there: Record<string, 'file' | 'dir'> = { [VIDEO]: 'file', [FOLDER]: 'dir', [README]: 'file' }
  const runs: string[][] = []
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  on('session.cwd', () => ({ value: '/project/app' }))
  on('process.run', ($, e) => {
    runs.push([...e.argv])
    const stdout = e.argv[0] === 'uname' ? `${system}\n` : e.argv[0] === 'wslpath' ? 'C:\\Users\\ana\\videos\\borrador.mp4\n' : ''
    return { value: { exitCode: 0, stdout, stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }
  })
  on('fs.stat', ($, e) => {
    const kind = there[e.path]
    if (!kind) return { deny: `ENOENT: ${e.path}` }
    return { value: { kind, size: 12 * 1024 * 1024, mtimeMs: 0, isLink: false } }
  })
  // The window's program: it says `shown`, then `.` every tenth of a second till it is ended.
  const windows: { env: Record<string, string>; isEnded: boolean }[] = []
  on('process.spawn', async function * ($, e) {
    const opened = { env: { ...e.env }, isEnded: false }
    windows.push(opened)
    try {
      yield { stream: 'stdout' as const, text: 'shown\n' }
      for (;;) {
        await clock.sleep(100)
        yield { stream: 'stdout' as const, text: '.\n' }
      }
    } finally {
      opened.isEnded = true
    }
  })
  on('ui.render', ($, e) => {
    const { Box } = $.ui.resolve(e)
    return <Box key="engine" />
  })
  return { clock, runs, windows }
}

const startSession = ($: Engine) => $.session.start({ cwd: '/project/app', surface: 'terminal', isInteractive: true })
const reply = ($: Engine, text: string, viewport: { columns: number; rows: number; isFullscreen: boolean } = SCREEN) =>
  $.ui.mount({ plugin: 'quick-peek', surface: 'terminal', component: 'AssistantMessage', requestId: 'a-1', props: { text, isFirstOfReply: true }, viewport })

// The terminal shows a card over the path, not a window by the pointer.
const cards = { options: { window: false } }

test('finds absolute, home, relative and bare paths, and cuts what a sentence adds', () => {
  const found = (text: string) => pathsIn(text).map(({ start, end, target }) => [text.slice(start, end), target])
  expect(found('Lo dejé en /Users/ana/x.mp4. Y en ~/notas.md, ¿vale?')).toEqual([['/Users/ana/x.mp4', '/Users/ana/x.mp4'], ['~/notas.md', '~/notas.md']])
  expect(found('Mira src/app.ts:42 y README.md (la raíz).')).toEqual([['src/app.ts:42', 'src/app.ts'], ['README.md', 'README.md']])
  expect(found('see https://example.com/a/b.html and/or 1/2')).toEqual([['and/or', 'and/or'], ['1/2', '1/2']])
  expect(found('a word, then this')).toEqual([])
  expect(pathOfSpan('~/My Videos/a b.mp4')).toBe('~/My Videos/a b.mp4')
  expect(pathOfSpan('npm run build')).toBeUndefined()
  expect(resolve('../b/./c.txt', '/project/app', '/Users/ana')).toBe('/project/b/c.txt')
  expect(resolve('~/x', '/project/app', '/Users/ana')).toBe('/Users/ana/x')
})

test('wraps as the engine does: a path that does not fit moves down; one longer than a row is cut after a folder', () => {
  const rows = (text: string, width: number) => wrap([{ text, style: {}, link: 0 }], width).map(row => row.map(run => run.text).join(''))
  expect(wrap(inline('see **this** and /a/very/long/path'), 16).map(row => row.map(run => run.text))).toEqual([['see ', 'this', ' and /a/'], ['very/long/path']])
  expect(rows('/Users/ana/videos/borrador-final.mp4', 20)).toEqual(['/Users/ana/videos/', 'borrador-final.mp4'])
  expect(rows('abcdefghij', 4)).toEqual(['abcd', 'efgh', 'ij'])
})

test('cuts a reply into blocks: a list of another kind is a list of its own; a fence stays whole', () => {
  const text = 'Intro:\n\n- a\n- b\n\n1. uno\n2. dos\n\n```\n/Users/ana/x\n\n```\nfin'
  expect(blocks(text).map(block => [block.kind, block.gap])).toEqual([['paragraph', 0], ['list', 1], ['list', 1], ['other', 1], ['paragraph', 0]])
  const [first] = items('- **A**: x\n  - nested\n- B\n  more')
  expect(first).toMatchObject({ text: '**A**: x', children: [{ text: 'nested' }] })
  expect(items('- B\n  more')[0]!.text).toBe('B\nmore')
})

test('a path that leads somewhere is a link; the blocks without one are the engine\'s Markdown', async ($, on) => {
  world(on)
  await startSession($)
  const ui = await reply($, `## Hecho\n\nEl vídeo: \`${VIDEO}\`\n\nY ${FOLDER}/nada.mp4 no está.\n\n- uno\n- dos con README.md`)
  expect(await ui.find({ key: 'engine' })).toBeUndefined()
  expect(await ui.find({ type: 'Markdown', text: '## Hecho' })).toBeDefined()
  expect(await ui.find({ key: 'path:0:0' })).toMatchObject({ type: 'Client', props: { props: { label: VIDEO, path: VIDEO } } })
  expect(await ui.find({ type: 'Text', text: 'El vídeo: ' })).toBeDefined()
  // A path that is not there stays as written: its paragraph is the engine's.
  expect(await ui.find({ type: 'Markdown', text: /nada\.mp4 no está/ })).toBeDefined()
  expect(await ui.find({ key: 'path:1:0' })).toMatchObject({ props: { props: { label: 'README.md', path: README } } })
  expect(await ui.find({ type: 'Text', text: '-' })).toBeDefined()
})

test('a reply naming no path that is there is the engine\'s, and so is one off fullscreen', async ($, on) => {
  world(on)
  await startSession($)
  const missing = await reply($, 'Nada que ver en /no/existe.txt')
  expect(await missing.find({ key: 'engine' })).toBeDefined()
  await missing.unmount()
  expect(await (await reply($, `Mira ${VIDEO}`, { ...SCREEN, isFullscreen: false })).find({ key: 'engine' })).toBeDefined()
})

test('a path a row cannot hold is drawn in parts, each its own link', async ($, on) => {
  world(on)
  await startSession($)
  const ui = await reply($, `Listo: ${VIDEO}`, { ...SCREEN, columns: 22 })
  expect(await ui.find({ key: 'path:0:0' })).toMatchObject({ props: { props: { label: '/Users/ana/', path: VIDEO } } })
  expect(await ui.find({ key: 'path:0:1' })).toMatchObject({ props: { props: { label: 'videos/borrador.mp4', path: VIDEO } } })
})

test('the pointer on a path opens its preview by the pointer; off it, the preview closes', async ($, on) => {
  const w = world(on)
  await startSession($)
  const ui = await reply($, `Listo: ${VIDEO}`)
  await ui.pointer({ type: 'enter', x: 0, y: 0, in: 'path:0:0' })
  await w.clock.advance(100)
  expect(w.windows).toHaveLength(1)
  expect(w.windows[0]!.env).toMatchObject({ QUICK_PEEK_FILE: VIDEO })
  expect(w.windows[0]!.isEnded).toBe(false)
  await ui.pointer({ type: 'leave', x: 3, y: 0, in: 'path:0:0' })
  await w.clock.advance(300)
  expect(w.windows[0]!.isEnded).toBe(true)
})

test('a click shows the path in Finder; an alt-click opens it', async ($, on) => {
  const w = world(on)
  await startSession($)
  const ui = await reply($, `Listo: ${VIDEO}`)
  await ui.resize({ columns: VIDEO.length, rows: 1, in: 'path:0:0' })
  await ui.pointer({ type: 'down', x: 2, y: 0, button: 'left', in: 'path:0:0' })
  await ui.pointer({ type: 'up', x: 2, y: 0, button: 'left', in: 'path:0:0' })
  await w.clock.settle()
  expect(w.runs).toContainEqual(['open', '-R', VIDEO])
  await ui.pointer({ type: 'down', x: 2, y: 0, button: 'left', alt: true, in: 'path:0:0' })
  await ui.pointer({ type: 'up', x: 2, y: 0, button: 'left', alt: true, in: 'path:0:0' })
  await w.clock.settle()
  expect(w.runs).toContainEqual(['open', VIDEO])
  // Let go away from where it went down, it is no click.
  const before = w.runs.length
  await ui.pointer({ type: 'down', x: 2, y: 0, button: 'left', in: 'path:0:0' })
  await ui.pointer({ type: 'up', x: 2, y: 5, button: 'left', in: 'path:0:0' })
  await w.clock.settle()
  expect(w.runs.slice(before).filter(argv => argv[0] === 'open')).toEqual([])
})

test('without a window, each path carries a card the terminal reveals over it', cards, async ($, on) => {
  const w = world(on)
  await startSession($)
  const ui = await reply($, `Listo: ${VIDEO}`)
  expect(await ui.find({ key: 'card:0:0' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /borrador\.mp4 · 12\.0 MB · .* ago · click: show in folder/ })).toBeDefined()
  await ui.pointer({ type: 'enter', x: 0, y: 0, in: 'path:0:0' })
  await w.clock.advance(100)
  expect(w.windows).toHaveLength(0)
})

test('on Linux a click asks the file manager to select the path, with no window', async ($, on) => {
  const w = world(on, { system: 'Linux' })
  await startSession($)
  const ui = await reply($, `Listo: ${VIDEO}`)
  await ui.pointer({ type: 'down', x: 2, y: 0, button: 'left', in: 'path:0:0' })
  await ui.pointer({ type: 'up', x: 2, y: 0, button: 'left', in: 'path:0:0' })
  await w.clock.settle()
  expect(w.runs.find(argv => argv[0] === 'dbus-send')).toContain(`array:string:file://${VIDEO}`)
  expect(w.windows).toHaveLength(0)
})

test('under WSL a click selects the path in Explorer', async ($, on) => {
  const w = world(on, { system: 'Linux', env: { WSL_DISTRO_NAME: 'Ubuntu' } })
  await startSession($)
  const ui = await reply($, `Listo: ${VIDEO}`)
  await ui.pointer({ type: 'down', x: 2, y: 0, button: 'left', in: 'path:0:0' })
  await ui.pointer({ type: 'up', x: 2, y: 0, button: 'left', in: 'path:0:0' })
  await w.clock.settle()
  expect(w.runs).toContainEqual(['explorer.exe', '/select,C:\\Users\\ana\\videos\\borrador.mp4'])
})
