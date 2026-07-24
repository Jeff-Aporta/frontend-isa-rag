# Shared types — isa-rag

Fuente de verdad para front y worker.

## CDN (jsDelivr)

Tras push a `main` de `isa-rag`:

```ts
import type { AskRequest, AskResponse, Space } from
  "https://cdn.jsdelivr.net/gh/Jeff-Aporta/isa-rag@main/shared/types.ts";
```

## Worker

Wrangler no resuelve imports `https://` en el bundle. Sincronizar:

```bash
cd api && npm run sync:shared
```

Copia `frontend/shared/*` → `api/vendor/shared/`.

## Regla

1. Editar solo en `frontend/shared/`.
2. Push front.
3. `sync:shared` en api antes de deploy.
