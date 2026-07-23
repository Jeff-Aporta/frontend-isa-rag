# ISA RAG — frontend

Chat con tus documentos (estilo NotebookLM / FitDocs). React 18 + WebAwesome + Iconify + neon-glass.

| | |
|---|---|
| Pages | https://jeff-aporta.github.io/frontend-isa-rag/ |
| API | https://worker-isa-rag.jeffaporta.workers.dev |
| Types CDN | `https://cdn.jsdelivr.net/gh/Jeff-Aporta/frontend-isa-rag@main/shared/types.ts` |

## Dev

```bash
npm ci
npm run build
npm test
npx serve -l 5179 .
# opcional: ?api=http://localhost:8810
```

## Build

`npm run build` → `_dist/css/app.css` + `_dist/js/main.js` minificados.
