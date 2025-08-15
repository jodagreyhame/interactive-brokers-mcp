import { appendFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

// File-based logging utility that never interferes with MCP protocol
export class Logger {
  private static logDir = process.env.IB_MCP_LOG_DIR || join(homedir(), '.ib-mcp');
  private static logFile = join(Logger.logDir, 'ib-mcp.log');
  private static enableLogging = process.env.IB_MCP_DISABLE_LOGGING !== 'true';

  private static ensureLogDir() {
    if (Logger.enableLogging && !existsSync(Logger.logDir)) {
      try {
        mkdirSync(Logger.logDir, { recursive: true });
      } catch (error) {
        // If we can't create log dir, disable logging
        Logger.enableLogging = false;
      }
    }
  }

  private static writeToFile(level: string, message: string, ...args: any[]) {
    if (!Logger.enableLogging) return;
    
    try {
      Logger.ensureLogDir();
      const timestamp = new Date().toISOString();
      const argsStr = args.length > 0 ? ' ' + args.map(arg => 
        typeof arg === 'object' ? JSON.stringify(arg) : String(arg)
      ).join(' ') : '';
      const logLine = `${timestamp} [${level}] ${message}${argsStr}\n`;
      appendFileSync(Logger.logFile, logLine, 'utf8');
    } catch (error) {
      // Silently fail to avoid recursive logging issues
    }
  }

  static log(message: string, ...args: any[]) {
    Logger.writeToFile('LOG', message, ...args);
  }

  static error(message: string, ...args: any[]) {
    Logger.writeToFile('ERROR', message, ...args);
  }

  static info(message: string, ...args: any[]) {
    Logger.writeToFile('INFO', message, ...args);
  }

  static debug(message: string, ...args: any[]) {
    if (process.env.DEBUG) {
      Logger.writeToFile('DEBUG', message, ...args);
    }
  }

  static critical(message: string, ...args: any[]) {
    Logger.writeToFile('CRITICAL', message, ...args);
  }

  static warn(message: string, ...args: any[]) {
    Logger.writeToFile('WARN', message, ...args);
  }

  // Get the current log file path (useful for debugging)
  static getLogFile(): string | null {
    return Logger.enableLogging ? Logger.logFile : null;
  }

  // Log a startup message with log file location
  static logStartup() {
    if (Logger.enableLogging) {
      Logger.info(`IB MCP Server started - logging to: ${Logger.logFile}`);
    }
  }
}
