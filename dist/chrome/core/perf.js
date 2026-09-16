/*
 * Development-only performance marks. Disabled unless explicitly enabled from
 * a development console/build with globalThis.MOSAICSYNC_DEV_METRICS = true.
 * No telemetry, persistence or networking is involved.
 */
export function devMetricsEnabled() { return globalThis.MOSAICSYNC_DEV_METRICS === true; }
export function devMark(name) {
  if (!devMetricsEnabled() || !globalThis.performance?.mark) return;
  try { performance.mark(name); } catch {}
}
export function devMeasure(name, start, end) {
  if (!devMetricsEnabled() || !globalThis.performance?.measure) return;
  try {
    performance.measure(name, start, end);
    const latest = performance.getEntriesByName?.(name)?.at?.(-1);
    if (latest) console.debug(`[MosaicSync perf] ${name}: ${latest.duration.toFixed(2)} ms`);
  } catch {}
}
