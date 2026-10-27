/** Server-side, evidence-bounded two-stage Azure model workflow. No SDK required. */
export class NarrationError extends Error {
  constructor(code, message, status = 502) {
    super(message); this.name = 'NarrationError'; this.code = code; this.status = status;
  }
}

const ENUMS = {
  risk: ['balanced', 'protect', 'progress'],
  lens: ['casual', 'analyst', 'player'],
  language: ['en', 'zh'],
};

export function normalizeRequest(input, knownScenarioIds = []) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new NarrationError('INVALID_REQUEST', 'Send a JSON object.', 400);
  }
  const allowed = new Set(['scenarioId', 'seed', 'matchSeed', 'eventId', 'risk', 'lens', 'language', 'trials', 'selectedOptionId']);
  if (Object.keys(input).some(key => !allowed.has(key))) {
    throw new NarrationError('INVALID_REQUEST', 'The request contains unsupported fields.', 400);
  }
  const fromMatch = input.matchSeed !== undefined || input.eventId !== undefined;
  if (fromMatch) {
    if (input.scenarioId !== undefined || input.seed !== undefined) {
      throw new NarrationError('INVALID_REQUEST', 'Use a match event or a scenario, not both.', 400);
    }
    if (!Number.isInteger(input.matchSeed) || input.matchSeed < 0 || input.matchSeed > 0xffffffff) {
      throw new NarrationError('INVALID_SEED', 'Match seed must be an unsigned integer.', 400);
    }
    if (typeof input.eventId !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9_.:-]{0,95}$/.test(input.eventId)) {
      throw new NarrationError('INVALID_EVENT', 'Select an event from the generated match.', 400);
    }
  } else if (typeof input.scenarioId !== 'string' || !knownScenarioIds.includes(input.scenarioId)) {
    throw new NarrationError('INVALID_SCENARIO', 'Select a known scenario.', 400);
  }
  const normalized = {
    inputKind: fromMatch ? 'match' : 'scenario',
    ...(fromMatch ? { matchSeed: input.matchSeed, eventId: input.eventId } : { scenarioId: input.scenarioId }),
    seed: fromMatch ? input.matchSeed : input.seed ?? 42,
    risk: input.risk ?? 'balanced',
    lens: input.lens === 'fan' ? 'casual' : input.lens ?? 'analyst',
    language: input.language ?? 'en',
    trials: input.trials ?? 320,
    selectedOptionId: input.selectedOptionId ?? null,
  };
  if (!Number.isInteger(normalized.seed) || normalized.seed < 0 || normalized.seed > 0xffffffff) {
    throw new NarrationError('INVALID_SEED', 'Seed must be an unsigned integer.', 400);
  }
  if (!Number.isInteger(normalized.trials) || normalized.trials < 32 || normalized.trials > 1024) {
    throw new NarrationError('INVALID_TRIALS', 'Trials must be an integer between 32 and 1024.', 400);
  }
  for (const [field, values] of Object.entries(ENUMS)) {
    if (!values.includes(normalized[field])) {
      throw new NarrationError('INVALID_REQUEST', `Unsupported ${field}.`, 400);
    }
  }
  if (normalized.selectedOptionId !== null &&
      (typeof normalized.selectedOptionId !== 'string' || !/^[a-zA-Z0-9_-]{1,64}$/.test(normalized.selectedOptionId))) {
    throw new NarrationError('INVALID_OPTION', 'Select a known candidate option.', 400);
  }
  return normalized;
}

/** Only pre-decision information is allowed into model context. */
export function buildEvidencePacket(scenario, analysis, request) {
  const focusOptionId = request.selectedOptionId ?? analysis.bestOptionId;
  if (!analysis.options.some(option => option.id === focusOptionId)) {
    throw new NarrationError('INVALID_OPTION', 'The selected option is not part of this scenario.', 400);
  }
  return {
    scope: 'Illustrative synthetic ground-pass decision model, not validated real-football analytics.',
    modelId: analysis.modelId,
    snapshotId: scenario.evidenceId,
    scenarioId: scenario.id,
    focusOptionId,
    recommendedOptionId: analysis.bestOptionId,
    objective: request.risk,
    audience: request.lens,
    language: request.language,
    trials: analysis.trials,
    possessionPlayerId: scenario.possessionPlayerId,
    players: scenario.players.map(({ id, name, team, x, y, vx, vy }) => ({ id, name, team, x, y, vx, vy })),
    options: analysis.options.map(option => ({
      id: option.id, label: option.label[request.language], receiverName: option.receiverName,
      targetPlayerId: option.targetPlayerId, rank: option.rank,
      distance: option.distance, completion: option.completion, completionCI: option.completionCI,
      successfulTrials: option.successfulTrials, trials: option.trials,
      expectedUtility: option.expectedUtility, utilityCI: option.utilityCI,
      territoryGain: option.territoryGain, turnoverCost: option.turnoverCost,
      receiverSpace: option.receiverSpace, laneClearance: option.laneClearance,
      evidenceIds: option.evidenceIds,
    })),
    evidence: analysis.evidence,
    assumptions: analysis.assumptions,
    limitations: analysis.limitations,
    // Deliberately absent: actualChoiceId, actualOutcome, result events, regret,
    // and the paired comparison whose comparison target can reveal the choice.
  };
}

const cueSchema = {
  type: 'object', additionalProperties: false,
  properties: {
    kind: { type: 'string', enum: ['option', 'player', 'text'] },
    targetId: { type: 'string' }, label: { type: 'string' },
  },
  required: ['kind', 'targetId', 'label'],
};

const narrativeProperties = {
  headline: { type: 'string' }, explanation: { type: 'string' },
  focusOptionId: { type: 'string' }, recommendedOptionId: { type: 'string' },
  evidenceIds: { type: 'array', items: { type: 'string' } },
  cues: { type: 'array', items: cueSchema },
};

export function narrativeSchema(editor = false) {
  const properties = editor
    ? { approved: { type: 'boolean' }, reason: { type: 'string' }, ...narrativeProperties }
    : { ...narrativeProperties };
  return { type: 'object', additionalProperties: false, properties, required: Object.keys(properties) };
}

function finiteNumberVariants(value) {
  if (!Number.isFinite(value)) return [];
  return [String(value), ...[0, 1, 2, 3].map(digits => String(Number(value.toFixed(digits))))];
}

function assertNumericGrounding(text, evidenceIds, packet) {
  const numbers = new Set(finiteNumberVariants(packet.trials));
  const percentages = new Set();
  for (const evidence of packet.evidence.filter(item => evidenceIds.includes(item.id))) {
    finiteNumberVariants(evidence.value).forEach(value => numbers.add(value));
    if (evidence.unit === 'fraction') {
      finiteNumberVariants(evidence.value * 100).forEach(value => percentages.add(value));
    }
    const option = packet.options.find(item => item.id === evidence.optionId);
    if (option && evidence.metric === 'completion') {
      finiteNumberVariants(option.successfulTrials).forEach(value => numbers.add(value));
      finiteNumberVariants(option.completion).forEach(value => numbers.add(value));
      finiteNumberVariants(option.completion * 100).forEach(value => percentages.add(value));
    }
    if (option && Number.isFinite(option[evidence.metric])) {
      finiteNumberVariants(option[evidence.metric]).forEach(value => numbers.add(value));
    }
  }
  const tokens = text.match(/[-+]?\d+(?:\.\d+)?(?:%|％)?/gu) || [];
  for (const token of tokens) {
    const percent = /[%％]$/.test(token);
    const normalized = String(Number(token.replace(/[%％]/g, '')));
    if (!(percent ? percentages : numbers).has(normalized)) {
      throw new NarrationError('UNSUPPORTED_NUMBER', 'The generated explanation contains a number that is not grounded in its cited evidence.', 422);
    }
  }
}

/** Mechanical checks complement, rather than replace, the editor's entailment check. */
export function validateNarration(value, packet, { editor = false } = {}) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new NarrationError('INVALID_MODEL_OUTPUT', 'The model did not return a supported explanation.', 422);
  }
  const keys = Object.keys(narrativeSchema(editor).properties);
  if (Object.keys(value).some(key => !keys.includes(key)) || keys.some(key => !(key in value))) {
    throw new NarrationError('INVALID_MODEL_OUTPUT', 'The model response does not match the explanation schema.', 422);
  }
  if (editor && typeof value.approved !== 'boolean') {
    throw new NarrationError('INVALID_MODEL_OUTPUT', 'The editor response is invalid.', 422);
  }
  if (editor && !value.approved) {
    throw new NarrationError('EDITOR_REFUSED', 'The evidence editor could not support a reliable explanation. The local evidence remains available.', 422);
  }
  for (const field of ['headline', 'explanation', ...(editor ? ['reason'] : [])]) {
    if (typeof value[field] !== 'string' || !value[field].trim() || value[field].length > (field === 'headline' ? 160 : 2400)) {
      throw new NarrationError('INVALID_MODEL_OUTPUT', 'The model response contains invalid text.', 422);
    }
  }
  if (value.focusOptionId !== packet.focusOptionId || value.recommendedOptionId !== packet.recommendedOptionId) {
    throw new NarrationError('UNSUPPORTED_RECOMMENDATION', 'The generated recommendation does not match the computed evidence.', 422);
  }
  const knownEvidence = new Set(packet.evidence.map(item => item.id));
  if (!Array.isArray(value.evidenceIds) || value.evidenceIds.length < 1 || value.evidenceIds.length > 16 ||
      value.evidenceIds.some(id => typeof id !== 'string' || !knownEvidence.has(id))) {
    throw new NarrationError('UNSUPPORTED_REFERENCE', 'The model cited evidence that is not present in this snapshot.', 422);
  }
  const focus = packet.options.find(option => option.id === packet.focusOptionId);
  if (!value.evidenceIds.some(id => focus.evidenceIds.includes(id))) {
    throw new NarrationError('UNSUPPORTED_REFERENCE', 'The model did not cite the inspected option.', 422);
  }
  if (!Array.isArray(value.cues) || value.cues.length > 5) {
    throw new NarrationError('INVALID_MODEL_OUTPUT', 'The model returned invalid drawing cues.', 422);
  }
  for (const cue of value.cues) {
    if (!cue || typeof cue !== 'object' || Object.keys(cue).sort().join(',') !== 'kind,label,targetId' ||
        typeof cue.label !== 'string' || !cue.label.trim() || cue.label.length > 120) {
      throw new NarrationError('INVALID_CUE', 'The generated overlay is not supported.', 422);
    }
    const valid = cue.kind === 'option' ? packet.options.some(option => option.id === cue.targetId)
      : cue.kind === 'player' ? packet.players.some(player => player.id === cue.targetId)
        : cue.kind === 'text' && cue.targetId === 'summary';
    if (!valid) throw new NarrationError('INVALID_CUE', 'The model referred to a player or option outside the snapshot.', 422);
    assertNumericGrounding(cue.label, value.evidenceIds, packet);
  }
  assertNumericGrounding(`${value.headline}\n${value.explanation}`, value.evidenceIds, packet);
  return value;
}

const SYSTEM_BASE = `You explain a fictional football decision from authoritative server-computed evidence.
All estimates describe a deliberately simplified, conditional simulation. They are not calibrated real-world pass probabilities, xT, xG, player ability, fatigue, intent, or optimal coaching decisions.
You may explain only listed candidate ground passes, under the declared objective and assumptions. Do not infer actual outcomes, future events, medical facts, unseen runs, or missing alternatives. Do not treat a high simulation score as universal superiority.
Use the requested language and audience. Casual: brief plain language. Analyst: explain the risk/reward and conditional model. Player: focus on the inspected receiver/route using names.
Return concise text and at most three useful drawing cues. Cue kind option uses a listed option id; player uses a listed player id; text uses targetId summary. Never generate HTML or code.
focusOptionId and recommendedOptionId must exactly match the input. Cite evidence ids supporting the inspected option and any comparison. The evidenceIds array is the only place for evidence-id strings.
Prefer qualitative explanation because exact metrics are already displayed by the UI. If using Arabic numeric literals, every number must be in the cited metric evidence (rounded at most three decimals); completion fractions may be shown as percentages. Do not write jersey numbers, clock times, confidence intervals, version numbers or counts not backed by cited evidence. Use names. Every textual comparison must follow the metric values. Do not invent uncertainty bounds.
Keep the headline under ninety characters and explanation under nine hundred characters.`;

function safeUsage(usage) {
  const valid = value => Number.isFinite(value) && value >= 0 ? value : null;
  return {
    inputTokens: valid(usage?.prompt_tokens ?? usage?.input_tokens),
    outputTokens: valid(usage?.completion_tokens ?? usage?.output_tokens),
    totalTokens: valid(usage?.total_tokens),
  };
}

/** Token support is intended for short-lived developer verification, not refresh. */
export function azureHeaders(config) {
  const credentials = config.accessToken
    ? { Authorization: `Bearer ${config.accessToken}` }
    : { 'api-key': config.apiKey };
  return { 'Content-Type': 'application/json', ...credentials };
}

export function createNarrator({ config, fetchImpl = globalThis.fetch, beforeCall = () => {}, now = () => Date.now() }) {
  const timeoutMs = config.timeoutMs ?? 20000;
  const provider = config.provider ?? 'azure-foundry';
  const providerLabel = provider === 'local-fixture' ? 'The local provider fixture' : 'Azure';
  async function callStage(stage, messages, editor) {
    beforeCall();
    const began = now();
    let response;
    try {
      response = await fetchImpl(config.url, {
        method: 'POST',
        headers: azureHeaders(config),
        body: JSON.stringify({
          model: config.deployment,
          messages,
          max_completion_tokens: config.maxCompletionTokens,
          response_format: { type: 'json_schema', json_schema: { name: editor ? 'checked_decision' : 'proposed_decision', strict: true, schema: narrativeSchema(editor) } },
        }),
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (error) {
      const timeout = ['AbortError', 'TimeoutError'].includes(error?.name);
      throw new NarrationError(timeout ? 'UPSTREAM_TIMEOUT' : 'UPSTREAM_UNAVAILABLE', timeout ? `${providerLabel} did not respond before the request deadline.` : `${providerLabel} could not be reached.`, 503);
    }
    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
        throw new NarrationError('UPSTREAM_AUTH', `${providerLabel} rejected the server credentials or resource permissions.`, 503);
      }
      if (response.status === 429) throw new NarrationError('UPSTREAM_QUOTA', `${providerLabel} is rate-limiting this deployment. Try again later.`, 503);
      throw new NarrationError('UPSTREAM_REJECTED', `${providerLabel} rejected the model request. Check the deployment and supported response format.`, 502);
    }
    let envelope;
    try {
      const raw = await response.text();
      if (raw.length > 100000) throw new Error('oversized');
      envelope = JSON.parse(raw);
    } catch {
      throw new NarrationError('INVALID_UPSTREAM_RESPONSE', `${providerLabel} returned an unreadable response.`, 502);
    }
    const choice = envelope.choices?.[0];
    if (choice?.message?.refusal) throw new NarrationError('MODEL_REFUSAL', 'The model declined to generate this explanation.', 422);
    if (choice?.finish_reason !== 'stop' || typeof choice?.message?.content !== 'string') {
      throw new NarrationError('INCOMPLETE_MODEL_OUTPUT', 'The model response was incomplete. No generated explanation was published.', 422);
    }
    let content;
    try { content = JSON.parse(choice.message.content); }
    catch { throw new NarrationError('INVALID_MODEL_OUTPUT', 'The model did not return a structured explanation.', 422); }
    return { content, usage: safeUsage(envelope.usage), trace: { stage, status: 'completed', provider, durationMs: Math.max(0, now() - began) } };
  }

  return async function narrate(packet) {
    const analyst = await callStage('analyst', [
      { role: 'system', content: SYSTEM_BASE },
      { role: 'user', content: JSON.stringify(packet) },
    ], false);
    validateNarration(analyst.content, packet);
    const editor = await callStage('skeptical-editor', [
      { role: 'system', content: `${SYSTEM_BASE}\nYou are the independent skeptical editor. Compare every factual and comparative assertion in the proposed narration against the evidence. Correct unsupported claims and preserve only supported text. Reject if no reliable explanation can be produced. Do not merely endorse the analyst. Return approved, a short reason, and the fully checked narrative and cues.` },
      { role: 'user', content: JSON.stringify({ evidence: packet, proposed: analyst.content }) },
    ], true);
    const checked = validateNarration(editor.content, packet, { editor: true });
    const sum = field => analyst.usage[field] === null || editor.usage[field] === null ? null : analyst.usage[field] + editor.usage[field];
    const caveat = (provider === 'local-fixture' ? packet.language === 'zh' ? 'This is a local contract-test fixture, No language model or Azure. ' : 'This is a local contract fixture. No language model or Azure service was called. ' : '') + (packet.language === 'zh'
      ? 'This explanation applies only to this synthetic scenario, candidate passes and model assumptions, Not a real-match prediction. '
      : 'This explanation applies only to the synthetic snapshot, candidate passes and declared model assumptions; it is not a real-match prediction.');
    return {
      headline: checked.headline, explanation: checked.explanation,
      evidenceIds: [...new Set(checked.evidenceIds)], cues: checked.cues,
      focusOptionId: checked.focusOptionId, recommendedOptionId: checked.recommendedOptionId,
      source: provider, caveat, limitations: packet.limitations,
      workflow: 'custom-two-stage-rest',
      trace: [analyst.trace, editor.trace, { stage: 'reference-and-number-guards', status: 'passed', provider: 'deterministic-code' }],
      usage: { inputTokens: sum('inputTokens'), outputTokens: sum('outputTokens'), totalTokens: sum('totalTokens'), upstreamCalls: 2 },
      evidence: packet.evidence.filter(item => checked.evidenceIds.includes(item.id)),
    };
  };
}
