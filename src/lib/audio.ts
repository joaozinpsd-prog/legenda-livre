/** Decodifica o áudio de um arquivo de vídeo/áudio para Float32 mono em 16 kHz (formato do Whisper). */
export async function decodeTo16k(file: File): Promise<Float32Array> {
  const buf = await file.arrayBuffer()
  const ctx = new AudioContext()
  let decoded: AudioBuffer
  try {
    decoded = await ctx.decodeAudioData(buf.slice(0))
  } finally {
    void ctx.close()
  }
  const frames = Math.ceil(decoded.duration * 16000)
  const off = new OfflineAudioContext(1, frames, 16000)
  const src = off.createBufferSource()
  src.buffer = decoded
  src.connect(off.destination)
  src.start()
  const rendered = await off.startRendering()
  return rendered.getChannelData(0)
}
