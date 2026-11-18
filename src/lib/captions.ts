export type Word = { text: string; start: number; end: number }
export type Cue = { words: Word[]; start: number; end: number }

const END_PUNCT = /[.!?…]$/
const SOFT_PUNCT = /[,;:]$/

/** Agrupa palavras em legendas curtas (até maxWords palavras e maxDur segundos). */
export function groupCues(words: Word[], maxWords = 6, maxDur = 3.2): Cue[] {
  const cues: Cue[] = []
  let cur: Word[] = []
  const flush = () => {
    if (!cur.length) return
    cues.push({ words: cur, start: cur[0].start, end: cur[cur.length - 1].end })
    cur = []
  }
  for (const w of words) {
    if (cur.length) {
      const gap = w.start - cur[cur.length - 1].end
      const dur = w.end - cur[0].start
      if (gap > 0.9 || cur.length >= maxWords || dur > maxDur) flush()
    }
    cur.push(w)
    const last = w.text.trim()
    if (END_PUNCT.test(last) || (SOFT_PUNCT.test(last) && cur.length >= 4)) flush()
  }
  flush()
  // evita que uma legenda fique no ar até a próxima começar (máx. 0,4 s depois da última palavra)
  return cues.map((c, i) => {
    const next = cues[i + 1]
    const end = Math.min(next ? next.start : c.end + 0.4, c.end + 0.4)
    return { ...c, end: Math.max(end, c.end) }
  })
}

export const cueText = (c: Cue) => c.words.map((w) => w.text.trim()).join(' ')

const pad = (n: number, l = 2) => String(Math.floor(n)).padStart(l, '0')

function stamp(t: number, sep: ',' | '.') {
  const ms = Math.round((t - Math.floor(t)) * 1000)
  const s = Math.floor(t) % 60
  const m = Math.floor(t / 60) % 60
  const h = Math.floor(t / 3600)
  return `${pad(h)}:${pad(m)}:${pad(s)}${sep}${pad(ms === 1000 ? 999 : ms, 3)}`
}

export function toSRT(cues: Cue[]): string {
  return cues
    .map((c, i) => `${i + 1}\n${stamp(c.start, ',')} --> ${stamp(c.end, ',')}\n${cueText(c)}\n`)
    .join('\n')
}

export function toVTT(cues: Cue[]): string {
  return (
    'WEBVTT\n\n' +
    cues.map((c) => `${stamp(c.start, '.')} --> ${stamp(c.end, '.')}\n${cueText(c)}\n`).join('\n')
  )
}

export function toTXT(cues: Cue[]): string {
  return cues.map(cueText).join('\n')
}

export function download(name: string, data: string | Blob, type = 'text/plain;charset=utf-8') {
  const blob = typeof data === 'string' ? new Blob([data], { type }) : data
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 4000)
}
