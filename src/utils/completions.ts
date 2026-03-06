import {
  MODELS,
  SANDBOX_MODES,
  APPROVAL_POLICIES,
  REASONING_EFFORTS,
  PERSONALITIES,
} from '../constants.js';

export const ARGUMENT_COMPLETIONS: Record<string, string[]> = {
  model: Object.values(MODELS),
  sandboxMode: Object.values(SANDBOX_MODES),
  approvalPolicy: Object.values(APPROVAL_POLICIES),
  approval: Object.values(APPROVAL_POLICIES),
  reasoningEffort: Object.values(REASONING_EFFORTS),
  personality: Object.values(PERSONALITIES),
  methodology: ['divergent', 'convergent', 'scamper', 'design-thinking', 'lateral', 'auto'],
};

export function getCompletionValues(
  argName: string,
  partial: string
): { values: string[]; total: number; hasMore: boolean } {
  const all = ARGUMENT_COMPLETIONS[argName] || [];
  const filtered = partial
    ? all.filter(v => v.toLowerCase().startsWith(partial.toLowerCase()))
    : all;
  const limited = filtered.slice(0, 100);
  return { values: limited, total: filtered.length, hasMore: filtered.length > 100 };
}
