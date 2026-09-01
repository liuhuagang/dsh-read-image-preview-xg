# dsh-read-image-preview-xg

[简体中文](README.md) · **English**

DSH plugin: **inline image preview** for the `read_image` tool call result.

After the model calls `read_image`, the chat previously displayed only a single line
"Read image <path>" plus the flattened JSON (image blocks serialized and shown via
`resultText`). This plugin registers a keyed `read_image` view on the
`tool.call.toolview` slot, replacing that tool card with a preview card that includes
a **thumbnail**:

- The thumbnail rule matches official message images: long edge 240px, aspect ratio
  clamped to [0.25, 4], no upscaling;
- Clicking the thumbnail opens a **full-size lightbox** (close via Esc / clicking the
  mask / ✕);
- Images are resolved through the **session-authorized** path
  (`uiConversation.imageUrl`, the same path used for chat message images:
  session-bound REST attachment read → blob URL, cached per session and released when
  the binding is torn down);
- running / error states match the official card semantics; on load failure you can
  click to retry;
- Includes an "Open" button (opens the result path via the host).

## Structure

- `src/logic.ts` — pure functions: card model derivation (path / image attachment /
  status extraction) + presentation formatting (`mediaType` abbreviation, byte count,
  size rules), shared by host and client, fully covered by `tests/`;
- `src/client/` — browser side: `tool.call.toolview` keyed `read_image` registration +
  preview component (custom-drawn card and lightbox, zero DSH runtime dependencies,
  theme via `--dsw-alias-*`);
- `src/index.ts` — minimal host entry (no host logic, only a package body for the
  loader);
- `scripts/build.mjs` — build (tsdown client bundle + tsc host + verify + tests).

## Build & test

```powershell
cd plugins\dsh-read-image-preview-xg
npm run build   # tsdown bundle + tsc + verify + node --test
npm test        # unit tests only (build first)
```

## Deployment

After building, copy the plugin directory to the DSH web profile and restart:

```powershell
Copy-Item -Recurse plugins\dsh-read-image-preview-xg `
  $HOME\.dsh\profiles\web\node_modules\dsh-read-image-preview-xg
# Restart DSH to apply (client-modules scans the dsh.client declaration and injects the browser bundle)
```

## Key mechanisms

- `tool.call.toolview` is an open keyed slot: it claims rendering by wire tool name;
  `read_image` was previously unclaimed (fell through to the generic card); registering
  takes it over without affecting other tools;
- The component receives the session-authorized loader via the registered `inject` hook
  `useLoadImage` (under the hood `ctx.uiConversation.imageUrl(sessionId,
  attachment)`), where `sessionId` comes from the standard props of the
  session-scoped slot;
- The client bundle is pure browser code: it imports no DSH host packages (types are a
  local structural subset), with `react` externalized via the platform module table.

## Version history

- 0.1.0 first release: inline thumbnail + lightbox preview for the `read_image` card.
