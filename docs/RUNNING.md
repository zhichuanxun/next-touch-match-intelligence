# Run Next Touch

Choose a route. The same synthetic fixture and analysis code are used by all routes.

| Route | Requirements | Start |
| --- | --- | --- |
| Portable review | Supported Windows, macOS or Linux computer | Extract the release ZIP and open Start Next Touch |
| Source | Node.js 22+ and optional Git | `npm start` |
| Built source package | Node.js 22+ | `npm run build`, then `node dist/server.mjs` |
| Container | Docker | Build and run the included Dockerfile |
| Azure-hosted app | Azure subscription and deployment permissions | Follow [Azure deployment](../deploy/README.md) |

## Portable review

Download from [Releases](https://github.com/zhichuanxun/next-touch-match-intelligence/releases/latest). Extract the whole ZIP before launching. No installation of Node.js, npm or Docker is required. The local server opens the browser on a free port and is only accessible on your computer. Keep its window open during review; close it to stop. If automatic browser opening fails, copy the displayed address into your browser.

The software is not a signed installer. Organizational device policies may block downloaded programs; do not disable device security. Choose an approved source/container environment or contact the entrant through the submission page for assistance.

To enable Agent, copy `agent.env.example` to `.env` beside the launcher, edit it using the Azure settings below, then close and restart the launcher. Ensure Windows has not named the file `.env.txt`. On macOS, hidden files can be shown with Command-Shift-period. The portable launcher reads this file only; it ignores credentials inherited from the host shell.

## Run from source

```sh
git clone https://github.com/zhichuanxun/next-touch-match-intelligence.git
cd next-touch-match-intelligence
npm start
```

Open http://127.0.0.1:3000. There are no runtime npm dependencies: `npm install` is not required. The fixture is bundled; no dataset download is required. Stop with Ctrl-C. If port 3000 is occupied, use `npm start -- --port 3001`.

```sh
npm test        # Analysis, streaming, server and Agent configuration checks
npm run data   # Regenerate the seeded synthetic fixture
npm run build  # Copy the runnable server and web assets into dist/
node dist/server.mjs
```

This is JavaScript; no native compilation or frontend bundler is required. To load model settings when starting the built package, use `node --env-file=.env dist/server.mjs` from the repository root. Do not host only `web/`: the replay needs its server API.

To reproduce portable archives, run `python3 scripts/package-review.py` with Python 3.12+, Node.js 22+ and build-time internet access. It downloads official Node runtimes, checks SHA-256 hashes and bundles licenses. No credentials are included.

## Enable Agent using Azure while running the app locally

Azure hosting is not required for this route. You need an existing Azure OpenAI resource with a deployed model supporting the **v1 Chat Completions** endpoint, its deployment name, and a valid API key or Entra access token with inference permission. A resource URL alone is not a model deployment. Model access, region, quotas and charges depend on your subscription.

Copy `.env.example` to `.env` in the source repository (portable: copy `agent.env.example` beside the launcher). Set:

```dotenv
MATCH_AI_PROVIDER=azure
AZURE_OPENAI_ENDPOINT=https://YOUR-RESOURCE.openai.azure.com
AZURE_OPENAI_DEPLOYMENT=YOUR-ACTUAL-DEPLOYMENT-NAME
AZURE_OPENAI_API_KEY=YOUR-PRIVATE-KEY
AZURE_OPENAI_ACCESS_TOKEN=
ENABLE_LIVE_AI=true
MATCH_AI_MAX_CALLS=16
MATCH_AI_MAX_TOKENS=900
```

The deployment name is the name chosen when deploying the model, not necessarily its model-family name. The adapter calls `/openai/v1/chat/completions`. Supported resource hosts end in `.openai.azure.com` or `.services.ai.azure.com`; Foundry project URLs and custom proxy hosts are not accepted by this adapter.

For Entra authentication, leave the API key empty and set `AZURE_OPENAI_ACCESS_TOKEN` to an authorized token for Azure Cognitive Services. Tokens expire and this app does not refresh them automatically. Never put credentials in a URL, browser form, screenshot, public repository or release archive.

Restart the app, then use **Check configuration** in the Agent panel. The panel unlocks when the server recognizes a complete enabled configuration. This is not an authentication test: send a cited question to verify actual inference. A 401/403 indicates authentication/permissions; 404 usually indicates an endpoint or deployment mismatch; 429 indicates quota or rate limits. Failed model calls do not prevent match playback.

Agent is off by default. Questions, automatic model feedback and model reviews are unavailable until configured. Match statistics, tactical estimates, player analysis and timeline replay continue to work. The model receives the question and server-generated synthetic evidence for the cited time; no future observations are supplied.

## Other model options

- **Local Ollama:** install and start Ollama, download a model yourself, set `MATCH_AI_PROVIDER=ollama` and optionally `AGENT_MODEL` to the exact installed model name. The server connects to `127.0.0.1:11434`. No cloud key is needed, but a running model and sufficient hardware are required. Model weights are not bundled. From a Docker container, localhost refers to the container, not the host.
- **Compatible endpoint:** set `MATCH_AI_PROVIDER=compatible`, `AGENT_CHAT_ENDPOINT` to the full HTTPS chat-completions URL, `AGENT_MODEL` and `AGENT_API_KEY`. This does not constitute Azure deployment. Keep `AGENT_REQUEST_OPTIONS={}` unless your provider requires additional options.
- **Disable:** set `MATCH_AI_PROVIDER=disabled` and restart.

## Container

```sh
docker build -t next-touch .
docker run --rm -p 127.0.0.1:3000:3000 next-touch
# Optional configured Agent:
docker run --rm -p 127.0.0.1:3000:3000 --env-file .env next-touch
```

In the optional command, omit HOST and PORT from `.env`, or set `HOST=0.0.0.0` and `PORT=3000` so the container can receive published-port traffic. Open http://127.0.0.1:3000.

## Review and verify

1. Press Play. Observations arrive progressively rather than loading future totals.
2. Select a player; inspect linked pitch position, involvement and event timeline.
3. Compare passing, carrying, defensive density and movement projections.
4. Pause and revisit a received moment on the timeline.
5. Open `/coach-validation.html` at the same local address for seven tactical/data-quality fixtures.
6. Optional: configure Agent, ask about the selected player at a cited time, and inspect the response. Enable proactive feedback only if desired.

Health: `/api/health`; fixture metadata: `/api/replay/meta`; bounded feed: `/api/replay/stream?after=0&until=2`; Agent configuration: `/api/match-agent/status`. A status with model alias `agent` means configuration was recognized, not that inference was verified. `azureVerified` remains false in the health response; record a real successful model request separately.

## Limits and deployment status

The ten-minute fixture has 22 fictional players at 5 Hz. Estimates are heuristic and not calibrated probabilities. No model weights or credentials are distributed. Request limits are per process and reset on restart; they are not spending caps. Configure access restrictions and provider-side quotas for internet-facing inference.

Local playback and regression tests have been verified. Azure hosting and live Azure inference have **not** been verified by the entrant. Instructions and a Bicep template are provided for reproducibility; they are not evidence of an existing deployment.

References: [App Service Node quickstart](https://learn.microsoft.com/en-us/azure/app-service/quickstart-nodejs), [Node configuration](https://learn.microsoft.com/en-us/azure/app-service/configure-language-nodejs), [Azure OpenAI v1 reference](https://learn.microsoft.com/en-us/azure/foundry/openai/latest).
