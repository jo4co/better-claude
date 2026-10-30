/**
 * The context window's fill, 0 to 100: the engine's figure from the last response, or, while it has
 * none (a fresh, resumed, compacted or rewound session), /context's count of it (`isEstimate`).
 * null when there is neither.
 */
export type Fill = { value: number; isEstimate: boolean } | null

declare module 'claude-code' {
  interface PluginState {
    'context-meter': { percent: Fill }
  }
}
