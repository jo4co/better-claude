# Quick Peek

A Claude Code mod: the paths in Claude's replies become links. Hover one and a preview opens by the pointer; click it and Finder opens with the file selected.

```text
⏺ He hecho dos versiones del principio. Elige la que más te guste:

  - A, desde dentro de la lámpara: empieza pegado al cristal y la cámara sale disparada.
    /Users/midudev/Dev/video/revisar/borrador.mp4        ← hover: preview · click: Finder
  - B, el viaje: la cámara vuela pegada a la pared.
    /Users/midudev/Dev/video/revisar/borrador-01-viaje.mp4
```

- **Which paths**: absolute (`/Users/…`), from home (`~/…`), relative to the session's folder (`./x`, `src/app.ts`, `README.md`), with or without backticks, and with a `:line` or `:line:column` after them. Only the paths that lead to a file or a folder become links; the rest stay as Claude wrote them. Inside backticks a path may hold spaces.
- **Hover**: the path is underlined and a small window opens by the pointer, above it and to its right, without taking the focus: the file's Quick Look thumbnail (a video's frame, an image, a PDF's or a document's first page), else its icon; its name, its kind, size and age as your system words them, and the folder it is in. A folder shows its icon and its first entries. Move off the path and it closes.
- **Click**: Finder opens the folder with the file selected (`open -R`). **Option-click** opens the file itself, with its app.

A path a row cannot hold is drawn in parts, cut after a `/`, and each part is the link. Hovering needs the mouse, so it needs Claude Code's fullscreen interface (`"tui": "fullscreen"` in your settings, or `/config`).

## Other systems

| System | Click | Hover |
| --- | --- | --- |
| macOS | Finder, the file selected | A window by the pointer, with the Quick Look thumbnail |
| Linux | The file manager, the file selected (`org.freedesktop.FileManager1`), else its folder with `xdg-open` | A one-line card over the path: name, size, age |
| Windows | Explorer, the file selected (`explorer /select,`) | The card |
| WSL | Windows' Explorer, the path turned into its Windows form by `wslpath -w` | The card |

Turn the window off with the **Preview in a window** option (`/config`) to get the card on macOS too. Over SSH the window would open on the other machine, so there the card shows.

## Install

```text
/plugin marketplace add midudev/better-claude
/plugin install quick-peek@better-claude
```

## Limits

- Only Claude's replies: paths in tool rows (`Read(…)`, a command's output) and in your prompts stay as they are.
- A reply with a path that leads somewhere is drawn by the mod: its paragraphs and lists that hold such a path are laid out by the mod as Claude Code lays them out (bold, italics, code, links, nested and numbered lists), and every other block (headings, code blocks, tables, quotes) by Claude Code's own Markdown. A path in a heading, a table, a quote or a code block is no link.
- In plain text a path ends at a space or a bracket: a path with spaces is a link only inside backticks.
- A path is looked at when the reply is drawn; one created later becomes a link the next time the reply is drawn (scrolling it into view).
- Dragging to select text that starts on a path does not select: the path takes the pointer.
- A window stays a minute at most, and closes when another app comes to the front or the pointer goes a few rows away (the terminal does not say when the pointer leaves it).
- The card is drawn over the row above the path: on the first row on screen it is cut.
- Option-click needs the terminal to report the Option key with the click; some keep Option-click for themselves.

## How it works

One hooks module ([`hooks/register.tsx`](hooks/register.tsx)), a surface module for the links ([`hooks/link.tsx`](hooks/link.tsx)), the markdown it lays out ([`hooks/markdown.ts`](hooks/markdown.ts)), the paths it finds ([`hooks/paths.ts`](hooks/paths.ts)) and the window's program ([`hooks/window.ts`](hooks/window.ts)):

- A `ui.render` hook on `AssistantMessage` cuts the reply into blocks and finds the paths in its paragraphs and list items, inline code included. Each is resolved (`~`, the session's folder) and looked at with `$.fs.stat`, the answers kept a few seconds.
- With none that leads somewhere, Claude Code draws the reply. Otherwise the mod draws it: the bullet, the blocks with no path as one `Markdown` each, and the others wrapped into rows the way Claude Code wraps a reply, each part of a path a `Client` drawing that part in the color of inline code. The tree replaces only Claude Code's own node, so what other mods draw around a reply stays.
- Each `Client` posts when the pointer comes onto it, moves on it and leaves it, and when it is clicked; a `ui.message` hook opens and closes the preview, or shows the path in the file manager.
- On macOS a hover starts `osascript` with a JavaScript for Automation program, told the path (`QUICK_PEEK_FILE`), the picture's largest side and how long it may stay. It draws an AppKit panel that never takes the focus or the pointer, with the thumbnail from `QLThumbnailImageCreate` and the kind, size and date from the file's resource values, formatted by the system. It says `shown`, then a `.` every tenth of a second, so the mod wakes to end it when the pointer leaves.
- Without a window, each part of a path is a keyed `Box` holding a card drawn `display: "none"`, which the terminal reveals while the pointer is on the path, with no hook running.

## Development

```bash
claude plugin validate ./plugins/quick-peek   # from the repository root
claude plugin test ./plugins/quick-peek       # runs hooks/register.test.tsx against the engine
```

MIT © Miguel Ángel Durán (midudev)
