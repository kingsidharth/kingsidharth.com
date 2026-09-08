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
                 rhymes for it, so the alternatives are interesting
                 rather than merely wrong.

   Greedy decoding always takes the argmax, so it is immune to T:
   maths stays correct forever, and poetry/language never produce
   anything but the single most likely word. That is the trade.
   ────────────────────────────────────────────────────────────────── */

export type PromptId = 'language' | 'maths' | 'poetry';

/** `factual` prompts have right answers; `open` ones are judged on variety. */
export type PromptKind = 'factual' | 'open';

/**
 * The truncation filters. These are NOT alternatives — every real
 * inference stack runs them as a chain, and a model card that
 * recommends `top_p 0.95, top_k 20, min_p 0.0` is naming three knobs on
 * one pipeline, not asking you to choose between them. Modelling them
 * as a radio group (which this file used to do) teaches the wrong
 * thing on the first click.
 */
export type FilterId = 'top-k' | 'top-p' | 'min-p';

export const FILTER_ORDER: FilterId[] = ['top-k', 'top-p', 'min-p'];

export interface FilterState {
  on: boolean;
  value: number;
}

export interface SamplerConfig {
  /**
   * Greedy is the one genuinely exclusive setting: it never reaches a
   * distribution, so there is nothing left for a filter to cut. It
   * therefore overrides the chain rather than joining it.
   */
  greedy: boolean;
  filters: Record<FilterId, FilterState>;
}

export const DEFAULT_SAMPLER: SamplerConfig = {
  greedy: false,
  filters: {
    'top-k': { on: false, value: 8 },
    'top-p': { on: true, value: 0.9 },
    'min-p': { on: false, value: 0.05 },
  },
};

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
  { token: '2', logit: 6.4, correct: true },
  { token: 'two', logit: 2.5, correct: true },
  { token: '3', logit: 2.4 },
  { token: '11', logit: 2.3 },
  { token: '1', logit: 2.2 },
  { token: '0', logit: 2.1 },
  { token: '4', logit: 2.0 },
  { token: '10', logit: 1.9 },
  { token: '5', logit: 1.8 },
  { token: '12', logit: 1.7 },
  { token: '−1', logit: 1.6 },
  { token: '6', logit: 1.5 },
  { token: '21', logit: 1.4 },
  { token: '7', logit: 1.3 },
  { token: '9', logit: 1.2 },
];

/* Every token here has to survive being read as the literal next word
   of "The secret to success is ___", so bare gerunds that need an
   object ("showing", "saying") are out — they read as broken English,
   not as a different opinion.

   The logits are crowded — 1.4 of spread across fifteen tokens, against
   4.6 in maths — but not flat, because a control that never moves the
   readout is a dead control. 1.4 is the widest spread that still leaves
   the T=1 field undominated (top token 12%, bottom 3%), and it is wide
   enough that effective choices climb from 1.7 at T=0.05 through
   verdict()'s 4.0 threshold at T≈0.13 to 13.8 at T=1, so the sentence
   under the chart changes as the knob turns. Past that the flatness is
   the lesson: nothing here is the right answer, so the variety is free
   in a way it never is for maths. */
const LANGUAGE: Candidate[] = [
  { token: 'consistency', logit: 3.0 },
  { token: 'patience', logit: 2.91 },
  { token: 'practice', logit: 2.82 },
  { token: 'persistence', logit: 2.73 },
  { token: 'discipline', logit: 2.64 },
  { token: 'failing', logit: 2.54 },
  { token: 'starting', logit: 2.44 },
  { token: 'curiosity', logit: 2.34 },
  { token: 'attention', logit: 2.24 },
  { token: 'luck', logit: 2.14 },
  { token: 'listening', logit: 2.03 },
  { token: 'repetition', logit: 1.92 },
  { token: 'compounding', logit: 1.81 },
  { token: 'boredom', logit: 1.7 },
  { token: 'hunger', logit: 1.6 },
];

/* "star" is the line everyone already knows, so it gets a 2.6 lead on
   the field: 98% at T=0.5, a comfortable 68% at T=1, and 26% at T=2,
   where the tail outvotes it three to one. That collapse is the lesson,
   so it has to happen inside the slider's range.

   The tail is all rhymes on /ɑːr/, because a hotter setting has to
   produce a line that still scans — otherwise high temperature reads as
   breakage rather than as invention, and the mode argues against
   itself. They are also all common words: reaching for obscure rhymes
   would prove the opposite of the claim, which is that temperature
   surfaces interesting alternatives, not rare ones. The chart shows
   eleven rows, so scar/car/guitar/bar/jar are ordered into that window
   and "jaguar"/"radar" — the deliberate off-stress near-rhymes — fall
   below the fold where they belong. */
const POETRY: Candidate[] = [
  { token: 'star', logit: 5.6 },
  { token: 'scar', logit: 3.0 },
  { token: 'car', logit: 2.9 },
  { token: 'guitar', logit: 2.8 },
  { token: 'bar', logit: 2.7 },
  { token: 'jar', logit: 2.6 },
  { token: 'ajar', logit: 2.5 },
  { token: 'afar', logit: 2.4 },
  { token: 'cigar', logit: 2.3 },
  { token: 'tar', logit: 2.2 },
  { token: 'far', logit: 2.1 },
  { token: 'par', logit: 2.0 },
  { token: 'char', logit: 1.9 },
  { token: 'jaguar', logit: 1.8 },
  { token: 'radar', logit: 1.7 },
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

/* The dial reads 0 → 2.0 with 1.0 at twelve o'clock, because 1.0 is the
   neutral setting: at T = 1 the softmax is exactly the distribution the
   model emitted, un-sharpened and un-flattened. Below it you are cooling,
   above it you are heating, and the dial should say so at a glance.

   T = 0 is a real setting, not a guard rail — it is greedy decoding
   written as a temperature, and every API that accepts `temperature=0`
   means precisely this. `softmax` clamps the divisor to 1e-6 so the
   arithmetic stays finite; the result is the one-hot distribution that
   the limit converges to. */
export const TEMP_MIN = 0;
export const TEMP_MAX = 2.0;
/** The setting a model was tuned at: softmax with no reshaping applied. */
export const TEMP_NEUTRAL = 1.0;

export interface ScoredToken {
  token: string;
  probability: number;
  /**
   * ln(probability). What an API actually hands back when you ask for
   * logprobs — always ≤ 0, with 0 meaning certainty. Carried alongside
   * the probability rather than derived at the call site so every panel
   * agrees on how a zero-probability token prints.
   */
  logprob: number;
  kept: boolean;
  correct: boolean;
}

/** ln(p), floored so a token softmax has flushed to zero prints as a
 *  finite "off the bottom of the scale" figure rather than `-Infinity`. */
export function toLogprob(probability: number): number {
  return probability > 1e-9 ? Math.log(probability) : -20;
}

/** One link in the truncation chain, for the pipeline readout. */
export interface FilterStep {
  id: FilterId | 'vocabulary' | 'greedy';
  label: string;
  /** How many candidates survived this step. */
  kept: number;
}

export interface DistributionResult {
  scored: ScoredToken[];
  keptCount: number;
  /** Candidate count after each filter, in the order they were applied. */
  chain: FilterStep[];
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
  config: SamplerConfig
): DistributionResult {
  const prompt = PROMPTS[promptId];
  const probabilities = softmax(prompt.candidates, temperature);

  const withProbs = prompt.candidates.map((c, i) => ({
    token: c.token,
    probability: probabilities[i],
    correct: c.correct === true,
  }));
  const sorted = [...withProbs].sort((a, b) => b.probability - a.probability);

  let cutoffCumulative: number | null = null;

  /* The chain. Each filter runs on what the previous one left, which is
     the whole point: top-k 20 followed by top-p 0.95 is not "either 20
     tokens or 95% of the mass", it is "at most 20, and of those, only
     as many as it takes to reach 95%". The steps are recorded so the
     panel can show the count falling through the pipeline. */
  const chain: FilterStep[] = [{ id: 'vocabulary', label: 'candidates', kept: sorted.length }];
  let live = sorted;

  if (config.greedy) {
    // Greedy is argmax, not a distribution. Temperature cannot reach it:
    // dividing every logit by the same T never changes which is largest.
    live = sorted.slice(0, 1);
    chain.push({ id: 'greedy', label: 'argmax', kept: live.length });
  } else {
    const { 'top-k': topK, 'top-p': topP, 'min-p': minP } = config.filters;

    if (topK.on) {
      live = live.slice(0, Math.max(1, Math.round(topK.value)));
      chain.push({ id: 'top-k', label: `top-k ${Math.round(topK.value)}`, kept: live.length });
    }

    if (topP.on) {
      // Inclusive nucleus: the token that crosses p is kept.
      let cumulative = 0;
      const next: typeof live = [];
      for (const t of live) {
        if (cumulative >= topP.value) break;
        cumulative += t.probability;
        next.push(t);
      }
      live = next;
      cutoffCumulative = cumulative;
      chain.push({ id: 'top-p', label: `top-p ${topP.value.toFixed(2)}`, kept: live.length });
    }

    if (minP.on) {
      /* Relative, not absolute: the floor is a fraction of the top
         token's probability, so the same min_p is strict when the model
         is confident and permissive when it is not. That is the whole
         argument for it over top-p. */
      const floor = minP.value * (sorted[0]?.probability ?? 0);
      live = live.filter((t) => t.probability >= floor);
      if (live.length === 0 && sorted[0]) live = [sorted[0]];
      chain.push({ id: 'min-p', label: `min-p ${minP.value.toFixed(2)}`, kept: live.length });
    }
  }

  const kept = new Set(live.map((t) => t.token));

  const scored: ScoredToken[] = sorted.map((t) => ({
    token: t.token,
    probability: t.probability,
    logprob: toLogprob(t.probability),
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
    chain,
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

/* ──────────────────────────────────────────────────────────────────
   What each control is, said twice: once in the notation you will meet
   in a paper, once in the sentence you would use out loud. Both sit on
   the panel at the same time on purpose — the notation is only
   intimidating until you have read the plain version beside it.
   ────────────────────────────────────────────────────────────────── */
export interface ControlInfo {
  label: string;
  /** One line, under the button. */
  tagline: string;
  /** The rule, in notation. */
  maths: string;
  /** The rule, out loud. */
  plain: string;
  /** What it costs you. Every one of these has a real downside. */
  cost: string;
}

export const GREEDY_INFO: ControlInfo = {
  label: 'Greedy',
  tagline: 'Always take the tallest bar.',
  maths: 'argmax  p(t)',
  plain:
    'Look at every token, pick the single most likely one, done. No dice are rolled, so the same prompt gives the same answer forever.',
  cost:
    'Temperature cannot touch it, and neither can any filter below — dividing every score by the same number never changes which one is largest, and there is nothing to truncate when you are only ever reading row one.',
};

export interface FilterInfo extends ControlInfo {
  id: FilterId;
  /** Fader legend. k is a count, p is a share of the mass, min-p is a
   *  ratio — one shared label would be lying about two of the three. */
  fader: { name: string; caption: string; min: number; max: number; step: number };
  /** How the value prints. */
  format: (value: number, candidates: number) => string;
}

export const FILTER_INFO: Record<FilterId, FilterInfo> = {
  'top-k': {
    id: 'top-k',
    label: 'Top K',
    tagline: 'Keep a fixed count.',
    maths: 'keep {t : rank(t) ≤ K}',
    plain:
      'Sort the tokens by probability and keep the top K of them. A hard headcount — the same number of survivors every time, whatever the distribution looks like.',
    cost:
      'K does not know the shape it is cutting. When the model is certain, K = 40 drags in 39 tokens it had already dismissed. When it is genuinely torn between sixty options, K = 40 throws away twenty good ones.',
    fader: { name: 'K', caption: 'how many tokens survive', min: 1, max: 15, step: 1 },
    format: (v) => `${Math.round(v)}`,
  },
  'top-p': {
    id: 'top-p',
    label: 'Top P',
    tagline: 'Keep a fixed share of the mass.',
    maths: 'smallest S with Σ p(t∈S) ≥ P',
    plain:
      'Walk down the surviving list adding probabilities as you go, and stop the moment the running total reaches P. The count now adapts on its own: a confident model yields few candidates, an uncertain one yields many.',
    cost:
      'That adaptation is also why a P copied off a blog post means nothing without the temperature beside it. Heat the distribution and the same P suddenly keeps ten times as many tokens.',
    fader: { name: 'P', caption: 'how much probability mass survives', min: 0.05, max: 1, step: 0.01 },
    format: (v) => v.toFixed(2),
  },
  'min-p': {
    id: 'min-p',
    label: 'Min P',
    tagline: 'Keep anything close enough to the leader.',
    maths: 'keep {t : p(t) ≥ min_p · p_max}',
    plain:
      'Set a floor as a fraction of the top token. At min-p 0.05 a token survives only if it is at least a twentieth as likely as the leader — so the bar moves with the model\'s own confidence rather than being fixed in advance.',
    cost:
      'It does nothing on a flat distribution, where everything is already close to the leader. It is a scalpel for the confident case and a no-op for the uncertain one, which is why it is usually run alongside the other two rather than instead of them.',
    fader: { name: 'min-p', caption: 'floor, as a fraction of the top token', min: 0, max: 0.4, step: 0.01 },
    format: (v) => v.toFixed(2),
  },
};
