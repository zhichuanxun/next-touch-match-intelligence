# Next Touch

An English football analysis desk that connects the ball, off-ball movement, tactical choices and player evidence to one replay clock.

## Review without installing developer tools

Download the matching **portable ZIP** from [Review downloads](https://github.com/zhichuanxun/next-touch-match-intelligence/releases/latest). Extract the entire folder, then double-click **Start Next Touch**. A browser opens automatically. Keep the launcher window open during review; close it to stop.

| Computer | Download |
| --- | --- |
| Windows, Intel / AMD 64-bit | `Next-Touch-windows-x64.zip` |
| Mac with Apple Silicon (M1 or later) | `Next-Touch-mac-apple-silicon.zip` |
| Mac with Intel processor | `Next-Touch-mac-intel.zip` |
| Linux, Intel / AMD 64-bit | `Next-Touch-linux-x64.zip` |

The runtime and synthetic fixture are included. No Node.js installation, account, API key or internet connection is required for the replay and evidence analysis. These are portable archives, not signed installers; operating-system or organizational security policies may require approval. The Mac Apple Silicon package is locally smoke-tested; other platform packages contain official checksum-verified runtimes but have not been executed on their target operating systems.

**Optional Agent:** chat and proactive model feedback are off until a model service is configured. To enable them in the portable build, copy `agent.env.example` to `.env` beside the launcher, enter your deployment and credentials, then restart. Core match analysis works without a model. No credentials or model weights are included; Azure hosting/inference remain unverified.

**[Complete running guide](docs/RUNNING.md)** — portable app, npm, source build, Docker, local app with Azure inference, and **[Azure App Service deployment](deploy/README.md)**.

See `READ ME FIRST.txt` inside each archive for a three-minute review path. Developers can reproduce these packages with `python3 scripts/package-review.py` (Python 3.12+, Node 22+, and network access at build time). Runtime licenses and archive checksums are included.

## Run locally

Requires Node.js 22 or later. There are no runtime npm dependencies.

```sh
npm start
```

Open http://127.0.0.1:3000. Press Play to receive tracking and event packets. The timeline permits review of received data; it does not load future match totals at startup.

```sh
npm test          # Model, streaming, source and server regression tests
npm run data     # Reproduce the bundled synthetic fixture (seed 7)
npm run build    # Package the runnable server in dist/
```

The app requires its Node server. Hosting `web/` alone will not provide the streaming API or agent.

## Explore

- **On ball:** current carrier, opponent arrival and a selected receiving route.
- **Off ball:** measured trails and two-second motion projections.
- **Defence:** opponent concentration over a fixed-color arrival-time surface.
- **Compare choices:** forward pass, wide switch, recycle and carry, including progress, support, cover and interception margin.
- **Two-pass projection:** candidate combinations computed from the current geometry; observed passing sequences are displayed separately.
- **Players:** select either team's player or a point on the overview chart to link workload, involvement, losses, duels and event references.
- **Agent:** cite a player and timestamp, ask a question, or enable proactive feedback. Evidence rules work without a language model. Optional model responses use server-recomputed evidence from the cited time.
- **Scenario validation:** open `/coach-validation.html` for seven explicit acceptance fixtures, including a low block, high press, counterattack, red card and tracking gaps.

## Data and estimates

The bundled ten-minute fixture contains 22 fictional players at 5 Hz. A seeded behaviour simulation generates positions, passing and possession outcomes. It exports coordinates and completed event observations, not tactical prediction scores. The downstream analysis computes pressure, arrival surfaces and candidate routes from current coordinates and past velocity.

Frames arrive through bounded NDJSON windows. A pass result becomes visible only after completion. Statistics and reports exclude events after the cited time. Colors are attached to teams and cannot flip merely because possession changes.

Arrival estimates use shared assumptions: 0.6-second reaction, 6.5 m/s running speed and 15 m/s ground-ball speed. Passing margin is the minimum opponent arrival time minus ball arrival time along the route. It is **not a calibrated completion probability**. Density measures nearby player concentration, not defensive ability. Movement load and lost possessions are evidence to review, not diagnoses of fatigue or injury.

The fixture is a development simulation, not a validated reproduction of professional football. Its ten-minute sample includes completed passes, regains, possession losses and ground duels. The schema and UI also support shots, cards, fouls and restarts; this sample does not exercise all of those events. No real Premier League or Metrica match data is included.

## Optional language model

Copy `.env.example` to `.env`, select a provider and supply your own server-side credentials. No keys are included in this repository or sent to the browser.

- `ollama`: uses installed models at `127.0.0.1:11434`.
- `compatible`: uses a server-configured HTTPS chat-completions endpoint (`AGENT_CHAT_ENDPOINT`, `AGENT_MODEL`, `AGENT_API_KEY`). Model identifiers and credentials remain on the server; the UI presents this capability as Agent.
- `azure`: uses an actual Azure OpenAI deployment, with `ENABLE_LIVE_AI=true`.

Cloud model requests send the cited synthetic match evidence and question. Limits default to 16 calls per server process and 900 output tokens. Restarting the process resets the counter; it is not a billing cap. There is no automatic switch to another provider on failure.

**Azure status:** the adapter and container packaging are implemented. A real Azure deployment has not yet been verified. Placeholder environment values do not establish Azure hosting or inference. Competition materials must retain this distinction until a successful deployment test is recorded.

## Container

```sh
docker build -t next-touch .
docker run --rm -p 3000:3000 --env-file .env next-touch
```

The container exposes the Node app on port 3000. Deployment to a public cloud requires an actual subscription and an operator-approved resource configuration.

## Implementation

- `web/real-match.js`: causal observations, metrics and snapshot analysis.
- `web/coaching.js`: quality gates, choice comparison and ten-second review.
- `web/tactical-reading.js`: defensive density, width and transition hypotheses.
- `lib/replay-stream.mjs`: incremental observation delivery.
- `lib/match-evidence.mjs`: trusted evidence packets for model requests.
- `match-agent.mjs`: provider adapters, limits and response checks.
- `scripts/generate-synthetic.mjs`: reproducible source fixture.

The simplified arrival-time approach is informed by public football tracking analysis, including [Friends of Tracking](https://github.com/Friends-of-Tracking-Data-FoTD/LaurieOnTracking). It is an independent heuristic implementation and is not a calibrated implementation of a published pitch-control model.
