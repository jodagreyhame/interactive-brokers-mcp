// Centralized logging utility that respects MCP STDIO mode
export class Logger {
  private static useStderr = !(process.env.MCP_HTTP_SERVER === 'true' || process.argv.includes('--http'));

  static log(message: string, ...args: any[]) {
    if (Logger.useStderr) {
      console.error(message, ...args);
    } else {
      console.log(message, ...args);
    }
  }

  static error(message: string, ...args: any[]) {
    console.error(message, ...args);
  }

  static warn(message: string, ...args: any[]) {
    console.error(message, ...args);
  }

  static info(message: string, ...args: any[]) {
    if (Logger.useStderr) {
      console.error(message, ...args);
    } else {
      console.log(message, ...args);
    }
  }

  // For development debugging - always goes to stderr
  static debug(message: string, ...args: any[]) {
    console.error(`[DEBUG] ${message}`, ...args);
  }
}
