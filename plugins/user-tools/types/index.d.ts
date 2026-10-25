export type Question = { text: string, options: string[] }

/** A prompt Prompt Upgrade holds back while it asks about it and rewrites it. */
export type Upgrade = {
  id: number
  /** The prompt as the person wrote it. */
  prompt: string
  stage: 'questions' | 'rewrite' | 'review' | 'error'
  /** null while the model thinks of them. */
  questions: Question[] | null
  /** One per question: null unanswered, '' skipped, else the answer. */
  answers: (string | null)[]
  /** The question whose "Other" field is open. */
  typing: number | null
  rewritten: string | null
  error: string | null
}

declare module 'claude-code' {
  interface PluginState {
    'user-tools': {
      /** Whether the panel shows above the prompt. */
      isOpen: boolean
      /** The effort the session runs at, as the last main request sent it; null before one. */
      effort: string | null
      /** The effort chosen in the panel where the engine has no /effort command to set it. */
      effortOverride: string | null
      /** Whether each prompt typed goes through Prompt Upgrade first. */
      isUpgradeOn: boolean
      /** The prompt Prompt Upgrade is working on, null when none. */
      upgrade: Shaped<Upgrade | null>
    }
    /** The narrator mod's switch, read to draw its row (narrator owns it). */
    narrator: {
      isEnabled: boolean
    }
  }
}
