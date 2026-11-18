/// <reference lib="webworker" />
import { env, pipeline } from '@huggingface/transformers'

env.allowLocalModels = false

const MODEL = 'onnx-community/whisper-base_timestamped'

type AsrFn = (audio: Float32Array, opts: Record<string, unknown>) => Promise<{
  text: string
  chunks?: { text: string; timestamp: [number, number | null] }[]
}>

let asr: AsrFn | null = null
let backend = ''

async function load(): Promise<AsrFn> {
  if (asr) return asr
  const progress_callback = (p: { status: string; progress?: number; file?: string }) => {
    self.postMessage({ type: 'download', status: p.status, progress: p.progress ?? 0, file: p.file })
  }
  const hasGPU = 'gpu' in navigator
  if (hasGPU) {
    try {
      asr = (await pipeline('automatic-speech-recognition', MODEL, {
        device: 'webgpu',
        dtype: { encoder_model: 'fp32', decoder_model_merged: 'q4' },
        progress_callback,
      })) as unknown as AsrFn
      backend = 'WebGPU'
      return asr
    } catch (e) {
      console.warn('WebGPU indisponível, usando WASM', e)
    }
  }
  asr = (await pipeline('automatic-speech-recognition', MODEL, {
    device: 'wasm',
    dtype: 'q8',
    progress_callback,
  })) as unknown as AsrFn
  backend = 'WASM (CPU)'
  return asr
}

self.onmessage = async (e: MessageEvent<{ audio: Float32Array; language: string }>) => {
  try {
    const run = await load()
    self.postMessage({ type: 'ready', backend })
    const t0 = performance.now()
    const out = await run(e.data.audio, {
      language: e.data.language,
      task: 'transcribe',
      return_timestamps: 'word',
      chunk_length_s: 30,
      stride_length_s: 5,
    })
    const words = (out.chunks ?? [])
      .filter((c) => c.text.trim())
      .map((c, i, arr) => {
        const start = c.timestamp[0]
        const end = c.timestamp[1] ?? arr[i + 1]?.timestamp[0] ?? start + 0.4
        return { text: c.text.trim(), start, end }
      })
    self.postMessage({ type: 'done', words, seconds: (performance.now() - t0) / 1000 })
  } catch (err) {
    self.postMessage({ type: 'error', message: String((err as Error)?.message ?? err) })
  }
}
