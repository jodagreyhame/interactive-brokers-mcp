// MCP-safe logging utility that only uses stderr for actual errors
export class Logger {
  private static isStdioMode = !(process.env.MCP_HTTP_SERVER === 'true' || process.argv.includes('--http'));

  // For informational messages - suppressed in STDIO mode to avoid stderr pollution
  static log(message: string, ...args: any[]) {
    if (!Logger.isStdioMode) {
      console.log(message, ...args);
    }
    // In STDIO mode, completely suppress to avoid JSON-RPC interference
  }

  // Always log actual errors
  static error(message: string, ...args: any[]) {
    console.error(`[ERROR] ${message}`, ...args);
  }

  // Warnings only in non-STDIO mode
  static warn(message: string, ...args: any[]) {
    if (!Logger.isStdioMode) {
      console.warn(`[WARN] ${message}`, ...args);
    }
  }

  // Info messages - suppressed in STDIO mode
  static info(message: string, ...args: any[]) {
    if (!Logger.isStdioMode) {
      console.log(`[INFO] ${message}`, ...args);
    }
  }

  // Debug only when explicitly enabled and not in STDIO mode
  static debug(message: string, ...args: any[]) {
    if (process.env.DEBUG && !Logger.isStdioMode) {
      console.log(`[DEBUG] ${message}`, ...args);
    }
  }
}
