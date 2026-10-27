# Azure deployment

The Bicep template creates a Linux App Service on the **F1 Free** plan. It does not create paid monitoring, storage, a database, or an AI deployment. Free-plan availability depends on the subscription and region. If F1 is unavailable, stop and choose another supported region; do not silently upgrade to a paid plan.

Run from the repository root with Azure CLI installed and signed in:

```sh
az group create --name next-touch-demo --location westus3
az deployment group create \
  --resource-group next-touch-demo \
  --template-file deploy/azure.bicep \
  --parameters appName=YOUR-GLOBALLY-UNIQUE-APP-NAME

# Only committed source enters the deployment archive; local credentials do not.
git archive --format=zip --output=next-touch.zip HEAD
az webapp deploy --resource-group next-touch-demo \
  --name YOUR-GLOBALLY-UNIQUE-APP-NAME \
  --src-path next-touch.zip --type zip
```

The startup command runs the Node server directly. It has no runtime npm dependencies. The server binds to `0.0.0.0` and uses the port supplied by App Service. HTTPS is required; FTP and basic publishing authentication are disabled. Deployment uses the signed-in Azure CLI identity.

The F1 plan has limited daily CPU and may cold-start. It is suitable for a small demonstration, not a production service or an uptime commitment.

## Agent configuration

The initial deployment leaves cloud inference disabled. The tactical models, replay and evidence rules run without an external model.

To enable Azure model responses, configure an actual Azure OpenAI deployment using the server settings documented in [the running guide](../docs/RUNNING.md#enable-agent-using-azure-while-running-the-app-locally). Keep credentials in App Service configuration, never in source control or client code. Model inference has separate pricing and quota; F1 does not provide free model tokens. Obtain spending approval before creating billable inference capacity.

`MATCH_AI_MAX_CALLS` limits calls per server process, not total subscription spending. Do not rely on it as a billing cap. Restrict access to a paid inference demo as appropriate before enabling it for external visitors.

## Verify and record

1. Confirm the deployed App Service plan reports SKU `F1` and the app reports `Running`.
2. Check `/api/health`, `/api/replay/meta`, a bounded `/api/replay/stream` window, and the rendered dashboard.
3. If Azure inference is enabled, submit a cited match question through `/api/match-agent/ask` and retain a redacted response with its timestamp and request ID.
4. Record hosting and inference verification separately. A configured endpoint or successful hosting deployment alone does not establish a successful Azure model response.

Never publish resource keys, access tokens, or deployment output containing secrets.

## Configure the hosted Agent

In Azure Portal, open the web app → Settings → Environment variables (App settings). Add `MATCH_AI_PROVIDER=azure`, `ENABLE_LIVE_AI=true`, the real `AZURE_OPENAI_ENDPOINT`, `AZURE_OPENAI_DEPLOYMENT`, and `AZURE_OPENAI_API_KEY` (or authorized `AZURE_OPENAI_ACCESS_TOKEN`). Apply and restart the app. Do not place `.env` in your ZIP. App settings are server-side; use Key Vault references where required by your organization.

Use an actual v1 Chat Completions-compatible deployment. App Service hosting and Azure model inference are separate resources. App hosting on F1 does not create a model, provide model quota, or make model calls free. Verify configuration through the Agent panel and then send a question to verify inference.

If creating resources is blocked by subscription policy, use the portable/source application locally with an existing authorized Azure model instead. Neither route requires changing the analysis code. The supplied deployment template has been compiled but not successfully deployed in the entrant's subscription.

References: [Microsoft Node.js App Service guide](https://learn.microsoft.com/en-us/azure/app-service/quickstart-nodejs) and [Node runtime configuration](https://learn.microsoft.com/en-us/azure/app-service/configure-language-nodejs).
