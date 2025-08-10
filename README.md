# Dropshipper UI

A minimal single‑page web application to visualize Dropshipper cluster gossip and repository/task status. Built with Go, HTML, CSS, and vanilla JavaScript. The UI reads node status data from a `/gossip` API and presents nodes, repositories, and task outputs in a clean, modern layout using the provided logos and their colors.


## Features

- Single‑page UI served by a compact Go HTTP server
- Configurable Base API URL
  - Backend default via environment variable `API_BASE_URL` (default: `http://localhost:25566`)
  - Frontend UI control to override and persist in `localStorage`
- Optional built‑in proxy endpoint to avoid CORS when calling `/gossip`
- Manual refresh and auto‑refresh with configurable interval
- Displays per‑node badges and details, including:
  - Local node indicator
  - Fetch errors (`fetch_error`) surfaced prominently
  - Repositories with success/error/changed state
  - Tasks with status, command, and captured output
- Robust JSON handling
  - Supports both `TaskStatues` (misspelling) and `TaskStatuses` fields
- Modern styling themed from the dominant colors of the included logo assets


## Quick start

Prerequisites: Go 1.22+

1) Clone and enter the repo

```
# clone your fork or this repository, then
cd dropshipper-ui
```

2) Run in development

```
# Optionally point to your Dropshipper API base (defaults to http://localhost:25566)
API_BASE_URL=http://localhost:25566 \
PORT=8080 \
go run .
```

Then open http://localhost:8080

3) Build a binary

```
go build -o dropshipper-ui
./dropshipper-ui
```


## Configuration

- Environment variables
  - `API_BASE_URL`: Default base URL of the target API that exposes the `/gossip` endpoint. Defaults to `http://localhost:25566`.
  - `PORT`: Port for the UI server. Defaults to `8080`.

- In‑app settings (persisted in the browser):
  - Base API URL: Overrides the default from `/config`.
  - Use proxy: When enabled, the UI will call `/proxy/gossip?base=…` on this server instead of calling the API directly. This helps avoid CORS issues.
  - Auto refresh + interval: Periodically polls the gossip endpoint.


## Endpoints (served by this app)

- `/` — Serves the single HTML page.
- `/web/*` — Static assets for the frontend (JS/CSS).
- `/assets/*` — Logos and images.
- `/config` — Returns JSON: `{ "baseApiUrl": "…" }` derived from `API_BASE_URL`.
- `/proxy/gossip?base={ENCODED_BASE}` — Proxies `{base}/gossip` to avoid CORS. Includes:
  - Input validation (`http/https`, non‑empty host)
  - Timeout (10s)
  - Response size limit (~25MB)


## Using the UI

1) Set “Base API URL” (e.g., `http://localhost:25566`) and click Save.
2) Toggle “Use proxy” if your API does not allow cross‑origin requests.
3) Click Refresh to load immediately, or enable Auto refresh.
4) Click on a repository’s “Tasks” summary to expand individual task results.

The UI renders:
- Node card header with node URL, last updated time, and badges (local / fetch error).
- Repositories list with success/error and changed indicators.
- Task list with status (ok/fail), command, and captured output.


## JSON shape and resiliency

This UI expects the `/gossip` endpoint to return an array of node objects similar to the examples below. Notable fields the UI handles explicitly:

- `fetch_error`: If present on a node, the UI shows a red badge and displays the error message.
- `TaskStatues` vs `TaskStatuses`: The UI supports either spelling and treats both as task status arrays.

Example (abbreviated):

```json
[
  {
    "node_url": "http://localhost:25565",
    "last_updated": "2025-08-10T13:43:18.687898751+02:00",
    "is_local": false,
    "fetch_error": "failed to fetch gossip …"
  },
  {
    "node_url": "http://localhost:25566",
    "is_local": true,
    "repositories": [
      {
        "Repository": { "Name": "uno", "ConfigPath": "dropshipper.yaml" },
        "Success": false,
        "Changed": true,
        "TaskStatues": [
          { "Task": { "Name": "install-ansible", "Command": ["bash","./scripts/install-ansible.sh"] }, "Success": false, "Output": "…" }
        ]
      }
    ]
  }
]
```


## Project structure

```
assets/                         # Logo images (used by the UI and README)
dropshipper                     # (if present) project-specific directory
main.go                         # Go HTTP server
web/index.html                  # Single page UI
web/styles.css                  # Styles
web/app.js                      # UI logic (fetching, rendering)
go.mod                          # Go module definition
```


## CORS and the proxy endpoint

- If your API does not set CORS headers to allow the UI’s origin, enable “Use proxy” in the UI. Requests will go to this app’s `/proxy/gossip`, which then fetches `{base}/gossip` server‑side.
- The proxy performs basic validation and has reasonable timeouts and response size limits to reduce abuse.


## Troubleshooting

- “Please set the Base API URL.” — Enter a valid `http://` or `https://` URL in the UI and Save.
- CORS errors when calling the API directly — Enable “Use proxy”.
- HTTP errors (e.g., 502) — Check the API is reachable at the configured base URL. The node card may display `fetch_error` with more details.


## Notes

- The UI dynamically derives its theme colors from the provided logo for a cohesive look.
- This repository only includes the UI; the `/gossip` endpoint should be provided by your Dropshipper backend.


## License

No license file is provided. If you intend to distribute or open‑source this project, consider adding a LICENSE file.
