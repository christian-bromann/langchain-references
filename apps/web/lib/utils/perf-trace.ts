/**
 * Performance Tracing Utility
 *
 * Lightweight instrumentation for identifying performance bottlenecks.
 * Logs are visible in Vercel function logs.
 *
 * Usage:
 *   const trace = createTrace("SymbolPage");
 *   trace.start("fetchData");
 *   await fetchData();
 *   trace.end("fetchData");
 *   trace.summary(); // logs all timings
 */

interface TraceEntry {
  name: string;
  start: number;
  end?: number;
  duration?: number;
}

export interface Trace {
  start: (name: string) => void;
  end: (name: string) => void;
  mark: (name: string) => void;
  summary: () => void;
  getDurations: () => Record<string, number>;
}

/**
 * Create a performance trace for a specific operation.
 * All timings are logged to console and visible in Vercel logs.
 */
export function createTrace(context: string): Trace {
  const entries = new Map<string, TraceEntry>();
  const marks: Array<{ name: string; time: number }> = [];
  const traceStart = performance.now();

  return {
    start(name: string) {
      entries.set(name, { name, start: performance.now() });
    },

    end(name: string) {
      const entry = entries.get(name);
      if (entry) {
        entry.end = performance.now();
        entry.duration = entry.end - entry.start;
      }
    },

    mark(name: string) {
      marks.push({ name, time: performance.now() - traceStart });
    },

    getDurations() {
      const result: Record<string, number> = {};
      for (const [name, entry] of entries) {
        if (entry.duration !== undefined) {
          result[name] = entry.duration;
        }
      }
      return result;
    },

    summary() {
      const totalDuration = performance.now() - traceStart;
      const lines: string[] = [`[PERF:${context}] Total: ${totalDuration.toFixed(0)}ms`];

      // Sort entries by duration descending
      const sorted = [...entries.values()]
        .filter((e) => e.duration !== undefined)
        .sort((a, b) => (b.duration || 0) - (a.duration || 0));

      for (const entry of sorted) {
        const pct = ((entry.duration! / totalDuration) * 100).toFixed(0);
        lines.push(`  ${entry.name}: ${entry.duration!.toFixed(0)}ms (${pct}%)`);
      }

      if (marks.length > 0) {
        lines.push("  Marks:");
        for (const mark of marks) {
          lines.push(`    ${mark.name}: ${mark.time.toFixed(0)}ms`);
        }
      }

      console.log(lines.join("\n"));
    },
  };
}

/**
 * Wrap an async function with timing instrumentation.
 */
export async function timed<T>(
  trace: Trace,
  name: string,
  fn: () => Promise<T>,
): Promise<T> {
  trace.start(name);
  try {
    return await fn();
  } finally {
    trace.end(name);
  }
}
