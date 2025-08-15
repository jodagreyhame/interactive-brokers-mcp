import { spawn, ChildProcess, exec } from 'child_process';
import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
import { Logger } from './logger.js';
import os from 'os';
// No more runtime builder imports needed

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));

export class IBGatewayManager {
  private gatewayProcess: ChildProcess | null = null;
  private gatewayDir: string;
  private jreDir: string;
  private isStarting = false;
  private isReady = false;
  private useStderr: boolean;
  private cleanupHandlersRegistered = false;
  private currentPort: number = 5000;

  constructor() {
    // Gateway directory is relative to the project root (one level up from src)
    this.gatewayDir = path.join(__dirname, '../ib-gateway');
    // Runtime directory points to pre-built custom runtimes
    this.jreDir = path.join(__dirname, '../runtime');
    // Determine if we should use stderr for logging (STDIO mode)
    this.useStderr = !(process.env.MCP_HTTP_SERVER === 'true' || process.argv.includes('--http'));
    
    // Register cleanup handlers to ensure child processes are killed
    this.registerCleanupHandlers();
  }

  private log(message: string) {
    // Use Logger for MCP-safe logging
    Logger.info(message);
  }

  private async isPortAvailable(port: number): Promise<boolean> {
    return new Promise((resolve) => {
      const platform = os.platform();
      let command: string;
      
      // Use OS-specific commands to check if port is in use
      switch (platform) {
        case 'win32':
          // Windows: Use netstat to check if port is listening
          command = `netstat -an | findstr :${port}`;
          break;
        case 'darwin':
        case 'linux':
          // macOS/Linux: Use lsof to check if port is in use
          command = `lsof -i :${port}`;
          break;
        default:
          // Fallback for other platforms
          command = `netstat -an | grep :${port}`;
          break;
      }
      
      exec(command, (error, stdout, stderr) => {
        if (error) {
          // Command failed or no processes found using the port - port is available
          resolve(true);
        } else {
          // Command succeeded and found processes using the port - port is not available
          const output = stdout.trim();
          if (output === '') {
            // No output means port is available
            resolve(true);
          } else {
            // Output found means port is in use
            resolve(false);
          }
        }
      });
    });
  }

  private async findAvailablePort(startPort: number = 5000, maxAttempts: number = 10): Promise<number> {
    for (let i = 0; i < maxAttempts; i++) {
      const port = startPort + i;
      const available = await this.isPortAvailable(port);
      if (available) {
        this.log(`✅ Found available port: ${port}`);
        return port;
      }
      this.log(`❌ Port ${port} is already in use`);
    }
    throw new Error(`No available ports found in range ${startPort}-${startPort + maxAttempts - 1}`);
  }

  private async createTempConfigWithPort(port: number): Promise<void> {
    const originalConfigPath = path.join(this.gatewayDir, 'clientportal.gw/root/conf.yaml');
    const tempConfigPath = path.join(this.gatewayDir, `clientportal.gw/root/conf-${port}.yaml`);
    
    try {
      // Read the original config
      const content = await fs.readFile(originalConfigPath, 'utf8');
      // Replace the port
      const updatedContent = content.replace(/listenPort:\s*\d+/, `listenPort: ${port}`);
      // Write to temp config file
      await fs.writeFile(tempConfigPath, updatedContent, 'utf8');
      this.log(`📝 Created temporary config file with port ${port}`);
    } catch (error) {
      Logger.error(`❌ Failed to create temporary config file:`, error);
      throw error;
    }
  }

  private registerCleanupHandlers(): void {
    if (this.cleanupHandlersRegistered) {
      return;
    }

    this.cleanupHandlersRegistered = true;

    // Handle graceful shutdown signals
    const cleanup = async (signal: string) => {
      this.log(`🛑 Received ${signal}, cleaning up...`);
      await this.cleanup();
      process.exit(0);
    };

    // Handle different termination signals
    process.on('SIGINT', () => cleanup('SIGINT'));
    process.on('SIGTERM', () => cleanup('SIGTERM'));
    process.on('SIGHUP', () => cleanup('SIGHUP'));

    // Handle uncaught exceptions and unhandled rejections
    process.on('uncaughtException', async (error) => {
      Logger.error('❌ Uncaught Exception:', error);
      await this.cleanup();
      process.exit(1);
    });

    process.on('unhandledRejection', async (reason, promise) => {
      Logger.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
      await this.cleanup();
      process.exit(1);
    });

    // Handle normal process exit
    process.on('exit', (code) => {
      this.log(`🛑 Process exiting with code ${code}, ensuring cleanup...`);
      this.forceKillGateway();
    });

    // Handle when parent process dies (useful for child processes)
    process.on('disconnect', async () => {
      this.log('🛑 Parent process disconnected, cleaning up...');
      await this.cleanup();
      process.exit(0);
    });
  }

  private async cleanup(): Promise<void> {
    try {
      if (this.gatewayProcess) {
        this.log('🧹 Cleaning up gateway process...');
        await this.stopGateway();
      }
      
      // Clean up temporary config files
      await this.cleanupTempConfigFiles();
    } catch (error) {
      Logger.error('❌ Error during cleanup:', error);
      // Force kill as fallback
      this.forceKillGateway();
    }
  }

  private async cleanupTempConfigFiles(): Promise<void> {
    try {
      const configDir = path.join(this.gatewayDir, 'clientportal.gw/root');
      const files = await fs.readdir(configDir);
      
      for (const file of files) {
        if (file.match(/^conf-\d+\.yaml$/)) {
          const filePath = path.join(configDir, file);
          await fs.unlink(filePath);
          this.log(`🗑️ Cleaned up temporary config file: ${file}`);
        }
      }
    } catch (error) {
      // Don't throw errors for cleanup failures
      this.log(`⚠️ Warning: Could not clean up temporary config files: ${error}`);
    }
  }

  private forceKillGateway(): void {
    if (this.gatewayProcess && !this.gatewayProcess.killed) {
      this.log('🔨 Force killing gateway process...');
      try {
        this.gatewayProcess.kill('SIGKILL');
      } catch (error) {
        Logger.error('❌ Error force killing gateway:', error);
      }
      this.gatewayProcess = null;
      this.isReady = false;
      this.isStarting = false;
    }
  }

  private getJavaPath(): string {
    const platform = `${process.platform}-${process.arch}`;
    const isWindows = process.platform === 'win32';
    const javaExecutable = isWindows ? 'java.exe' : 'java';
    
    const runtimePath = path.join(this.jreDir, platform, 'bin', javaExecutable);
    
    if (!require('fs').existsSync(runtimePath)) {
      throw new Error(`Custom runtime not found for platform: ${platform}. Expected at: ${runtimePath}`);
    }
    
    return runtimePath;
  }

  async ensureGatewayExists(): Promise<void> {
    const gatewayPath = path.join(this.gatewayDir, 'clientportal.gw');
    const runScript = path.join(gatewayPath, 'bin/run.sh');
    
    try {
      await fs.access(runScript);
      this.log('✅ IB Gateway found at:' + gatewayPath);
    } catch {
      throw new Error(`IB Gateway not found at ${gatewayPath}. Please ensure the gateway files are properly installed.`);
    }
  }

  async startGateway(): Promise<void> {
    if (this.isStarting || this.isReady) {
      this.log('Gateway is already starting or ready');
      return;
    }

    this.isStarting = true;
    
    try {
      await this.ensureGatewayExists();
      
      // Check if default port 5000 is available, if not try to find an alternative
      this.log('🔍 Checking port availability...');
      const defaultPort = 5000;
      
      if (await this.isPortAvailable(defaultPort)) {
        this.currentPort = defaultPort;
        this.log(`✅ Using default port ${defaultPort}`);
      } else {
        this.log(`❌ Default port ${defaultPort} is occupied, trying to find alternative...`);
        try {
          this.currentPort = await this.findAvailablePort(5001, 9); // Try 5001-5009
          this.log(`✅ Found alternative port ${this.currentPort}`);
          
          // Since IB Gateway doesn't support port override via command line,
          // we'll need to create a temporary config file with the new port
          await this.createTempConfigWithPort(this.currentPort);
        } catch (error) {
          this.log(`❌ No alternative ports available, will try with default port anyway`);
          this.currentPort = defaultPort;
        }
      }
      
      const bundledJavaPath = this.getJavaPath();
      const bundledJavaHome = path.dirname(path.dirname(bundledJavaPath));
      
      const configFile = this.currentPort === defaultPort ? 'root/conf.yaml' : `root/conf-${this.currentPort}.yaml`;
      const jarPath = path.join(this.gatewayDir, 'clientportal.gw/dist/ibgroup.web.core.iblink.router.clientportal.gw.jar');
      const runtimePath = path.join(this.gatewayDir, 'clientportal.gw/build/lib/runtime/*');
      const configDir = path.join(this.gatewayDir, 'clientportal.gw/root');
      
      const classpath = `${configDir}:${jarPath}:${runtimePath}`;

      this.log('🚀 Starting IB Gateway with bundled JRE...');
      this.log('   Java: ' + bundledJavaPath);
      this.log('   Config: ' + configFile);
      this.log('   Port: ' + this.currentPort);
      
      this.gatewayProcess = spawn(bundledJavaPath, [
        '-server',
        '-Djava.awt.headless=true',
        '-Xmx512m',
        '-Dvertx.disableDnsResolver=true',
        '-Djava.net.preferIPv4Stack=true',
        '-Dvertx.logger-delegate-factory-class-name=io.vertx.core.logging.SLF4JLogDelegateFactory',
        '-Dnologback.statusListenerClass=ch.qos.logback.core.status.OnConsoleStatusListener',
        '-Dnolog4j.debug=true',
        '-Dnolog4j2.debug=true',
        '-cp', classpath,
        'ibgroup.web.core.clientportal.gw.GatewayStart',
        '--conf', `../${configFile}`
      ], {
        cwd: path.join(this.gatewayDir, 'clientportal.gw'),
        env: {
          ...process.env,
          JAVA_HOME: bundledJavaHome
        },
        stdio: ['ignore', 'pipe', 'pipe']
      });

      this.gatewayProcess.stdout?.on('data', (data) => {
        const output = data.toString().trim();
        if (output) {
          this.log(`[Gateway] ${output}`);
          // Check for startup completion indicators
          if (output.includes('Server ready') || output.includes('started on port')) {
            this.isReady = true;
            this.log('✅ IB Gateway is ready!');
          }
        }
      });

      this.gatewayProcess.stderr?.on('data', (data) => {
        const output = data.toString().trim();
        if (output && !output.includes('WARNING')) {
          Logger.error(`[Gateway Error] ${output}`);
        }
      });

      this.gatewayProcess.on('error', (error) => {
        Logger.error('❌ Gateway process error:', error.message);
        this.isStarting = false;
        this.isReady = false;
      });

      this.gatewayProcess.on('exit', (code, signal) => {
        this.log(`🛑 Gateway process exited with code ${code}, signal ${signal}`);
        this.gatewayProcess = null;
        this.isStarting = false;
        this.isReady = false;
      });

      // Wait for the gateway to be ready
      this.log('⏳ Waiting for IB Gateway to start...');
      await this.waitForGateway();
      
      this.isStarting = false;
      this.isReady = true;
      this.log('🎉 IB Gateway started successfully!');

    } catch (error) {
      this.isStarting = false;
      this.isReady = false;
      throw error;
    }
  }

  private async waitForGateway(): Promise<void> {
    const maxAttempts = 30; // 30 seconds
    let attempts = 0;

    while (attempts < maxAttempts) {
      try {
        // Try to connect to the gateway port
        const response = await this.checkGatewayHealth();
        if (response) {
          this.log(`✅ IB Gateway is responding on port ${this.currentPort}`);
          return;
        }
      } catch (error) {
        // Gateway not ready yet, continue waiting
      }

      attempts++;
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      if (attempts % 5 === 0) {
        this.log(`⏳ Still waiting for gateway... (${attempts}/${maxAttempts})`);
      }
    }

    throw new Error('IB Gateway failed to start within 30 seconds');
  }

  private async checkGatewayHealth(): Promise<boolean> {
    // Import https dynamically to avoid issues with module resolution
    const https = await import('https');
    
    return new Promise((resolve, reject) => {
      const options = {
        hostname: 'localhost',
        port: this.currentPort,
        path: '/',
        method: 'GET',
        rejectUnauthorized: false, // Accept self-signed certificates
        timeout: 5000
      };

      const req = https.request(options, (res) => {
        resolve(res.statusCode === 200 || res.statusCode === 401 || res.statusCode === 302);
      });

      req.on('error', () => {
        resolve(false);
      });

      req.on('timeout', () => {
        req.destroy();
        resolve(false);
      });

      req.end();
    });
  }

  async stopGateway(): Promise<void> {
    if (!this.gatewayProcess) {
      return;
    }

    this.log('🛑 Stopping IB Gateway...');
    
    return new Promise<void>((resolve) => {
      const process = this.gatewayProcess!;
      let resolved = false;

      const cleanup = () => {
        if (!resolved) {
          resolved = true;
          this.gatewayProcess = null;
          this.isReady = false;
          this.isStarting = false;
          this.log('✅ IB Gateway stopped');
          resolve();
        }
      };

      // Listen for process exit
      process.once('exit', cleanup);
      process.once('close', cleanup);

      // Try graceful shutdown first
      try {
        process.kill('SIGTERM');
      } catch (error) {
        this.log(`⚠️ Error sending SIGTERM: ${error}`);
      }
      
      // Set up force kill timeout
      const forceKillTimeout = setTimeout(() => {
        if (process && !process.killed) {
          this.log('🔨 Force killing IB Gateway...');
          try {
            process.kill('SIGKILL');
          } catch (error) {
            this.log(`⚠️ Error force killing: ${error}`);
          }
        }
        cleanup();
      }, 5000); // Increased timeout to 5 seconds

      // Clean up timeout if process exits gracefully
      process.once('exit', () => {
        clearTimeout(forceKillTimeout);
      });
    });
  }

  isGatewayReady(): boolean {
    return this.isReady && this.gatewayProcess !== null;
  }

  getGatewayUrl(): string {
    return `https://localhost:${this.currentPort}`;
  }

  getCurrentPort(): number {
    return this.currentPort;
  }
}

