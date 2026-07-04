export type DriftVerdict = 'unchanged' | 'first-seen' | 'version-bump' | 'suspicious-injection';

export interface DriftResult {
  verdict: DriftVerdict;
  reason: string;
  diffSummary: string;
}

export type SignalSeverity = 'high' | 'low';

export interface InjectionSignal {
  kind: string;
  severity: SignalSeverity;
  detail: string;
}

// High-severity: overt attempts to redirect the model or hide instructions.
const INJECTION_MARKERS = [
  '[SYSTEM]',
  '<system>',
  '</system>',
  '[INST]',
  '<instruction>',
  '<|im_start|>',
  'ignore previous',
  'ignore all previous',
  'override all prior',
  'disregard the above',
  'exfiltrate',
  'attacker.example',
];

const IMPERATIVE_PATTERNS: RegExp[] = [
  /ignore\s+(all\s+)?(the\s+)?(previous|prior|above)\s+(instructions|messages|context|prompts?)/i,
  /disregard\s+(the\s+)?(above|previous|prior|earlier)/i,
  /you\s+are\s+now\s+/i,
  /(reveal|print|leak|dump)\s+(the\s+)?(system\s+prompt|api[_\s-]?key|secret|credential)/i,
  /do\s+not\s+(tell|inform|mention\s+to)\s+the\s+user/i,
  /send\s+.{0,40}\s+to\s+(https?:\/\/|attacker)/i,
  /exfiltrat\w*/i,
];

// Zero-width, bidi-override, BOM, word-joiner — used to hide instructions.
// Built from escapes so no literal invisible characters live in the source.
const INVISIBLE = new RegExp('[\\u200B-\\u200F\\u202A-\\u202E\\u2060-\\u2064\\uFEFF]');
const URL_RE = /\bhttps?:\/\/[^\s"'<>)\]]+/gi;
const BASE64_BLOB = /\b[A-Za-z0-9+/]{48,}={0,2}\b/;

/**
 * Scan free text (a tool description or canonical inputSchema) for
 * injection/exfiltration signals. High-severity signals gate the verdict;
 * low-severity ones (URLs, base64) are reported for context.
 */
export function scanText(text: string): InjectionSignal[] {
  const signals: InjectionSignal[] = [];
  const lower = text.toLowerCase();
  for (const marker of INJECTION_MARKERS) {
    if (lower.includes(marker.toLowerCase())) signals.push({ kind: 'marker', severity: 'high', detail: marker });
  }
  for (const re of IMPERATIVE_PATTERNS) {
    const m = re.exec(text);
    if (m) signals.push({ kind: 'imperative', severity: 'high', detail: m[0].slice(0, 60) });
  }
  if (INVISIBLE.test(text)) {
    signals.push({ kind: 'hidden-unicode', severity: 'high', detail: 'invisible or bidi control characters' });
  }
  const urls = text.match(URL_RE);
  if (urls) for (const u of new Set(urls)) signals.push({ kind: 'url', severity: 'low', detail: u });
  if (BASE64_BLOB.test(text)) signals.push({ kind: 'base64', severity: 'low', detail: 'long base64-like blob' });
  return signals;
}

const highKey = (s: InjectionSignal): string => `${s.kind}:${s.detail}`;

function highSignals(text: string): Set<string> {
  return new Set(scanText(text).filter((s) => s.severity === 'high').map(highKey));
}

function summarizeDescriptionChange(oldDesc: string, newDesc: string): string {
  if (oldDesc === newDesc) return '(description unchanged)';
  const added = newDesc.slice(oldDesc.length).trim();
  if (newDesc.startsWith(oldDesc) && added.length > 0) {
    return `+ APPENDED: ${added}`;
  }
  return `- OLD: ${oldDesc}\n+ NEW: ${newDesc}`;
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

  // Scan the whole definition (description + schema) so injection hiding in the
  // inputSchema is caught, not waved through as a benign version-bump.
  const oldText = `${opts.oldDescription}\n${opts.oldInputSchema}`;
  const newText = `${opts.newDescription}\n${opts.newInputSchema}`;
  const oldHigh = highSignals(oldText);
  const gained = scanText(newText).filter((s) => s.severity === 'high' && !oldHigh.has(highKey(s)));

  if (gained.length > 0) {
    const where = opts.oldDescription !== opts.newDescription ? 'description' : 'inputSchema';
    return {
      verdict: 'suspicious-injection',
      reason: `Definition gained injection signal in ${where}: ${gained.map((g) => `${g.kind} '${g.detail}'`).join('; ')}.`,
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
