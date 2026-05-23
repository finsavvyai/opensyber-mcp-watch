import kleur from 'kleur';

const NO_COLOR = process.env.NO_COLOR !== undefined && process.env.NO_COLOR !== '';
if (NO_COLOR) kleur.enabled = false;

export const c = {
  alert: (s: string) => kleur.red().bold(s),
  warn: (s: string) => kleur.yellow(s),
  info: (s: string) => kleur.cyan(s),
  ok: (s: string) => kleur.green(s),
  dim: (s: string) => kleur.dim(s),
  bold: (s: string) => kleur.bold(s),
  hash: (s: string) => kleur.magenta(s.slice(0, 12) + '…'),
};

export function timestamp(ms: number): string {
  const d = new Date(ms);
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}
