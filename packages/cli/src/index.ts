export {
  fingerprintTool,
  canonicalize,
  canonicalJson,
  classifyDrift,
  type ToolDef,
  type DriftResult,
  type DriftVerdict,
} from '@opensyber/mcp-watch-core';
export { fetchToolsList, type FetchToolsOpts } from './mcp-client.js';
export { Storage, defaultDbPath } from './storage.js';
export { loadConfig, saveConfig, defaultConfigPath, type WatchConfig, type ServerConfig } from './config.js';
export { scanOnce, watchLoop, type ScanResult, type WatchHandle } from './watcher.js';
export { formatAlertForConsole, type DriftAlert } from './alert.js';
