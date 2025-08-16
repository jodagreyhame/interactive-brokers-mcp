import { spawn, ChildProcess } from 'child_process';
import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
import { Logger } from './logger.js';
import { PortUtils } from './utils/port-utils.js';
import { ConfigUtils } from './utils/config-utils.js';

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
  private backgroundStartupPromise: Promise<void> | null = null;

  constructor() {
    this.gatewayDir = path.join(__dirname, '../ib-gateway');
    this.jreDir = path.join(__dirname, '../runtime');
    this.useStderr = !(process.env.MCP_HTTP_SERVER === 'true' || process.argv.includes('--http'));
    this.registerCleanupHandlers();
  }

  private log(message: string) {
    Logger.info(message);
  }



  private async findExistingGateway(): Promise<number | null> {
    this.log('🔍 Checking for existing Gateway instances...');
    const existingPort = await PortUtils.findExistingGateway();
    if (existingPort) {
      this.log(`✅ Found existing Gateway on port ${existingPort}`);
    } else {
      this.log('🚫 No existing Gateway found');
    }
    return existingPort;
  }

  async quickCheckExistingGateway(): Promise<number | null> {
    this.log('⚡ Quick check for existing Gateway instances...');
    try {
      const existingPort = await PortUtils.findExistingGateway();
      if (existingPort) {
        this.log(`✅ Found existing Gateway on port ${existingPort}`);
      } else {
        this.log('⚡ Quick check complete - no existing Gateway found');
      }
      return existingPort;
    } catch (error) {
      this.log('⚡ Quick check failed, continuing...');
      return null;
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
      await ConfigUtils.cleanupTempConfigFiles(this.gatewayDir);
    } catch (error) {
      Logger.error('❌ Error during cleanup:', error);
      // Force kill as fallback
      this.forceKillGateway();
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

  // Public method for fast initialization (used during server startup)
  async quickStartGateway(): Promise<void> {
    this.log('⚡ Quick Gateway initialization...');
    
    // Quick check for existing Gateway (aggressive timeouts)
    const existingPort = await this.quickCheckExistingGateway();
    if (existingPort) {
      this.currentPort = existingPort;
      this.isReady = true;
      this.log(`✅ Using existing Gateway on port ${existingPort}`);
      return;
    }
    
    // No existing Gateway - start new one in background
    this.log('🚀 No existing Gateway found - starting new one in background...');
    this.startGatewayAsync();
  }
  
  // Start Gateway in background (non-blocking)
  startGatewayAsync(): void {
    if (this.backgroundStartupPromise) {
      this.log('Background Gateway startup already in progress');
      return;
    }
    
    // Wrap the startup in a promise that handles errors gracefully
    this.backgroundStartupPromise = (async () => {
      try {
        await this.startGatewayInternal();
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        this.log(`❌ Background Gateway startup failed: ${errorMessage}`);
        // Reset the promise so sync startup can be attempted later
        this.backgroundStartupPromise = null;
        throw error;
      }
    })();
    
    // Add unhandled rejection handler to prevent process termination
    this.backgroundStartupPromise.catch((error) => {
      // Error already logged above, just prevent unhandled rejection
    });
  }
  
  // Ensure Gateway is ready (used by tool handlers)
  async ensureGatewayReady(): Promise<void> {
    if (this.isReady) {
      return; // Already ready
    }
    
    this.log('⏳ Tool called - ensuring Gateway is ready...');
    
    // First, try to find existing Gateway again (might have started since init)
    const existingPort = await this.findExistingGateway();
    if (existingPort) {
      this.currentPort = existingPort;
      this.isReady = true;
      this.log(`✅ Found existing Gateway on port ${existingPort}`);
      return;
    }
    
    // Wait for background startup if it's running
    if (this.backgroundStartupPromise) {
      this.log('⏳ Waiting for background Gateway startup to complete...');
      try {
        await this.backgroundStartupPromise;
        if (this.isReady) {
          return;
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        this.log(`⚠️ Background startup failed, attempting synchronous start: ${errorMessage}`);
      }
    }
    
    // If no background startup or it failed, start synchronously
    this.log('⏳ Starting Gateway synchronously...');
    await this.startGatewayInternal();
  }
  
  // Backwards compatibility - redirect to quickStartGateway
  async startGateway(): Promise<void> {
    await this.quickStartGateway();
  }

  private async startGatewayInternal(): Promise<void> {
    if (this.isStarting || this.isReady) {
      this.log('Gateway is already starting or ready');
      return;
    }

    this.isStarting = true;
    
    try {
      await this.ensureGatewayExists();
      
      // Check port availability for new Gateway
      this.log('🔍 Checking port availability for new Gateway...');
      const defaultPort = 5000;
      
      if (await PortUtils.isPortAvailable(defaultPort)) {
        this.currentPort = defaultPort;
        this.log(`✅ Using default port ${defaultPort}`);
      } else {
        this.log(`❌ Default port ${defaultPort} is occupied, trying to find alternative...`);
        try {
          this.currentPort = await PortUtils.findAvailablePort(5001, 9); // Try 5001-5009
          this.log(`✅ Found alternative port ${this.currentPort}`);
          
          // Create a temporary config file with the new port
          await ConfigUtils.createTempConfigWithPort(this.gatewayDir, this.currentPort);
          this.log(`📝 Created temporary config file with port ${this.currentPort}`);
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

