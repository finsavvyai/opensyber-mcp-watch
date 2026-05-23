export type DriftVerdict = 'unchanged' | 'first-seen' | 'version-bump' | 'suspicious-injection';

export interface DriftResult {
  verdict: DriftVerdict;
  reason: string;
  diffSummary: string;
}

const INJECTION_MARKERS = [
  '[SYSTEM]',
  '<system>',
  '<instruction>',
  'ignore previous',
  'override all prior',
  'exfiltrate',
  'attacker.example',
];

function summarizeDescriptionChange(oldDesc: string, newDesc: string): string {
  if (oldDesc === newDesc) return '(description unchanged)';
  const added = newDesc.slice(oldDesc.length).trim();
  if (newDesc.startsWith(oldDesc) && added.length > 0) {
    return `+ APPENDED: ${added}`;
  }
  return `- OLD: ${oldDesc}\n+ NEW: ${newDesc}`;
}

function hasInjectionMarker(text: string): string | null {
  const lower = text.toLowerCase();
  for (const marker of INJECTION_MARKERS) {
    if (lower.includes(marker.toLowerCase())) return marker;
  }
  return null;
}

export function classifyDrift(opts: {
  oldFingerprint: string | null;
  newFingerprint: string;
  oldDescription: string;
  newDescription: string;
  oldInputSchema: string;
  newInputSchema: string;
}): DriftResult {
  if (opts.oldFingerprint === null) {
    return { verdict: 'first-seen', reason: 'No prior fingerprint on file.', diffSummary: '(baseline)' };
  }
  if (opts.oldFingerprint === opts.newFingerprint) {
    return { verdict: 'unchanged', reason: 'Fingerprints match.', diffSummary: '(unchanged)' };
  }
  const marker = hasInjectionMarker(opts.newDescription);
  if (marker && !hasInjectionMarker(opts.oldDescription)) {
    return {
      verdict: 'suspicious-injection',
      reason: `Description gained injection-like marker '${marker}'.`,
      diffSummary: summarizeDescriptionChange(opts.oldDescription, opts.newDescription),
    };
  }
  const descChanged = opts.oldDescription !== opts.newDescription;
  const schemaChanged = opts.oldInputSchema !== opts.newInputSchema;
  if (!descChanged && schemaChanged) {
    return {
      verdict: 'version-bump',
      reason: 'inputSchema changed, description stable.',
      diffSummary: 'inputSchema differs (description unchanged).',
    };
  }
  return {
    verdict: 'suspicious-injection',
    reason: 'Definition changed without an injection marker; treat as untrusted until reviewed.',
    diffSummary: summarizeDescriptionChange(opts.oldDescription, opts.newDescription),
  };
}
