export interface AgentStep {
  name: string;
  input: string;
  output: string;
  latencyMs: number;
}

/** A structured reference to a specific data point the AI used when generating output. */
export interface AgentSource {
  type: "kpi" | "signal" | "score" | "kyc" | "document" | "adapter" | "action" | "touchpoint" | "contact" | "opportunity" | "public";
  label: string;   // e.g. "CSAT score: 18/100", "Signal: Revenue drop detected"
  value?: string;  // optional secondary value or context
}

export interface AgentResult<T> {
  output: T;
  sources: AgentSource[];
  steps: AgentStep[];
  model: string;
  totalLatencyMs: number;
}

export function makeStep(
  name: string,
  input: string,
  output: string,
  latencyMs: number,
): AgentStep {
  return {
    name,
    input:  input.slice(0, 800),
    output: output.slice(0, 800),
    latencyMs,
  };
}
