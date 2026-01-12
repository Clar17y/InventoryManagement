import { writeFileSync, appendFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';

const LOG_DIR = join(process.cwd(), 'logs', 'etsy');
const isEnabled = () => process.env.ETSY_DEBUG_LOG === 'true';

function ensureLogDir() {
  if (!existsSync(LOG_DIR)) {
    mkdirSync(LOG_DIR, { recursive: true });
  }
}

function getLogFilePath(): string {
  const date = new Date().toISOString().split('T')[0];
  return join(LOG_DIR, `etsy-debug-${date}.log`);
}

function formatTimestamp(): string {
  return new Date().toISOString();
}

function safeStringify(obj: unknown, indent = 2): string {
  try {
    return JSON.stringify(obj, null, indent);
  } catch {
    return String(obj);
  }
}

export function logDebug(category: string, message: string, data?: unknown): void {
  if (!isEnabled()) return;

  ensureLogDir();
  const timestamp = formatTimestamp();
  const logPath = getLogFilePath();

  let logEntry = `\n[${timestamp}] [${category}] ${message}`;
  if (data !== undefined) {
    logEntry += `\n${safeStringify(data)}`;
  }
  logEntry += '\n' + '─'.repeat(80);

  appendFileSync(logPath, logEntry);
  console.log(`[ETSY DEBUG] [${category}] ${message}`);
}

export function logApiRequest(
  method: string,
  endpoint: string,
  body?: unknown
): void {
  if (!isEnabled()) return;

  logDebug('API REQUEST', `${method} ${endpoint}`, body ? { body } : undefined);
}

export function logApiResponse(
  method: string,
  endpoint: string,
  status: number,
  data: unknown,
  durationMs: number
): void {
  if (!isEnabled()) return;

  logDebug('API RESPONSE', `${method} ${endpoint} → ${status} (${durationMs}ms)`, data);
}

export function logApiError(
  method: string,
  endpoint: string,
  status: number,
  error: unknown,
  durationMs: number
): void {
  if (!isEnabled()) return;

  logDebug('API ERROR', `${method} ${endpoint} → ${status} (${durationMs}ms)`, error);
}

export function logWorkflow(step: string, message: string, data?: unknown): void {
  if (!isEnabled()) return;

  logDebug(`WORKFLOW:${step}`, message, data);
}

export function startLogSession(sessionType: string): string {
  if (!isEnabled()) return '';

  const sessionId = `${sessionType}-${Date.now()}`;
  ensureLogDir();

  const logPath = getLogFilePath();
  const header = `\n${'='.repeat(80)}\n[${formatTimestamp()}] SESSION START: ${sessionId}\n${'='.repeat(80)}`;
  appendFileSync(logPath, header);

  console.log(`[ETSY DEBUG] Session started: ${sessionId}`);
  console.log(`[ETSY DEBUG] Log file: ${logPath}`);

  return sessionId;
}

export function endLogSession(sessionId: string, summary?: unknown): void {
  if (!isEnabled() || !sessionId) return;

  const logPath = getLogFilePath();
  let footer = `\n[${formatTimestamp()}] SESSION END: ${sessionId}`;
  if (summary) {
    footer += `\nSummary: ${safeStringify(summary)}`;
  }
  footer += `\n${'='.repeat(80)}\n`;
  appendFileSync(logPath, footer);

  console.log(`[ETSY DEBUG] Session ended: ${sessionId}`);
}
