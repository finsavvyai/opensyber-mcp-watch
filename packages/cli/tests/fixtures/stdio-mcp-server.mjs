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
const prompt = { name: 'greet', description: 'A greeting prompt.', arguments: [{ name: 'who', required: true }] };
const resource = { uri: 'file:///readme', name: 'readme', description: 'Project readme.', mimeType: 'text/plain' };

const reply = (id, result) => process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id, result }) + '\n');

const rl = createInterface({ input: process.stdin });
rl.on('line', (line) => {
  let msg;
  try {
    msg = JSON.parse(line);
  } catch {
    return;
  }
  switch (msg.method) {
    case 'initialize':
      reply(msg.id, { protocolVersion: '2025-06-18', capabilities: { tools: {}, prompts: {}, resources: {} }, serverInfo: { name: 'fixture', version: '1.0.0' } });
      break;
    case 'tools/list':
      reply(msg.id, { tools: [tool] });
      break;
    case 'prompts/list':
      reply(msg.id, { prompts: [prompt] });
      break;
    case 'resources/list':
      reply(msg.id, { resources: [resource] });
      break;
    // notifications/initialized (no id) → no response, per spec
  }
});
