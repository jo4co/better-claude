# Context Meter

A Claude Code mod: how full the session's context window is, always in sight, right above the prompt at its right end. No more typing `/context` to decide whether it is time to compact.

```text
                                                                  context 58%
────────────────────────────────────────────────────────────────────────────
❯ revisa el módulo de recepción de pedidos
────────────────────────────────────────────────────────────────────────────
⏵⏵ auto mode on                                   5h ━───────── 2% · 4h 41m
```

- **Under 50%**: dim gray, there is room.
- **From 50%**: yellow, a good moment for `/compact`.
- **From 75%**: red, compact now or start a new session.

Both thresholds are settings (`warnAt`, `dangerAt`) in `/config`. The footer stays as it is, so it sits well next to [Sub Meter](../sub-meter/README.md).

Before the first response of a session (a fresh or resumed one), and right after a compaction or a rewind, the engine has no reading yet. The meter then counts the window once, as `/context` does, and shows it with a `~` (`context ~16%`) until the next response brings the real figure.

## Install

```text
/plugin marketplace add midudev/better-claude
/plugin install context-meter@better-claude
```

## How it works

One hooks module ([`hooks/register.tsx`](hooks/register.tsx)):

- `$.session.usage()` gives the first reading at start; `session.measure` hands over `context.percent` after each response that moved it (the status line's `used_percentage`).
- A resume or a rewind changes the fill without raising any event, so every 2 seconds it reads `$.session.usage()` again (a free call) and takes the figure when it moved.
- While the engine has no figure, it calls `$.session.usage({ breakdown: 'full' })` once, the count `/context` makes, and keeps that estimate until the next response.
- A `ui.render` hook on `AbovePrompt` draws the meter at the right end of the band right above the prompt; whatever the engine or another plugin draws there (Image Preview's chips) stays above it.

## Development

```bash
claude plugin validate .   # from this folder
claude plugin test .       # runs hooks/register.test.tsx against the engine
```

MIT © Miguel Ángel Durán (midudev)
