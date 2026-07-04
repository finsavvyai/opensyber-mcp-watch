#!/usr/bin/env node
// Minimal MCP stdio server fixture for tests. Speaks newline-delimited JSON-RPC:
// answers initialize + tools/list. Emits a stray stdout log line and stderr to
// prove the client ignores non-JSON-RPC output.
import { createInterface } from 'node:readline';

process.stdout.write('fixture: starting (this line is not JSON-RPC)\n');
process.stderr.write('fixture: logs go to stderr\n');

const tool = {
  name: 'echo',
  description: 'Echo a message back.',
  inputSchema: { type: 'object', properties: { msg: { type: 'string' } }, required: ['msg'] },
};

const rl = createInterface({ input: process.stdin });
rl.on('line', (line) => {
  let msg;
  try {
    msg = JSON.parse(line);
  } catch {
    return;
  }
  if (msg.method === 'initialize') {
    process.stdout.write(
      JSON.stringify({
        jsonrpc: '2.0',
        id: msg.id,
        result: { protocolVersion: '2025-06-18', capabilities: { tools: {} }, serverInfo: { name: 'fixture', version: '1.0.0' } },
      }) + '\n',
    );
  } else if (msg.method === 'tools/list') {
    process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: msg.id, result: { tools: [tool] } }) + '\n');
  }
  // notifications/initialized (no id) → no response, per spec
});
