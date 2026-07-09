# dropshipper-ui

A small Go-served web UI for the Dropshipper `/gossip` API.

The UI mirrors the data exposed by `dropshipper`: nodes contain repository status history, and repository statuses contain task results. For each node, the UI shows only the newest entry for each repository, execution status, and commit SHA combination.

## Features

- Single-page UI served by a compact Go HTTP server
- Configurable Dropshipper API base URL via `API_BASE_URL` and browser storage
- Optional `/proxy/gossip` endpoint for avoiding CORS issues
- Manual refresh and optional auto refresh
- Manual delete-and-re-sync trigger for all configured Dropshipper repos
- Node, repository, execution status, commit, attempt, version, error, and task output display
- Optional node merging by node ID, hostname, node URL, or node URL host
- Supports the Dropshipper wire field `TaskStatues`, plus `TaskStatuses` as a tolerant fallback

## Quick Start

Prerequisite: Go 1.22+

```bash
API_BASE_URL=http://localhost:25566 PORT=8080 go run .
```

Open `http://localhost:8080`.

## Configuration

- `API_BASE_URL`: default Dropshipper API base URL. Defaults to `http://localhost:25566`.
- `PORT`: UI server port. Defaults to `8080`.

Browser settings are persisted in `localStorage`:

- Base API URL
- Use proxy
- Merge matching nodes
- Auto refresh interval

## Endpoints

- `/`: serves the UI
- `/web/*`: serves frontend assets
- `/assets/*`: serves image assets
- `/config`: returns `{ "baseApiUrl": "...", "version": "..." }`
- `/proxy/gossip?base={BASE_URL}`: proxies `{BASE_URL}/gossip`
- `POST /proxy/resync?base={BASE_URL}`: proxies `{BASE_URL}/resync`

## Data Handling

When enabled, the `Merge matching nodes` option merges node entries before repository statuses are filtered. Nodes are merged when they share a non-unknown node ID, hostname, normalized node URL, or URL host. This helps collapse duplicate gossip entries that describe the same machine under different IDs or URLs.

Dropshipper appends repository status history over time. To keep the UI focused, repository rows are deduplicated per rendered node by this key:

```text
Repository.Name + ExecutionStatus + Sha1
```

When multiple rows share that key, only the row with the latest `Time` is shown.

## Project Structure

```text
main.go              Go HTTP server and gossip proxy
pkg/version          Version constant
web/index.html       Page shell
web/app.js           Fetching, deduping, and rendering
web/styles.css       UI styles
assets/              Logo images
```
