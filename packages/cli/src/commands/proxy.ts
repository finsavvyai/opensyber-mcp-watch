import { loadConfig, serverKey } from '../config.js';
import { Storage } from '../storage.js';
import { startProxy, type ProxyPolicy, type ProxyDecision } from '../proxy.js';
import { c } from '../output.js';

function flag(args: string[], name: string, def: string): string {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1]! : def;
}

export async function proxyCommand(args: string[] = []): Promise<number> {
  const serverName = flag(args, '--server', '');
  const port = Number(flag(args, '--port', '8900'));
  const policy = flag(args, '--policy', 'block') as ProxyPolicy;
  if (!['block', 'warn', 'log'].includes(policy)) {
    process.stderr.write(c.alert(`Invalid --policy '${policy}'. Use block, warn, or log.\n`));
    return 64;
  }

  const cfg = loadConfig();
  const server = serverName ? cfg.servers.find((s) => s.name === serverName) : cfg.servers[0];
  if (!server) {
    process.stderr.write(c.alert(`Unknown server '${serverName}'. Known: ${cfg.servers.map((s) => s.name).join(', ')}\n`));
    return 1;
  }
  if (!server.url) {
    process.stderr.write(c.alert(`Proxy supports http servers only; '${server.name}' is stdio.\n`));
    return 64;
  }

  const storage = new Storage();
  const onDecision = (d: ProxyDecision): void => {
    const tag = d.action === 'blocked' ? c.alert('[BLOCKED]') : c.warn('[WARN]');
    process.stdout.write(`${tag} tool '${d.toolName}' — ${d.reason}\n`);
  };
  const handle = startProxy(
    { upstreamUrl: server.url, headers: server.headers, storage, serverKey: serverKey(server), policy, onDecision },
    port,
  );

  process.stdout.write(c.bold('opensyber-mcp-watch proxy') + ` → ${server.name} (${server.url})\n`);
  process.stdout.write(c.dim(`listening on http://localhost:${port}  ·  policy: ${policy}\n`));
  process.stdout.write(c.dim('Point your agent at the proxy URL instead of the server. Ctrl+C to stop.\n\n'));

  return new Promise<number>((resolve) => {
    const stop = (): void => {
      void handle.close().then(() => {
        storage.close();
        process.stdout.write(c.dim('\nproxy stopped.\n'));
        resolve(0);
      });
    };
    process.on('SIGINT', stop);
    process.on('SIGTERM', stop);
  });
}
