/* ──────────────────────────────────────────────────────────────────
   The sampling model behind the temperature instrument.

   The point the instrument has to make is a trade-off, and it only
   lands if the numbers behave. Three prompts, chosen because they
   pull in opposite directions:

     maths     — exactly one right answer. Raising T eventually puts
                 real probability on wrong ones.
     language  — no right answer. A flat-ish distribution, so variety
                 is the whole value.
     poetry    — one canonical answer ("star") with a long tail of
                 more interesting ones.

   Greedy decoding always takes the argmax, so it is immune to T:
   maths stays correct forever, and poetry/language never produce
   anything but the single most likely word. That is the trade.
   ────────────────────────────────────────────────────────────────── */

export type PromptId = 'language' | 'maths' | 'poetry';

/** `factual` prompts have right answers; `open` ones are judged on variety. */
export type PromptKind = 'factual' | 'open';

export type Strategy = 'greedy' | 'top-k' | 'top-p';

export interface Candidate {
  token: string;
  logit: number;
  /** Only meaningful for `factual` prompts. */
  correct?: boolean;
}

export interface Prompt {
  id: PromptId;
  /** Engraved on the selector button. */
  label: string;
  /** Shown on the prompt screen. */
  text: string;
  kind: PromptKind;
  candidates: Candidate[];
}

/* The maths logits are tuned so the correct token holds ~94% at T=1
   but only ~56% at T=2 — a gap wide enough to see the answer become
   unreliable as the knob turns, without it being wrong at sane
   settings. The wrong answers are numerous and clustered, so their
   mass accumulates as the distribution flattens. */
const MATHS: Candidate[] = [
  { token: '2', logit: 7.0, correct: true },
  { token: 'two', logit: 2.6, correct: true },
  { token: '3', logit: 2.4 },
  { token: '11', logit: 2.2 },
  { token: '1', logit: 2.0 },
  { token: '0', logit: 1.8 },
  { token: '4', logit: 1.6 },
  { token: '10', logit: 1.4 },
  { token: '5', logit: 1.2 },
  { token: '12', logit: 1.0 },
  { token: '−1', logit: 0.8 },
  { token: '6', logit: 0.6 },
  { token: '21', logit: 0.4 },
  { token: '7', logit: 0.3 },
  { token: '9', logit: 0.1 },
];

const LANGUAGE: Candidate[] = [
  { token: 'consistency', logit: 3.0 },
  { token: 'showing', logit: 2.8 },
  { token: 'patience', logit: 2.6 },
  { token: 'practice', logit: 2.5 },
  { token: 'discipline', logit: 2.4 },
  { token: 'failing', logit: 2.3 },
  { token: 'starting', logit: 2.2 },
  { token: 'curiosity', logit: 2.1 },
  { token: 'luck', logit: 1.9 },
  { token: 'listening', logit: 1.8 },
  { token: 'repetition', logit: 1.6 },
  { token: 'compounding', logit: 1.5 },
  { token: 'boredom', logit: 1.4 },
  { token: 'saying', logit: 1.2 },
  { token: 'hunger', logit: 1.0 },
];

const POETRY: Candidate[] = [
  { token: 'star', logit: 6.5 },
  { token: 'light', logit: 2.6 },
  { token: 'spark', logit: 2.4 },
  { token: 'flame', logit: 2.2 },
  { token: 'moon', logit: 2.0 },
  { token: 'ember', logit: 1.8 },
  { token: 'bird', logit: 1.6 },
  { token: 'comet', logit: 1.5 },
  { token: 'wisp', logit: 1.4 },
  { token: 'ghost', logit: 1.2 },
  { token: 'drone', logit: 1.0 },
  { token: 'atom', logit: 0.9 },
  { token: 'moth', logit: 0.7 },
  { token: 'flare', logit: 0.5 },
  { token: 'seed', logit: 0.3 },
];

export const PROMPTS: Record<PromptId, Prompt> = {
  language: {
    id: 'language',
    label: 'Language',
    text: 'The secret to success is',
    kind: 'open',
    candidates: LANGUAGE,
  },
  maths: {
    id: 'maths',
    label: 'Maths',
    text: '1 + 1 =',
    kind: 'factual',
    candidates: MATHS,
  },
  poetry: {
    id: 'poetry',
    label: 'Poetry',
    text: 'Twinkle twinkle little',
    kind: 'open',
    candidates: POETRY,
  },
};

export const PROMPT_ORDER: PromptId[] = ['language', 'maths', 'poetry'];

export const TEMP_MIN = 0.05;
export const TEMP_MAX = 2.0;

export interface ScoredToken {
  token: string;
  probability: number;
  kept: boolean;
  correct: boolean;
}

export interface DistributionResult {
  scored: ScoredToken[];
  keptCount: number;
  topProbability: number;
  entropyBits: number;
  discardedMassPct: number;
  cutoffCumulative: number | null;
  /**
   * 2^H over the kept, renormalised distribution: roughly "how many
   * tokens are really in play". Greedy pins this at 1.
   */
  effectiveChoices: number;
  /** Renormalised P(correct) for factual prompts; null for open ones. */
  correctProbability: number | null;
}

/** Softmax with temperature, max-subtracted so exp() cannot overflow. */
export function softmax(candidates: Candidate[], temperature: number): number[] {
  const t = Math.max(temperature, 1e-6);
  const scaled = candidates.map((c) => c.logit / t);
  const max = Math.max(...scaled);
  const exps = scaled.map((v) => Math.exp(v - max));
  const sum = exps.reduce((a, b) => a + b, 0);
  return exps.map((v) => v / sum);
}

export function shannonEntropyBits(probabilities: number[]): number {
  let bits = 0;
  for (const p of probabilities) {
    if (p < 1e-12) continue;
    bits += -p * Math.log2(p);
  }
  return bits;
}

export function computeDistribution(
  promptId: PromptId,
  temperature: number,
  strategy: Strategy,
  k: number,
  p: number
): DistributionResult {
  const prompt = PROMPTS[promptId];
  const probabilities = softmax(prompt.candidates, temperature);

  const withProbs = prompt.candidates.map((c, i) => ({
    token: c.token,
    probability: probabilities[i],
    correct: c.correct === true,
  }));
  const sorted = [...withProbs].sort((a, b) => b.probability - a.probability);

  const kept = new Set<string>();
  let cutoffCumulative: number | null = null;

  if (strategy === 'greedy') {
    // Greedy is argmax, not a distribution. Temperature cannot reach it:
    // dividing every logit by the same T never changes which is largest.
    if (sorted[0]) kept.add(sorted[0].token);
  } else if (strategy === 'top-k') {
    for (const t of sorted.slice(0, k)) kept.add(t.token);
  } else {
    // Inclusive nucleus: the token that crosses p is kept.
    let cumulative = 0;
    for (const t of sorted) {
      if (cumulative >= p) break;
      cumulative += t.probability;
      kept.add(t.token);
    }
    cutoffCumulative = cumulative;
  }

  const scored: ScoredToken[] = sorted.map((t) => ({
    token: t.token,
    probability: t.probability,
    kept: kept.has(t.token),
    correct: t.correct,
  }));

  const keptTokens = scored.filter((t) => t.kept);
  const keptMass = keptTokens.reduce((sum, t) => sum + t.probability, 0);

  // Renormalise over the kept set — that is the distribution actually
  // sampled from, and the only one these two metrics should describe.
  const renormalised = keptMass > 0 ? keptTokens.map((t) => t.probability / keptMass) : [];
  const effectiveChoices = renormalised.length > 0 ? 2 ** shannonEntropyBits(renormalised) : 1;

  const correctProbability =
    prompt.kind === 'factual' && keptMass > 0
      ? keptTokens.filter((t) => t.correct).reduce((sum, t) => sum + t.probability, 0) / keptMass
      : null;

  return {
    scored,
    keptCount: keptTokens.length,
    topProbability: sorted[0]?.probability ?? 0,
    entropyBits: shannonEntropyBits(probabilities),
    discardedMassPct: (1 - keptMass) * 100,
    cutoffCumulative,
    effectiveChoices,
    correctProbability,
  };
}

export function sampleToken(scored: ScoredToken[]): { token: string; probability: number; correct: boolean } {
  const kept = scored.filter((t) => t.kept);
  const mass = kept.reduce((sum, t) => sum + t.probability, 0);
  let roll = Math.random() * mass;
  for (const t of kept) {
    roll -= t.probability;
    if (roll <= 0) return { token: t.token, probability: t.probability / mass, correct: t.correct };
  }
  const last = kept[kept.length - 1];
  return { token: last.token, probability: last.probability / mass, correct: last.correct };
}

/**
 * The sentence under the chart. This is the instrument's actual
 * argument, so it is derived from the numbers rather than hardcoded
 * per mode: accuracy is only interesting when it can fail, and
 * variety is only interesting when there is more than one candidate.
 */
export function verdict(
  promptId: PromptId,
  strategy: Strategy,
  result: DistributionResult
): { tone: 'good' | 'warn' | 'bad'; text: string } {
  const prompt = PROMPTS[promptId];
  const top = result.scored[0]?.token ?? '';

  if (strategy === 'greedy') {
    return prompt.kind === 'factual'
      ? { tone: 'good', text: `Always answers "${top}". Correct at every temperature — T cannot change the argmax.` }
      : { tone: 'bad', text: `Always writes "${top}". Same output at every temperature: no variety at all.` };
  }

  if (prompt.kind === 'factual') {
    const wrong = 1 - (result.correctProbability ?? 1);
    if (wrong < 0.02) {
      return { tone: 'good', text: `Almost always correct — ${(wrong * 100).toFixed(1)}% chance of a wrong answer.` };
    }
    if (wrong < 0.15) {
      return { tone: 'warn', text: `${(wrong * 100).toFixed(0)}% chance of a wrong answer. Fine for prose, not for arithmetic.` };
    }
    return { tone: 'bad', text: `${(wrong * 100).toFixed(0)}% chance of a wrong answer. The maths is broken here.` };
  }

  const choices = result.effectiveChoices;
  if (choices < 1.6) {
    return { tone: 'bad', text: `Effectively ${choices.toFixed(1)} choices — it will nearly always say "${top}".` };
  }
  if (choices < 4) {
    return { tone: 'warn', text: `Effectively ${choices.toFixed(1)} choices. Safe, and a little predictable.` };
  }
  return { tone: 'good', text: `Effectively ${choices.toFixed(1)} choices — this is where the interesting writing comes from.` };
}
