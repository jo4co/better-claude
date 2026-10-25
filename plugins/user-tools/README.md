# User Tools

A framed panel above the prompt for the session's settings, shown and hidden from the **◆ User Tools ▾** button in the footer or with `/user-tools` (or its own **✕**).

> Close it with **✕**, not with the `[-]` Claude Code draws beside it: that one folds the whole band, and the footer button cannot unfold it. If you see `▸ plugin panel hidden`, press **ctrl+x ctrl+a**.

```text
MODEL    Haiku 5.5  [Sonnet 5.5]  Opus 5.5  Fable 5.1
EFFORT   Low  Medium  [High]  XHigh  Max
```

- Click a model: it runs `/model <model>`.
- Click an effort: it runs `/effort <level>`; where the engine has no `/effort`, the panel sends that effort on every main request itself.
- The highlighted button follows the session: a `/model` typed by hand moves it too.

### Settings

- **Narrator**: switches the [narrator](../narrator/README.md) mod (`/narrator on|off`), and **↻ Replay** says the last narration again (`/narrator again`). To keep its switch only here, turn off **Footer switch** in `/config` → narrator.
- **Remote Control**: on while the session is connected to claude.ai/code or the Claude app. Off → On runs `/remote-control`; On → Off runs it too, which opens Claude Code's own dialog: pick **Disconnect this session**.
- **Prompt Upgrade**: while on, a prompt you type waits in a *Prompt Upgrade* pane instead of going to Claude. It asks up to three quick questions (pick an option, type your own or skip), rewrites your prompt into a request for a plan, and lets you **Send** it, **Edit in prompt**, **Send original** or **Cancel**. Esc on the pane drops the prompt.

## Make it yours

`/config` → **user-tools**:

| Option | Default | What it is |
| --- | --- | --- |
| Panel name | `User Tools` | The footer button and the pane's tab. |
| Models | `Haiku 5.5=claude-haiku-5-5, Sonnet 5.5=claude-sonnet-5-5, …` | `Label=model`, comma separated: an alias (`opus`) or a full id. |
| Efforts | `Low=low, Medium=medium, High=high, XHigh=xhigh, Max=max` | `Label=level`, or just the level. |
| Prompt Upgrade model | `sonnet` | The model that asks the questions and rewrites the prompt. |

Inspired by the "Tristen's Tools" panel, generalized for any user.
