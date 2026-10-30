# Token Meter

A Claude Code mod: after each turn, the hint line under the prompt ends with that turn's tokens and the session's running total, in color.

```text
⏵⏵ auto mode on · ↑ 1.2k  ↓ 340  cache 4.1k  ·  session ↑ 1.2k  ↓ 340
```

`↑` input (blue), `↓` output (green), `cache` the tokens read from or written to the prompt cache (Claude orange); the session total is dim. It starts over when the session starts.

## Install

```text
/plugin marketplace add midudev/better-claude
/plugin install token-meter@better-claude
```

## How it works

One hooks module ([`hooks/register.tsx`](hooks/register.tsx)):

- `turn.complete` keeps the turn's `usage` and adds it to the session total, in `$.state`.
- A `ui.render` hook on `PromptHint` wraps what the engine draws there (`await next(e)`, so its pills stay live and other plugins still apply) and adds the meter after it.

The status line (`$.ui.status`) only takes plain text, so the meter draws in the hint line to have colors.

## Development

```bash
claude plugin validate ./plugins/token-meter   # from the repository root
claude plugin test ./plugins/token-meter       # runs hooks/register.test.tsx against the engine
```

MIT © Miguel Ángel Durán (midudev)
