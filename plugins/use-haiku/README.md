# Use Haiku

A Claude Code mod: start a prompt with `_` and that turn runs on Haiku. Other prompts keep the session's model.

```text
❯ _summarize the last commit
```

Claude gets `summarize the last commit`, without the `_`, and every model request of that turn goes to `claude-haiku-5-5`, those of the subagents it starts included. The next prompt goes back to the session's model.

## You can see it

- **As you type.** The `_` lights up in the prompt box and the line under it says `⚡ this prompt runs on Haiku`.
- **While it runs.** The spinner says so: `✻ Sauteing on Haiku… (3s · ↓ 120 tokens)`.
- **When it ends.** A line under the answer names the model the API says answered: `⚡ Answered by claude-haiku-5-5`, or a warning if another one did.

Ask it _"which model are you?"_ and it says Haiku: the prompt carries a note, unseen by you, telling the model which one answers it.

## Install

```text
/plugin marketplace add midudev/better-claude
/plugin install use-haiku@better-claude
```

Requires a Claude Code version with mods (2.1.289 or newer).

## Details

- **Idle only.** A prompt typed while Claude is working is folded into the running turn or queued behind it, so it keeps the current model. The line under the prompt warns before you send it (`⚡ not on Haiku mid-turn`), and a toast says so if you do.
- **Not a mark:** `__init__.py fails` (a double underscore) and a lone `_`.
- **Your prompts only:** typed, from your phone, `claude -p "_…"`, a scheduled `/loop`, or a plugin sending them for you (After's `/after _…`). Messages from channels, other sessions or background tasks are left alone.
- **Subagents** the Haiku turn starts run on Haiku too, even after the turn ends. Teammates keep their own model.
- With `claude -p` the model switches the same, but no line is added under the answer, so the output stays clean.

## How it works

One hooks module ([`hooks/register.tsx`](hooks/register.tsx)):

- `prompt.edit`: marks the `_` in the box and records that the draft carries it.
- `prompt.submit`: an idle prompt starting with `_` loses the mark, gets the note for the model, and claims the next turn.
- `turn.start`: that turn becomes the Haiku turn.
- `turn.step`: each request of the Haiku turn, and of the subagents it started, names Haiku (`next({ ...e, model })`).
- `agent.spawn`: a subagent the Haiku turn starts is spawned on Haiku.
- `turn.complete`: the main loop's turn ends the Haiku turn and adds the line under the answer.
- `ui.render` on `Spinner` and `PromptHint`: the spinner and the line under the prompt.

The Haiku turn and its subagents live in `$.state` ([`types/index.d.ts`](types/index.d.ts)), so a reload mid-turn keeps them.

## Development

```bash
claude plugin validate ./plugins/use-haiku   # from the repository root
claude plugin test ./plugins/use-haiku       # runs hooks/register.test.tsx against the engine
```

MIT © Miguel Ángel Durán (midudev)
