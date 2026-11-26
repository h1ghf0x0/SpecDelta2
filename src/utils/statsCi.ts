/**
 * Exact Clopper-Pearson binomial confidence intervals (zero external dependencies).
 */

function logGamma(z: number): number {
  const cof = [
    76.18009172947146,
    -86.50532032941677,
    24.01409824083091,
    -1.231739572450155,
    0.001208650973866179,
    -0.000005395239384953,
  ];
  let x = z;
  let y = z;
  let tmp = x + 5.5;
  tmp -= (x + 0.5) * Math.log(tmp);
  let ser = 1.000000000190015;
  for (let j = 0; j < cof.length; j++) {
    y += 1;
    ser += cof[j] / y;
  }
  return -tmp + Math.log((2.5066282746310005 * ser) / x);
}

function betacf(a: number, b: number, x: number): number {
  const MAXIT = 200;
  const EPS = 3e-12;
  const FPMIN = 1e-30;
  const qab = a + b;
  const qap = a + 1;
  const qam = a - 1;
  let c = 1;
  let d = 1 - (qab * x) / qap;
  if (Math.abs(d) < FPMIN) d = FPMIN;
  d = 1 / d;
  let h = d;
  for (let m = 1; m <= MAXIT; m++) {
    const m2 = 2 * m;
    let aa = (m * (b - m) * x) / ((qam + m2) * (a + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < FPMIN) d = FPMIN;
    c = 1 + aa / c;
    if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d;
    h *= d * c;
    aa = (-(a + m) * (qab + m) * x) / ((a + m2) * (qap + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < FPMIN) d = FPMIN;
    c = 1 + aa / c;
    if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1) < EPS) break;
  }
  return h;
}

/** Regularized incomplete beta function I_x(a, b) = P(Beta(a, b) <= x). */
function betaCdf(x: number, a: number, b: number): number {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const bt = Math.exp(
    logGamma(a + b) - logGamma(a) - logGamma(b) + a * Math.log(x) + b * Math.log(1 - x)
  );
  if (x < (a + 1) / (a + b + 2)) {
    return (bt * betacf(a, b, x)) / a;
  }
  return 1 - (bt * betacf(b, a, 1 - x)) / b;
}

function betaQuantile(target: number, a: number, b: number): number {
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 64; i++) {
    const mid = 0.5 * (lo + hi);
    if (betaCdf(mid, a, b) < target) {
      lo = mid;
    } else {
      hi = mid;
    }
  }
  return 0.5 * (lo + hi);
}

export interface BinomialRateStats {
  events: number;
  trials: number;
  pointPct: number;
  ci95TwoSidedPct: [number, number];
  oneSided95UpperPct: number;
  summary: string;
}

export function clopperPearsonStats(events: number, trials: number): BinomialRateStats {
  if (trials <= 0) {
    return {
      events: 0,
      trials: 0,
      pointPct: 0,
      ci95TwoSidedPct: [0, 100],
      oneSided95UpperPct: 100,
      summary: '0/0 (N/A)',
    };
  }
  const alpha = 0.05;
  const point = events / trials;
  const lower = events === 0 ? 0 : betaQuantile(alpha / 2, events, trials - events + 1);
  const upperTwoSided =
    events === trials ? 1 : betaQuantile(1 - alpha / 2, events + 1, trials - events);
  const upperOneSided =
    events === trials ? 1 : betaQuantile(1 - alpha, events + 1, trials - events);

  const r1 = (v: number) => Math.round(v * 1000) / 10;
  const pointPct = r1(point);
  const loPct = r1(lower);
  const hiPct = r1(upperTwoSided);
  const u95Pct = r1(upperOneSided);

  return {
    events,
    trials,
    pointPct,
    ci95TwoSidedPct: [loPct, hiPct],
    oneSided95UpperPct: u95Pct,
    summary:
      events === 0
        ? `0/${trials} (95% one-sided upper bound ≤ ${u95Pct}%; two-sided 95% CI 0.0–${hiPct}%)`
        : `${events}/${trials} (${pointPct}%; two-sided 95% CI ${loPct}–${hiPct}%)`,
  };
}
