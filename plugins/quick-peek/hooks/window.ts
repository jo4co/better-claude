// The program that previews a path in a window of its own, by the pointer, outside the terminal:
// macOS's, run by `osascript` with what it needs in the environment (QUICK_PEEK_FILE, the path;
// QUICK_PEEK_LIFE, how many seconds at most it stays; QUICK_PEEK_HINT, the line that says what a
// click does). It writes `shown` once the window is up, or a line starting `error`, then a `.`
// every tenth of a second, so the one reading it is woken to end it, and it ends when nobody
// reads. The window never takes the focus or the pointer: the terminal keeps both.

/**
 * macOS: JavaScript for Automation drawing an AppKit panel. A file shows its Quick Look thumbnail
 * (a video's frame, an image, a document's first page), else its icon; a folder its icon and its
 * first entries. Under it, the name, the kind, size and age as the system words them, and where it is.
 */
export const MACOS = String.raw`
ObjC.import('Cocoa')
ObjC.import('QuickLook')

function run () {
  const env = $.NSProcessInfo.processInfo.environment
  const read = key => { const value = env.objectForKey(key); return value.isNil() ? '' : ObjC.unwrap(value) }
  const say = text => $.NSFileHandle.fileHandleWithStandardOutput.writeData($(text + '\n').dataUsingEncoding($.NSUTF8StringEncoding))
  const path = read('QUICK_PEEK_FILE')
  const files = $.NSFileManager.defaultManager
  const isFolder = Ref()
  if (!files.fileExistsAtPathIsDirectory(path, isFolder)) { say('error: not there'); return }
  const folder = !!isFolder[0]
  // An accessory app: no Dock icon, never the active one.
  $.NSApplication.sharedApplication.setActivationPolicy(1)

  const mouse = $.NSEvent.mouseLocation
  const screens = $.NSScreen.screens
  let screen = $.NSScreen.mainScreen
  for (let i = 0; i < screens.count; i++) {
    const frame = screens.objectAtIndex(i).frame
    if (mouse.x >= frame.origin.x && mouse.x < frame.origin.x + frame.size.width && mouse.y >= frame.origin.y && mouse.y < frame.origin.y + frame.size.height) screen = screens.objectAtIndex(i)
  }
  const area = screen.visibleFrame
  const scale = screen.backingScaleFactor
  const largest = Math.min(Number(read('QUICK_PEEK_SIZE')) || 360, area.size.width * 0.5, area.size.height * 0.5)

  const url = $.NSURL.fileURLWithPath(path)
  const keys = [$.NSURLLocalizedTypeDescriptionKey, $.NSURLFileSizeKey, $.NSURLContentModificationDateKey]
  const values = url.resourceValuesForKeysError($(keys), $())
  const value = key => (values.isNil() ? $() : values.objectForKey(key))

  // The picture: Quick Look's thumbnail, else the icon Finder shows.
  let image = $()
  let width = 0
  let height = 0
  if (!folder) {
    const thumbnail = $.QLThumbnailImageCreate($.kCFAllocatorDefault, url, $.CGSizeMake(largest * scale, largest * scale), $())
    if (thumbnail && !(thumbnail.isNil && thumbnail.isNil())) {
      image = $.NSImage.alloc.initWithCGImageSize(thumbnail, $.NSZeroSize)
      width = image.size.width / scale
      height = image.size.height / scale
    }
  }
  if (image.isNil() || width === 0) {
    image = $.NSWorkspace.sharedWorkspace.iconForFile(path)
    width = height = folder ? 64 : 128
    image.size = $.NSMakeSize(width, height)
  }

  // The lines under it.
  const name = ObjC.unwrap(files.displayNameAtPath(path))
  const details = []
  const kind = value($.NSURLLocalizedTypeDescriptionKey)
  if (!kind.isNil()) details.push(ObjC.unwrap(kind))
  let entries = []
  if (folder) {
    const listed = files.contentsOfDirectoryAtPathError(path, $())
    if (!listed.isNil()) {
      entries = ObjC.unwrap(listed.sortedArrayUsingSelector('localizedStandardCompare:')).map(entry => ObjC.unwrap(entry)).filter(entry => !entry.startsWith('.'))
      details.push(entries.length === 1 ? '1 item' : entries.length + ' items')
    }
  } else {
    const size = value($.NSURLFileSizeKey)
    if (!size.isNil()) details.push(ObjC.unwrap($.NSByteCountFormatter.stringFromByteCountCountStyle(size.longLongValue, 0)))
  }
  const modified = value($.NSURLContentModificationDateKey)
  if (!modified.isNil()) {
    const ago = $.NSRelativeDateTimeFormatter.alloc.init
    details.push(ObjC.unwrap(ago.localizedStringForDateRelativeToDate(modified, $.NSDate.date)))
  }
  const home = ObjC.unwrap($.NSHomeDirectory())
  let where = ObjC.unwrap($(path).stringByDeletingLastPathComponent)
  if (where === home || where.startsWith(home + '/')) where = '~' + where.slice(home.length)

  const pad = 12
  const gap = 18
  const inner = Math.max(width, 280)
  const label = (text, font, color, lines) => {
    const field = $.NSTextField.labelWithString($(text))
    field.font = font
    field.textColor = color
    field.lineBreakMode = lines > 1 ? 0 : 5
    if (lines > 1) field.maximumNumberOfLines = lines
    field.preferredMaxLayoutWidth = inner
    const fit = field.sizeThatFits($.NSMakeSize(inner, 1000))
    field.frame = $.NSMakeRect(0, 0, inner, Math.ceil(fit.height))
    return field
  }
  const rows = []
  rows.push(label(name, $.NSFont.boldSystemFontOfSize(13), $.NSColor.labelColor, 2))
  if (details.length > 0) rows.push(label(details.join(' · '), $.NSFont.systemFontOfSize(11), $.NSColor.secondaryLabelColor, 1))
  if (folder && entries.length > 0) {
    const shown = entries.slice(0, 10).map(entry => {
      const inside = Ref()
      files.fileExistsAtPathIsDirectory(path + '/' + entry, inside)
      return entry + (inside[0] ? '/' : '')
    })
    if (entries.length > shown.length) shown.push('…')
    rows.push(label(shown.join('\n'), $.NSFont.monospacedSystemFontOfSizeWeight(11, 0), $.NSColor.secondaryLabelColor, shown.length))
  }
  rows.push(label(where, $.NSFont.systemFontOfSize(11), $.NSColor.tertiaryLabelColor, 1))
  const hint = read('QUICK_PEEK_HINT')
  if (hint) rows.push(label(hint, $.NSFont.systemFontOfSize(10), $.NSColor.tertiaryLabelColor, 1))

  const spacing = 3
  const texts = rows.reduce((sum, row) => sum + row.frame.size.height, 0) + spacing * (rows.length - 1)
  const outer = { width: inner + pad * 2, height: pad + height + 10 + texts + pad }
  const top = area.origin.y + area.size.height
  const right = area.origin.x + area.size.width
  // Above the pointer and to its right; under it, or to its left, where there is no room: never
  // over the pointer, which stays on the terminal.
  let x = mouse.x + gap
  let y = mouse.y + gap
  if (y + outer.height > top) y = mouse.y - gap - outer.height
  if (x + outer.width > right) x = mouse.x - gap - outer.width
  x = Math.max(area.origin.x, Math.min(x, right - outer.width))
  y = Math.max(area.origin.y, Math.min(y, top - outer.height))

  // Borderless and non-activating; over every app window, on every space, full-screen ones too.
  const panel = $.NSPanel.alloc.initWithContentRectStyleMaskBackingDefer($.NSMakeRect(x, y, outer.width, outer.height), 128, 2, false)
  panel.level = 25
  panel.ignoresMouseEvents = true
  panel.hasShadow = true
  panel.opaque = false
  panel.backgroundColor = $.NSColor.clearColor
  panel.collectionBehavior = 1 | 16 | 256
  panel.appearance = $.NSAppearance.appearanceNamed('NSAppearanceNameVibrantDark')
  const backdrop = $.NSVisualEffectView.alloc.initWithFrame($.NSMakeRect(0, 0, outer.width, outer.height))
  backdrop.material = 13
  backdrop.state = 1
  backdrop.wantsLayer = true
  backdrop.layer.cornerRadius = 10
  backdrop.layer.masksToBounds = true
  // AppKit counts from the bottom: the lines first, the picture over them.
  let at = pad
  for (let i = rows.length - 1; i >= 0; i--) {
    const row = rows[i]
    row.frame = $.NSMakeRect(pad, at, inner, row.frame.size.height)
    backdrop.addSubview(row)
    at += row.frame.size.height + spacing
  }
  at += 10 - spacing
  const view = $.NSImageView.alloc.initWithFrame($.NSMakeRect(pad + Math.round((inner - width) / 2), at, width, height))
  view.image = image
  view.imageScaling = 3
  backdrop.addSubview(view)
  panel.contentView = backdrop
  if (read('QUICK_PEEK_DRY') === '1') { say('dry ' + Math.round(outer.width) + 'x' + Math.round(outer.height) + ' ' + rows.length + ' rows'); return }
  panel.orderFrontRegardless
  say('shown')
  // A pointer that leaves the terminal says nothing to it: the window also ends when another app
  // comes to the front, or the pointer goes rows away from the path.
  const app = $.NSWorkspace.sharedWorkspace.frontmostApplication.processIdentifier
  const end = Date.now() + (Number(read('QUICK_PEEK_LIFE')) || 60) * 1000
  while (Date.now() < end) {
    $.NSRunLoop.currentRunLoop.runUntilDate($.NSDate.dateWithTimeIntervalSinceNow(0.1))
    if (Math.abs($.NSEvent.mouseLocation.y - mouse.y) > 120 || $.NSWorkspace.sharedWorkspace.frontmostApplication.processIdentifier !== app) return
    say('.')
  }
}
`
