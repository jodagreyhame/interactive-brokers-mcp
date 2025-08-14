import { spawn, ChildProcess } from 'child_process';
import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));

export class IBGatewayManager {
  private gatewayProcess: ChildProcess | null = null;
  private gatewayDir: string;
  private isStarting = false;
  private isReady = false;

  constructor() {
    // Gateway directory is relative to the project root (one level up from src)
    this.gatewayDir = path.join(__dirname, '../ib-gateway');
  }

  async ensureGatewayExists(): Promise<void> {
    const gatewayPath = path.join(this.gatewayDir, 'clientportal.gw');
    const runScript = path.join(gatewayPath, 'bin/run.sh');
    
    try {
      await fs.access(runScript);
      console.log('✅ IB Gateway found at:', gatewayPath);
    } catch {
      throw new Error(`IB Gateway not found at ${gatewayPath}. Please ensure the gateway files are properly installed.`);
    }
  }

  async startGateway(): Promise<void> {
    if (this.isStarting || this.isReady) {
      console.log('Gateway is already starting or ready');
      return;
    }

    this.isStarting = true;
    
    try {
      await this.ensureGatewayExists();
      
      const runScript = path.join(this.gatewayDir, 'clientportal.gw/bin/run.sh');
      const configFile = 'root/conf.yaml'; // Use the default config in root directory

      console.log('🚀 Starting IB Gateway...');
      console.log('   Script:', runScript);
      console.log('   Config:', configFile);
      
      // Set environment variables for Java
      const env = {
        ...process.env,
        JAVA_OPTS: '-Djava.awt.headless=true -Xmx512m',
        // Ensure we have JAVA_HOME or try to detect it
        JAVA_HOME: process.env.JAVA_HOME || '/usr/lib/jvm/default-java'
      };

      // Check if we're on Windows and use the .bat file instead
      const isWindows = process.platform === 'win32';
      const scriptPath = isWindows 
        ? path.join(this.gatewayDir, 'clientportal.gw/bin/run.bat')
        : runScript;
      
      const command = isWindows ? scriptPath : 'bash';
      const args = isWindows ? [configFile] : [scriptPath, configFile];
      
      this.gatewayProcess = spawn(command, args, {
        cwd: path.join(this.gatewayDir, 'clientportal.gw'),
        env,
        stdio: ['ignore', 'pipe', 'pipe']
      });

      this.gatewayProcess.stdout?.on('data', (data) => {
        const output = data.toString().trim();
        if (output) {
          console.log(`[Gateway] ${output}`);
          // Check for startup completion indicators
          if (output.includes('Server ready') || output.includes('started on port')) {
            this.isReady = true;
            console.log('✅ IB Gateway is ready!');
          }
        }
      });

      this.gatewayProcess.stderr?.on('data', (data) => {
        const output = data.toString().trim();
        if (output && !output.includes('WARNING')) {
          console.error(`[Gateway Error] ${output}`);
        }
      });

      this.gatewayProcess.on('error', (error) => {
        console.error('❌ Gateway process error:', error.message);
        this.isStarting = false;
        this.isReady = false;
      });

      this.gatewayProcess.on('exit', (code, signal) => {
        console.log(`🛑 Gateway process exited with code ${code}, signal ${signal}`);
        this.gatewayProcess = null;
        this.isStarting = false;
        this.isReady = false;
      });

      // Wait for the gateway to be ready
      console.log('⏳ Waiting for IB Gateway to start...');
      await this.waitForGateway();
      
      this.isStarting = false;
      this.isReady = true;
      console.log('🎉 IB Gateway started successfully!');

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
          console.log('✅ IB Gateway is responding on port 5000');
          return;
        }
      } catch (error) {
        // Gateway not ready yet, continue waiting
      }

      attempts++;
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      if (attempts % 5 === 0) {
        console.log(`⏳ Still waiting for gateway... (${attempts}/${maxAttempts})`);
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
        port: 5000,
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
    if (this.gatewayProcess) {
      console.log('🛑 Stopping IB Gateway...');
      
      // Try graceful shutdown first
      this.gatewayProcess.kill('SIGTERM');
      
      // Wait a bit for graceful shutdown
      await new Promise(resolve => setTimeout(resolve, 3000));
      
      // Force kill if still running
      if (this.gatewayProcess && !this.gatewayProcess.killed) {
        console.log('🔨 Force killing IB Gateway...');
        this.gatewayProcess.kill('SIGKILL');
      }
      
      this.gatewayProcess = null;
      this.isReady = false;
      this.isStarting = false;
      console.log('✅ IB Gateway stopped');
    }
  }

  isGatewayReady(): boolean {
    return this.isReady && this.gatewayProcess !== null;
  }

  getGatewayUrl(): string {
    return 'https://localhost:5000';
  }
}

