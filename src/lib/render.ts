import type { Cue } from './captions'

export type StyleId = 'classico' | 'karaoke' | 'pop'
export type CaptionStyle = { id: StyleId; position: 'baixo' | 'centro'; size: number }

export const STYLES: { id: StyleId; nome: string; desc: string }[] = [
  { id: 'classico', nome: 'Clássico', desc: 'Texto branco em faixa escura, ideal para acessibilidade' },
  { id: 'karaoke', nome: 'Karaokê', desc: 'A palavra falada acende em amarelo' },
  { id: 'pop', nome: 'Pop', desc: 'Maiúsculas grossas com contorno, estilo Reels' },
]

function wrap(ctx: CanvasRenderingContext2D, words: string[], maxW: number): string[][] {
  const lines: string[][] = []
  let line: string[] = []
  for (const w of words) {
    const test = [...line, w].join(' ')
    if (line.length && ctx.measureText(test).width > maxW) {
      lines.push(line)
      line = [w]
    } else line.push(w)
  }
  if (line.length) lines.push(line)
  return lines
}

export function drawCue(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  cue: Cue | undefined,
  t: number,
  style: CaptionStyle,
) {
  if (!cue) return
  const pop = style.id === 'pop'
  const fontPx = Math.round(H * 0.045 * style.size * (pop ? 1.25 : 1))
  ctx.font = `${pop ? 900 : 700} ${fontPx}px "Inter", "Helvetica Neue", Arial, sans-serif`
  ctx.textBaseline = 'middle'
  ctx.textAlign = 'left'
  const texts = cue.words.map((w) => (pop ? w.text.toUpperCase() : w.text))
  const maxW = W * 0.86
  const lines = wrap(ctx, texts, maxW)
  const lh = fontPx * 1.28
  const blockH = lines.length * lh
  const baseY = style.position === 'baixo' ? H * 0.9 - blockH : (H - blockH) / 2
  const space = ctx.measureText(' ').width

  let idx = 0
  lines.forEach((ln, li) => {
    const lw = ln.reduce((s, w) => s + ctx.measureText(w).width, 0) + space * (ln.length - 1)
    let x = (W - lw) / 2
    const y = baseY + li * lh + lh / 2
    if (style.id === 'classico') {
      ctx.fillStyle = 'rgba(0,0,0,0.72)'
      const padX = fontPx * 0.45
      ctx.beginPath()
      ctx.roundRect(x - padX, y - lh / 2 + lh * 0.06, lw + padX * 2, lh * 0.88, fontPx * 0.25)
      ctx.fill()
    }
    ln.forEach((w) => {
      const word = cue.words[idx++]
      const active = t >= word.start && t < word.end
      const wW = ctx.measureText(w).width
      if (pop) {
        ctx.lineJoin = 'round'
        ctx.lineWidth = fontPx * 0.2
        ctx.strokeStyle = '#000'
        ctx.strokeText(w, x, y)
        ctx.fillStyle = active ? '#ffe14d' : '#fff'
        ctx.fillText(w, x, y)
      } else if (style.id === 'karaoke') {
        ctx.lineJoin = 'round'
        ctx.lineWidth = fontPx * 0.14
        ctx.strokeStyle = 'rgba(0,0,0,0.85)'
        ctx.strokeText(w, x, y)
        ctx.fillStyle = active ? '#ffd23f' : t >= word.end ? '#ffffff' : 'rgba(255,255,255,0.62)'
        ctx.fillText(w, x, y)
      } else {
        ctx.fillStyle = '#fff'
        ctx.fillText(w, x, y)
      }
      x += wW + space
    })
  })
}
