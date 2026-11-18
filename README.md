# Legenda Livre

Legendas automáticas em português (e inglês/espanhol), **geradas 100% no navegador**.
Sem upload, sem conta, sem custo. Projeto do **Hack Brasil 2026**, trilha *Cultura & economia criativa*.

## O problema

Legenda é acessibilidade: pessoas surdas e ensurdecidas só entendem vídeo e áudio quando há texto sincronizado.
Para criadores pequenos, o caminho comum é pagar uma ferramenta de legenda por minuto ou enviar o arquivo (muitas
vezes ainda não publicado, ou de um cliente) para o servidor de terceiros. Muita gente por isso publica sem legenda.

## A solução

O Legenda Livre roda o modelo de reconhecimento de voz Whisper **dentro do navegador** (WebGPU, com fallback para
WASM). O arquivo nunca sai do aparelho.

- Transcrição com tempo por palavra, em português, inglês ou espanhol
- Revisão e correção do texto ao lado do vídeo, com sincronização imediata
- Três estilos de legenda: **Clássico** (alto contraste, acessibilidade), **Karaokê** (palavra falada acende) e **Pop** (estilo Reels)
- Exporta **SRT, VTT, TXT** e o **vídeo já legendado** (gravado no próprio navegador)
- Funciona offline depois do primeiro uso (o modelo fica em cache)

## Como rodar

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # gera dist/ estático, pronto para qualquer hospedagem
```

Requisitos: navegador recente baseado em Chromium (WebGPU recomendado). Sem WebGPU, cai para WASM (mais lento).

## Como funciona

| Etapa | Arquivo | O que faz |
|---|---|---|
| Áudio | `src/lib/audio.ts` | Decodifica o arquivo e reamostra para 16 kHz mono |
| Voz → texto | `src/lib/transcribe.worker.ts` | Whisper (`whisper-base_timestamped`) em Web Worker, via Transformers.js |
| Legendas | `src/lib/captions.ts` | Agrupa palavras em legendas, gera SRT/VTT/TXT |
| Desenho | `src/lib/render.ts` | Um só renderizador em canvas, usado na pré-visualização e no vídeo exportado |
| Interface | `src/App.tsx` | Fluxo de arquivo, revisão, estilos e exportação |

## Limites conhecidos

- A qualidade depende do áudio: ruído, música alta e sotaques fortes geram erros. Por isso a revisão é parte do fluxo.
- O vídeo legendado é gravado em tempo real (leva a duração do vídeo).
- O primeiro uso baixa o modelo (algumas centenas de MB); depois fica em cache.

## Feito durante o evento

Todo o código deste repositório foi escrito depois de 4 de novembro de 2026, 21h, em repositório novo, conforme o
regulamento do Hack Brasil. Reconhecimento de voz: Whisper (OpenAI), licença MIT, via
[Transformers.js](https://github.com/huggingface/transformers.js) (Apache-2.0).

## Autor

João Mateus Panichelli: JM Design & Marketing, Bebedouro/SP.

## Licença

MIT
