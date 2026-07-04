import type { ReportModel, ToolTimeline } from './report.js';

const day = (ms: number | null): string => (ms === null ? '—' : new Date(ms).toISOString().slice(0, 10));

const spanDays = (m: ReportModel): number =>
  m.firstRun !== null && m.lastRun !== null
    ? Math.max(1, Math.round((m.lastRun - m.firstRun) / 86_400_000))
    : 0;

export function renderDataset(m: ReportModel): string {
  return JSON.stringify(m, null, 2) + '\n';
}

export function renderMarkdown(m: ReportModel): string {
  const changed = m.timelines.filter((t) => t.severity !== 'stable');
  const lines: string[] = [];

  lines.push('# MCP Drift Report');
  lines.push('');
  lines.push(
    `_Generated ${day(m.generatedAt)} · ${m.serverCount} servers · ${m.toolCount} tools · ` +
      `${m.runCount} runs over ${spanDays(m)} day(s)_`,
  );
  lines.push('');
  lines.push(
    'We pointed [mcp-watch](https://github.com/finsavvyai/opensyber-mcp-watch) at a set of public ' +
      'MCP servers and recorded a SHA-256 fingerprint of every tool definition on each run. ' +
      'Single-scan tools only ever see one snapshot — this watches the definitions *change over time*.',
  );
  lines.push('');
  lines.push('## Headline');
  lines.push('');
  lines.push(`- 🟢 **${m.counts.stable}** stable`);
  lines.push(`- 🟡 **${m.counts.drifted}** drifted (version-bump / benign redefinition)`);
  lines.push(`- 🔴 **${m.counts.suspicious}** suspicious (injection-like change)`);
  lines.push('');
  if (m.counts.suspicious > 0) {
    lines.push(
      `**${m.counts.suspicious} tool definition(s) changed in ways that look like tool poisoning** — ` +
        'the exact rug-pull that fires *after* a scanner has approved the tool.',
    );
  } else if (m.counts.drifted > 0) {
    lines.push(
      `No injection-like changes this period — but **${m.counts.drifted} tool(s) silently redefined ` +
        'themselves after first sighting.** A one-time scan or pin never sees that; a fingerprint history does.',
    );
  } else {
    lines.push('Every tracked tool held its fingerprint this period. Clean — and now provably so.');
  }
  lines.push('');

  if (changed.length > 0) {
    lines.push('## Tools that changed');
    lines.push('');
    lines.push('| Server | Tool | Changes | Severity | Why |');
    lines.push('|--------|------|:------:|:--------:|-----|');
    for (const t of changed) lines.push(row(t));
    lines.push('');
  }

  if (m.errors.length > 0) {
    lines.push('## Unreachable this period');
    lines.push('');
    for (const e of m.errors) lines.push(`- ${e.serverName} (${e.count} failed run(s))`);
    lines.push('');
  }

  lines.push('## Method');
  lines.push('');
  lines.push('- `fingerprint = SHA-256(canonical({ name, description, inputSchema }))` — key order is irrelevant, semantics are not.');
  lines.push('- Drift scored by [`@opensyber/mcp-watch-core`](https://www.npmjs.com/package/@opensyber/mcp-watch-core) `classifyDrift` — the same engine the tool ships.');
  lines.push('- Raw data (`dataset.json`) and chart (`chart.svg`) sit next to this file. Reproduce it yourself.');
  lines.push('');
  lines.push('---');
  lines.push('');
  lines.push('Catch this on **your** agents: `npx @opensyber/mcp-watch scan`. Cross-machine fleet + long history: [opensyber.cloud](https://opensyber.cloud).');
  lines.push('');
  return lines.join('\n');
}

function row(t: ToolTimeline): string {
  const badge = t.severity === 'suspicious' ? '🔴 suspicious' : '🟡 drifted';
  const why = (t.worstReason ?? '').replace(/\|/g, '\\|');
  return `| ${t.serverName} | \`${t.toolName}\` | ${t.changes} | ${badge} | ${why} |`;
}

/** Minimal, dependency-free, theme-neutral bar chart. */
export function renderSvg(m: ReportModel): string {
  const bars = [
    { label: 'stable', value: m.counts.stable, color: '#16a34a' },
    { label: 'drifted', value: m.counts.drifted, color: '#d97706' },
    { label: 'suspicious', value: m.counts.suspicious, color: '#dc2626' },
  ];
  const max = Math.max(1, ...bars.map((b) => b.value));
  const W = 480;
  const barH = 34;
  const gap = 16;
  const top = 44;
  const labelW = 96;
  const trackW = W - labelW - 60;
  const H = top + bars.length * (barH + gap);

  const parts: string[] = [];
  parts.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="ui-sans-serif, system-ui, sans-serif">`);
  parts.push(`<text x="16" y="26" font-size="18" font-weight="700" fill="#111827">MCP Drift Report — ${m.toolCount} tools</text>`);
  bars.forEach((b, i) => {
    const y = top + i * (barH + gap);
    const w = Math.round((b.value / max) * trackW);
    parts.push(`<text x="16" y="${y + barH / 2 + 5}" font-size="14" fill="#374151">${b.label}</text>`);
    parts.push(`<rect x="${labelW}" y="${y}" width="${trackW}" height="${barH}" rx="6" fill="#e5e7eb"/>`);
    parts.push(`<rect x="${labelW}" y="${y}" width="${w}" height="${barH}" rx="6" fill="${b.color}"/>`);
    parts.push(`<text x="${labelW + trackW + 10}" y="${y + barH / 2 + 5}" font-size="15" font-weight="700" fill="#111827">${b.value}</text>`);
  });
  parts.push('</svg>');
  return parts.join('\n');
}
