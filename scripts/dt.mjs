export function dtStats(base) {
  const rate = 1.5;
  const preempt = base.ar < 5 ? 1800 - 120 * base.ar : 1200 - 150 * (base.ar - 5);
  const adjusted = preempt / rate;
  const odWindow = base.mode === 1 ? 50 : base.mode === 3 ? 64 : 80;
  const odStep = base.mode === 1 || base.mode === 3 ? 3 : 6;
  return {
    ar: base.ar === null ? null : adjusted > 1200 ? (1800 - adjusted) / 120 : 5 + (1200 - adjusted) / 150,
    od: base.od === null ? null : base.mode === 2 ? base.od : (odWindow - (odWindow - odStep * base.od) / rate) / odStep,
    cs: base.cs,
    bpmMin: base.bpmMin === null ? null : base.bpmMin * rate,
    bpmMax: base.bpmMax === null ? null : base.bpmMax * rate,
    bpmMain: base.bpmMain === null ? null : base.bpmMain * rate,
    length: Math.round(base.length / rate), drain: Number.isFinite(base.drain) ? Math.round(base.drain / rate) : null
  };
}
