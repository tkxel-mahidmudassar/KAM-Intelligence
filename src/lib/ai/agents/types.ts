export interface AgentStep {
  name: string;
  input: string;
  output: string;
  latencyMs: number;
}

export interface AgentResult<T> {
  output: T;
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
