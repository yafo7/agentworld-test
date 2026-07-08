# Chii Island Studio Sync Reference

## Runtime Rule

Chii Island should only consume local runtime assets in `agentworld-test/public/generated/` during normal gameplay.

Voxel Studio may contain many generated assets. The sync script intentionally uses an allowlist so unrelated Studio experiments do not enter the island project.

## Studio Endpoints

Preferred:

```text
GET  /api/assets/:assetId/runtime
GET  /api/assets/:assetId/edit
POST /api/assets/:assetId/publish
```

Legacy fallback:

```text
GET /api/load-edited/:commit/:folder
GET /api/model/:commit/:folder
GET /api/animations/:commit/:folder
```

## Important Distinction

`/api/model/:commit/:folder` returns the original legacy JSON. It does not include manual Studio edits.

For edited data, use `/api/assets/:assetId/edit` or `/api/assets/:assetId/runtime`.
