export { fingerprintTool, canonicalize, canonicalJson, type ToolDef } from './fingerprint.js';
export { classifyDrift, type DriftResult, type DriftVerdict } from './differ.js';
export { fetchToolsList, type FetchToolsOpts } from './mcp-client.js';
export { Storage, defaultDbPath } from './storage.js';
export { loadConfig, saveConfig, defaultConfigPath, type WatchConfig, type ServerConfig } from './config.js';
export { scanOnce, watchLoop, type ScanResult, type WatchHandle } from './watcher.js';
export { formatAlertForConsole, type DriftAlert } from './alert.js';
