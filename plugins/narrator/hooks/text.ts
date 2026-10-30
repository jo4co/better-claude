// What the narrator says, as text a synthesizer reads well, and the language it is in.

// The first line of the narrator's reply: the language's code, maybe quoted or bracketed, after a
// label ("Language: es") or beside a stray number ("1. es").
const LANGUAGE_LINE = /^[^\p{L}\n]*(?:(?:language|lang|idioma)[^\p{L}\n]+)?([a-z]{2,3})(?:[-_][a-z0-9]{2,8})?[^\p{L}\n]*\n([\s\S]*)$/iu
// A first line with no letters at all ("1", "--"): no narration, and never to be read out.
const BARE_LINE = /^[^\p{L}\n]*\n([\s\S]*)$/u
// The code before a colon, on the narration's own line ("es: He añadido…").
const INLINE_CODE = /^[^\p{L}\n]*([a-z]{2,3})(?:[-_][a-z0-9]{2,8})?\s*:\s+(\S[\s\S]*)$/iu
const DISPLAY_NAMES = new Intl.DisplayNames(['en'], { type: 'language', fallback: 'none' })
// Common words, to tell the language of a text no model narrated.
const WORDS: Record<string, Set<string>> = {
  en: new Set(['the', 'and', 'is', 'to', 'of', 'it', 'you', 'that', 'with', 'for', 'this', 'are']),
  es: new Set(['el', 'la', 'que', 'de', 'y', 'en', 'los', 'las', 'es', 'para', 'por', 'una', 'del', 'he']),
  pt: new Set(['o', 'que', 'não', 'em', 'um', 'uma', 'os', 'você', 'está', 'do', 'da', 'foi']),
  fr: new Set(['le', 'la', 'les', 'et', 'est', 'des', 'une', 'pour', 'que', 'dans', 'vous', 'pas']),
  de: new Set(['der', 'die', 'das', 'und', 'ist', 'nicht', 'ich', 'mit', 'für', 'sie', 'den', 'ein']),
  it: new Set(['il', 'che', 'di', 'è', 'per', 'una', 'con', 'non', 'sono', 'gli', 'della', 'ho'])
}

// A commit's hash, which a synthesizer reads letter by letter: hex digits, a number and a letter among them.
const HASH = /\b(?=[0-9a-f]*\d)(?=[0-9a-f]*[a-f])[0-9a-f]{7,40}\b/g
const EXTENSION = /(.)(?:\.[a-z][a-z0-9]{0,4})+$/i

/** How a person names a file or folder: by its last part, without the extension (`hooks/register.tsx`: register). */
const fileName = (path: string) => (path.split(/[\\/]/).filter(Boolean).pop() ?? '').replace(EXTENSION, '$1')

/** Whether a word with a slash in it is a path, not `and/or` or a date: from the root, home or here, or with an extension or two slashes, its last part a name. */
const isPath = (word: string) =>
  /[a-z]/i.test(fileName(word)) && (/^(?:~|\.{1,2})?\//.test(word) || EXTENSION.test(word) || word.split('/').length > 2)

/** `text` cut to `size` characters, at a sentence's end when there is one in its second half. */
export function cut (text: string, size: number) {
  if (text.length <= size) return text
  const head = text.slice(0, size)
  const end = Math.max(head.lastIndexOf('. '), head.lastIndexOf('! '), head.lastIndexOf('? '))
  return end > size / 2 ? head.slice(0, end + 1) : `${head.trimEnd()}…`
}

/**
 * Markdown as a synthesizer should read it: no code blocks, marks, links' addresses or bullets, a
 * path said by its file's name, and no hashes.
 */
export function plain (markdown: string) {
  return markdown
    .replace(/```[\s\S]*?(```|$)/g, ' ')
    // Code that is a path or a file is said by its name; any other, as it is.
    .replace(/`([^`]*)`/g, (code, inside: string) => (/^[^\s/\\]*([/\\][^\s/\\]*)+$|^[\w-]+\.[a-z][a-z0-9]{0,4}$/i.test(inside) ? fileName(inside) : inside))
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/^\s{0,3}(#{1,6}|[-*+•]|\d+[.)]|>)\s+/gm, '')
    .replace(/[\w.@~-]*\/[\w.@~/-]*[\w@~/-]/g, word => (isPath(word) ? fileName(word) : word))
    .replace(HASH, ' ')
    .replace(/\(\s*\)/g, ' ')
    .replace(/[*_~|#>]+/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/ ([.,;:!?？؟])/g, '$1')
    .replace(/^[\s-]+/, '')
    .trim()
}

/** The language of `text` by its most common words, or '' when too few say. */
export function guessLanguage (text: string) {
  const words = text.toLowerCase().match(/\p{L}+/gu) ?? []
  let best = ''
  let most = 2
  for (const [language, common] of Object.entries(WORDS)) {
    let count = 0
    for (const word of words) if (common.has(word)) count++
    if (count > most) [best, most] = [language, count]
  }
  return best
}

/** The sentences of a text: each ends at a full stop, an exclamation or a question mark. */
const sentences = (text: string) => text.split(/(?<=[.!?…؟])\s+|(?<=[。！？])\s*/).filter(Boolean)
const isQuestion = (sentence: string) => /[?？؟]$/.test(sentence)

/**
 * Claude's closing question to the user, as it reads aloud ("¿Lo hago?", "Want me to open a PR?"): the
 * questions that end its last line. Empty when the answer does not end with one, or with a long one.
 */
export function finalQuestion (answer: string) {
  const last = plain(answer.trim().split('\n').filter(line => line.trim()).pop() ?? '')
  const asked: string[] = []
  for (const sentence of sentences(last).reverse()) {
    if (!isQuestion(sentence)) break
    asked.unshift(sentence)
  }
  const question = asked.join(' ')
  return question.length <= 200 ? question : ''
}

/** The narration, then Claude's closing question as Claude wrote it: once, in place of any question the narration ends with. */
export function withQuestion (narration: string, question: string) {
  if (!narration || !question || narration.includes(question)) return narration
  const cleaned = narration.replace(/(?:[;:]\s*[^.!?;:]*|,\s*¿[^?]*)[?？؟]$/, '.')
  const said = sentences(cleaned)
  while (said.length > 0 && isQuestion(said.at(-1)!)) said.pop()
  return said.length > 0 ? `${said.join(' ')} ${question}` : question
}

/** Whether `code` names a language the runtime knows ("es", "en"), not any two letters ("ok"). */
function isLanguageCode (code: string) {
  try {
    return DISPLAY_NAMES.of(code.toLowerCase()) !== undefined
  } catch {
    return false
  }
}

/**
 * The narrator's reply as its language and what to say. The code line is never said: also when the
 * model writes it in another shape (a label, a stray number, after a colon), or writes a line with no
 * letters in its place. A reply without the code is guessed.
 */
export function parseNarration (reply: string) {
  const trimmed = reply.trim()
  const found = LANGUAGE_LINE.exec(trimmed + '\n')
  if (found && isLanguageCode(found[1]!)) return { language: found[1]!.toLowerCase(), text: plain(found[2]!) }
  const inline = INLINE_CODE.exec(trimmed)
  if (inline && isLanguageCode(inline[1]!)) return { language: inline[1]!.toLowerCase(), text: plain(inline[2]!) }
  const bare = BARE_LINE.exec(trimmed + '\n')
  const text = plain(bare ? bare[1]! : trimmed)
  return { language: guessLanguage(text), text }
}
