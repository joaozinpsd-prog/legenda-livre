import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import './App.css'
import { decodeTo16k } from './lib/audio'
import { type Cue, cueText, download, groupCues, toSRT, toTXT, toVTT, type Word } from './lib/captions'
import { type CaptionStyle, drawCue, STYLES, type StyleId } from './lib/render'

type Phase = 'idle' | 'audio' | 'model' | 'transcribing' | 'done' | 'error'

const LANGS = [
  { id: 'portuguese', nome: 'Português' },
  { id: 'english', nome: 'English' },
  { id: 'spanish', nome: 'Español' },
]

const fmt = (t: number) => {
  const m = Math.floor(t / 60)
  const s = Math.floor(t % 60)
  return `${m}:${String(s).padStart(2, '0')}`
}

export default function App() {
  const [phase, setPhase] = useState<Phase>('idle')
  const [msg, setMsg] = useState('')
  const [dl, setDl] = useState(0)
  const [backend, setBackend] = useState('')
  const [seconds, setSeconds] = useState(0)
  const [lang, setLang] = useState('portuguese')
  const [over, setOver] = useState(false)
  const [file, setFile] = useState<File | null>(null)
  const [url, setUrl] = useState('')
  const [isVideo, setIsVideo] = useState(true)
  const [cues, setCues] = useState<Cue[]>([])
  const [style, setStyle] = useState<CaptionStyle>({ id: 'karaoke', position: 'baixo', size: 1 })
  const [time, setTime] = useState(0)
  const [dur, setDur] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [exporting, setExporting] = useState<number | null>(null)

  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const cuesRef = useRef<Cue[]>([])
  const styleRef = useRef(style)
  const workerRef = useRef<Worker | null>(null)
  const audioGraph = useRef<{ ctx: AudioContext; src: MediaElementAudioSourceNode; dest: MediaStreamAudioDestinationNode } | null>(null)
  cuesRef.current = cues
  styleRef.current = style

  const busy = phase === 'audio' || phase === 'model' || phase === 'transcribing'

  /* ------------ desenho (mesmo renderizador no preview e no vídeo exportado) ------------ */
  useEffect(() => {
    let raf = 0
    let last = 0
    const loop = (now: number) => {
      const v = videoRef.current
      const c = canvasRef.current
      if (v && c && v.videoWidth) {
        const ctx = c.getContext('2d')!
        const t = v.currentTime
        ctx.drawImage(v, 0, 0, c.width, c.height)
        const cue = cuesRef.current.find((q) => t >= q.start && t <= q.end)
        drawCue(ctx, c.width, c.height, cue, t, styleRef.current)
        if (now - last > 90) {
          last = now
          setTime(t)
        }
      } else if (v && c && !isVideoRef.current) {
        // áudio sem imagem: fundo simples
        const ctx = c.getContext('2d')!
        ctx.fillStyle = '#12151b'
        ctx.fillRect(0, 0, c.width, c.height)
        const t = v.currentTime
        const cue = cuesRef.current.find((q) => t >= q.start && t <= q.end)
        drawCue(ctx, c.width, c.height, cue, t, { ...styleRef.current, position: 'centro' })
        if (now - last > 90) {
          last = now
          setTime(t)
        }
      }
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [])
  const isVideoRef = useRef(true)
  isVideoRef.current = isVideo

  /* ------------ arquivo ------------ */
  const loadFile = useCallback(async (f: File) => {
    workerRef.current?.terminate()
    setCues([])
    setPhase('audio')
    setMsg('Lendo o áudio do arquivo…')
    setFile(f)
    setIsVideo(f.type.startsWith('video/'))
    setUrl((old) => {
      if (old) URL.revokeObjectURL(old)
      return URL.createObjectURL(f)
    })
    try {
      const pcm = await decodeTo16k(f)
      setPhase('model')
      setMsg('Preparando o modelo de voz (baixa só na primeira vez)…')
      setDl(0)
      const worker = new Worker(new URL('./lib/transcribe.worker.ts', import.meta.url), { type: 'module' })
      workerRef.current = worker
      worker.onmessage = (e: MessageEvent) => {
        const d = e.data
        if (d.type === 'download') {
          if (d.status === 'progress') setDl(d.progress)
        } else if (d.type === 'ready') {
          setBackend(d.backend)
          setPhase('transcribing')
          setMsg('Transcrevendo no seu aparelho…')
        } else if (d.type === 'done') {
          const words = d.words as Word[]
          setCues(groupCues(words))
          setSeconds(d.seconds)
          setPhase('done')
          setMsg('')
          worker.terminate()
        } else if (d.type === 'error') {
          setPhase('error')
          setMsg(d.message)
          worker.terminate()
        }
      }
      worker.postMessage({ audio: pcm, language: lang }, [pcm.buffer])
    } catch (err) {
      setPhase('error')
      setMsg(
        'Não consegui ler o áudio desse arquivo. Tente um MP4, MOV, WebM, MP3 ou WAV. ' +
          String((err as Error)?.message ?? ''),
      )
    }
  }, [lang])

  useEffect(() => () => workerRef.current?.terminate(), [])

  const loadExample = async () => {
    const r = await fetch(`${import.meta.env.BASE_URL}exemplo.mp4`)
    const b = await r.blob()
    void loadFile(new File([b], 'exemplo.mp4', { type: 'video/mp4' }))
  }

  /* ------------ vídeo ------------ */
  const onMeta = () => {
    const v = videoRef.current!
    setDur(v.duration)
    const c = canvasRef.current!
    if (v.videoWidth) {
      const k = Math.min(1, 1280 / Math.max(v.videoWidth, v.videoHeight))
      c.width = Math.round(v.videoWidth * k)
      c.height = Math.round(v.videoHeight * k)
    } else {
      c.width = 1280
      c.height = 720
    }
    v.currentTime = 0.01
  }

  const ensureAudioGraph = () => {
    if (audioGraph.current) return audioGraph.current
    const v = videoRef.current!
    const ctx = new AudioContext()
    const src = ctx.createMediaElementSource(v)
    const dest = ctx.createMediaStreamDestination()
    src.connect(ctx.destination)
    src.connect(dest)
    audioGraph.current = { ctx, src, dest }
    return audioGraph.current
  }

  const toggle = async () => {
    const v = videoRef.current!
    const g = ensureAudioGraph()
    if (g.ctx.state === 'suspended') await g.ctx.resume()
    if (v.paused) await v.play()
    else v.pause()
  }

  const seek = (t: number) => {
    const v = videoRef.current
    if (v) v.currentTime = t
    setTime(t)
  }

  /* ------------ edição ------------ */
  const editCue = (i: number, text: string) => {
    setCues((cs) =>
      cs.map((c, k) => {
        if (k !== i) return c
        const toks = text.split(/\s+/).filter(Boolean)
        if (!toks.length) return c
        if (toks.length === c.words.length) {
          return { ...c, words: c.words.map((w, j) => ({ ...w, text: toks[j] })) }
        }
        const step = (c.end - c.start) / toks.length
        return { ...c, words: toks.map((tx, j) => ({ text: tx, start: c.start + j * step, end: c.start + (j + 1) * step })) }
      }),
    )
  }

  const activeIdx = useMemo(() => cues.findIndex((q) => time >= q.start && time <= q.end), [cues, time])
  const activeRef = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: 'nearest' })
  }, [activeIdx])

  /* ------------ exportar vídeo legendado ------------ */
  const exportVideo = async () => {
    const v = videoRef.current!
    const c = canvasRef.current!
    const g = ensureAudioGraph()
    if (g.ctx.state === 'suspended') await g.ctx.resume()
    const mime = ['video/mp4;codecs=avc1,mp4a.40.2', 'video/webm;codecs=vp9,opus', 'video/webm'].find((m) =>
      MediaRecorder.isTypeSupported(m),
    )
    if (!mime) return alert('Seu navegador não consegue gravar vídeo. Use o Chrome.')
    const stream = c.captureStream(30)
    g.dest.stream.getAudioTracks().forEach((t) => stream.addTrack(t))
    const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 6_000_000 })
    const chunks: BlobPart[] = []
    rec.ondataavailable = (e) => e.data.size && chunks.push(e.data)
    g.src.disconnect(g.ctx.destination) // exporta em silêncio
    g.src.connect(g.dest)
    v.pause()
    v.currentTime = 0
    await new Promise((r) => setTimeout(r, 250))
    setExporting(0)
    const ext = mime.startsWith('video/mp4') ? 'mp4' : 'webm'
    const done = new Promise<void>((res) => {
      rec.onstop = () => res()
    })
    const tick = setInterval(() => setExporting(v.duration ? v.currentTime / v.duration : 0), 200)
    v.onended = () => rec.state !== 'inactive' && rec.stop()
    rec.start(500)
    await v.play()
    await done
    clearInterval(tick)
    v.onended = null
    g.src.connect(g.ctx.destination)
    download(`${(file?.name ?? 'video').replace(/\.[^.]+$/, '')}-legendado.${ext}`, new Blob(chunks, { type: mime }))
    setExporting(null)
    v.currentTime = 0
  }

  const base = (file?.name ?? 'legendas').replace(/\.[^.]+$/, '')
  const showWork = !!file

  return (
    <div className="wrap">
      <header className="top">
        <div className="logo">
          <i aria-hidden="true">L</i> Legenda Livre
        </div>
        <span className="badge">Hack Brasil 2026 · Cultura &amp; economia criativa</span>
      </header>

      {!showWork && (
        <section className="hero">
          <h1>
            Legendas em português, <em>sem sair do seu aparelho</em>.
          </h1>
          <p>
            Arraste um vídeo ou áudio e receba legendas sincronizadas palavra por palavra. A transcrição roda no seu
            navegador: nada é enviado a servidor, não precisa de conta e não custa nada.
          </p>
          <div className="pillars">
            <div className="pillar">
              <b>Acessibilidade de verdade</b>
              <span>Surdos e ensurdecidos entendem o conteúdo de qualquer criador, sem depender de serviço pago.</span>
            </div>
            <div className="pillar">
              <b>Privado por padrão</b>
              <span>O arquivo nunca sai do computador. Serve para vídeos de clientes, aulas e conteúdo ainda não publicado.</span>
            </div>
            <div className="pillar">
              <b>Pronto para publicar</b>
              <span>Baixe SRT, VTT ou TXT, ou exporte o vídeo já com legenda animada no estilo Reels.</span>
            </div>
          </div>
        </section>
      )}

      {!showWork && (
        <div
          className={`drop ${over ? 'over' : ''}`}
          onDragOver={(e) => {
            e.preventDefault()
            setOver(true)
          }}
          onDragLeave={() => setOver(false)}
          onDrop={(e) => {
            e.preventDefault()
            setOver(false)
            const f = e.dataTransfer.files?.[0]
            if (f) void loadFile(f)
          }}
        >
          <strong>Solte aqui um vídeo ou áudio</strong>
          <small>MP4, MOV, WebM, MP3, WAV · processado só no seu navegador</small>
          <div className="row">
            <label className="btn primary" style={{ cursor: 'pointer' }}>
              Escolher arquivo
              <input
                className="sr-only"
                type="file"
                accept="video/*,audio/*"
                onChange={(e) => e.target.files?.[0] && void loadFile(e.target.files[0])}
              />
            </label>
            <button className="btn" onClick={() => void loadExample()}>
              Testar com um exemplo
            </button>
            <label className="badge">
              Idioma falado:{' '}
              <select className="btn" value={lang} onChange={(e) => setLang(e.target.value)} aria-label="Idioma falado no vídeo">
                {LANGS.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.nome}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>
      )}

      {showWork && (
        <>
          <div className="grid">
            <div className="card">
              <h2>Pré-visualização</h2>
              <div className="stage">
                <canvas ref={canvasRef} width={1280} height={720} aria-label="Vídeo com legendas" />
              </div>
              <video
                ref={videoRef}
                src={url}
                onLoadedMetadata={onMeta}
                onPlay={() => setPlaying(true)}
                onPause={() => setPlaying(false)}
                playsInline
                preload="auto"
                style={{ display: 'none' }}
              />
              <div className="controls">
                <button className="btn" onClick={() => void toggle()} aria-label={playing ? 'Pausar' : 'Reproduzir'}>
                  {playing ? 'Pausar' : 'Reproduzir'}
                </button>
                <input
                  type="range"
                  min={0}
                  max={dur || 1}
                  step={0.05}
                  value={time}
                  onChange={(e) => seek(Number(e.target.value))}
                  aria-label="Posição no vídeo"
                />
                <span className="time">
                  {fmt(time)} / {fmt(dur)}
                </span>
              </div>
            </div>

            <div style={{ display: 'grid', gap: 18 }}>
              <div className="card">
                <h2>Estilo da legenda</h2>
                <div className="styles">
                  {STYLES.map((s) => (
                    <button
                      key={s.id}
                      className="style"
                      aria-pressed={style.id === s.id}
                      onClick={() => setStyle((o) => ({ ...o, id: s.id as StyleId }))}
                    >
                      <b>{s.nome}</b>
                      <span>{s.desc}</span>
                    </button>
                  ))}
                </div>
                <div className="opts">
                  <label>
                    Posição{' '}
                    <select
                      className="btn"
                      value={style.position}
                      onChange={(e) => setStyle((o) => ({ ...o, position: e.target.value as CaptionStyle['position'] }))}
                    >
                      <option value="baixo">Embaixo</option>
                      <option value="centro">Centro</option>
                    </select>
                  </label>
                  <label>
                    Tamanho{' '}
                    <input
                      type="range"
                      min={0.7}
                      max={1.6}
                      step={0.05}
                      value={style.size}
                      onChange={(e) => setStyle((o) => ({ ...o, size: Number(e.target.value) }))}
                    />
                  </label>
                </div>
              </div>

              <div className="card">
                <h2>Baixar</h2>
                <div className="row" style={{ justifyContent: 'flex-start' }}>
                  <button className="btn" disabled={!cues.length} onClick={() => download(`${base}.srt`, toSRT(cues))}>
                    SRT
                  </button>
                  <button className="btn" disabled={!cues.length} onClick={() => download(`${base}.vtt`, toVTT(cues), 'text/vtt;charset=utf-8')}>
                    VTT
                  </button>
                  <button className="btn" disabled={!cues.length} onClick={() => download(`${base}.txt`, toTXT(cues))}>
                    TXT
                  </button>
                  <button className="btn primary" disabled={!cues.length || exporting !== null} onClick={() => void exportVideo()}>
                    {exporting === null ? 'Vídeo legendado' : `Gravando… ${Math.round(exporting * 100)}%`}
                  </button>
                </div>
                <p style={{ color: 'var(--muted)', fontSize: 13, marginTop: 10 }}>
                  O vídeo legendado é gravado em tempo real: leva o mesmo tempo do vídeo. Mantenha esta aba aberta.
                </p>
              </div>
            </div>
          </div>

          <div className="status" role="status" aria-live="polite">
            {busy && (
              <>
                <b>{msg}</b>
                {phase === 'model' && <div> {Math.round(dl)}% do modelo baixado</div>}
                <div className={`bar ${phase === 'model' ? '' : 'indet'}`}>
                  <div style={phase === 'model' ? { width: `${dl}%` } : undefined} />
                </div>
              </>
            )}
            {phase === 'done' && (
              <span className="ok">
                Pronto: {cues.length} legendas em {seconds.toFixed(1)} s, calculadas no seu aparelho ({backend}).
              </span>
            )}
            {phase === 'error' && <span className="err">Algo deu errado: {msg}</span>}
          </div>

          {cues.length > 0 && (
            <div className="card" style={{ marginTop: 18 }}>
              <h2>Revise e corrija (clique no horário para ir até o trecho)</h2>
              <div className="cues">
                {cues.map((c, i) => (
                  <div key={i} className={`cue ${i === activeIdx ? 'active' : ''}`} ref={i === activeIdx ? activeRef : undefined}>
                    <button onClick={() => seek(c.start)} aria-label={`Ir para ${fmt(c.start)}`}>
                      {fmt(c.start)}
                    </button>
                    <textarea
                      rows={1}
                      value={cueText(c)}
                      onChange={(e) => editCue(i, e.target.value)}
                      aria-label={`Legenda ${i + 1}`}
                    />
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="row" style={{ marginTop: 18, justifyContent: 'flex-start' }}>
            <button
              className="btn"
              onClick={() => {
                workerRef.current?.terminate()
                setFile(null)
                setCues([])
                setPhase('idle')
                setTime(0)
              }}
            >
              Outro arquivo
            </button>
          </div>
        </>
      )}

      <footer className="foot">
        <span>
          Feito para o Hack Brasil 2026 por João Mateus Panichelli (JM Design &amp; Marketing). Código aberto no GitHub.
        </span>
        <span>
          Reconhecimento de voz: Whisper (OpenAI) via Transformers.js, executado localmente por WebGPU ou WASM. A
          qualidade varia com o áudio: sempre revise antes de publicar.
        </span>
      </footer>
    </div>
  )
}
