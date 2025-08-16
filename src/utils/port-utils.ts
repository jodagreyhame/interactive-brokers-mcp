import { exec } from 'child_process';
import os from 'os';
import { Logger } from '../logger';

export class PortUtils {
  static async isPortAvailable(port: number): Promise<boolean> {
    return new Promise((resolve) => {
      const platform = os.platform();
      let command: string;
      
      // Use OS-specific commands to check if port is in use
      switch (platform) {
        case 'win32':
          command = `netstat -an | findstr :${port}`;
          break;
        case 'darwin':
        case 'linux':
          command = `lsof -i :${port}`;
          break;
        default:
          command = `netstat -an | grep :${port}`;
          break;
      }
      
      exec(command, (error, stdout) => {
        if (error) {
          // Command failed or no processes found using the port - port is available
          resolve(true);
        } else {
          // Command succeeded and found processes using the port - port is not available
          const output = stdout.trim();
          resolve(output === '');
        }
      });
    });
  }

  static async findAvailablePort(startPort: number = 5000, maxAttempts: number = 10): Promise<number> {
    for (let i = 0; i < maxAttempts; i++) {
      const port = startPort + i;
      const available = await this.isPortAvailable(port);
      if (available) {
        return port;
      }
    }
    throw new Error(`No available ports found in range ${startPort}-${startPort + maxAttempts - 1}`);
  }

  static async isGatewayProcess(port: number): Promise<boolean> {
    return new Promise((resolve) => {
      const platform = os.platform();
      let command: string;
      
      switch (platform) {
        case 'win32':
          command = `netstat -ano | findstr :${port}`;
          break;
        case 'darwin':
          command = `lsof -i :${port} -n -P`;
          break;
        case 'linux':
          command = `ss -tlnp | grep :${port} || netstat -tlnp | grep :${port}`;
          break;
        default:
          command = `lsof -i :${port} -n -P`;
          break;
      }
      
      exec(command, (error, stdout) => {
        if (error || !stdout.trim()) {
          resolve(false);
          return;
        }
        
        const output = stdout.toLowerCase();
        Logger.info(`Existing process running on port ${port}: ${output}`);
        // Look for indicators that this is likely a Gateway process
        const gatewayIndicators = [
          'java',           // Gateway runs on Java
          'clientportal',   // Gateway directory/process name
          'gateway',        // Generic gateway indicator
          'ib',            // Interactive Brokers
        ];
        
        const isGateway = gatewayIndicators.some(indicator => output.includes(indicator));
        resolve(isGateway);
      });
    });
  }

  static async findExistingGateway(): Promise<number | null> {
    const commonPorts = [5000, 5001, 5002, 5003, 5004, 5005];
    
    for (const port of commonPorts) {
      const isInUse = !(await this.isPortAvailable(port));
      if (isInUse) {
        const isGateway = await this.isGatewayProcess(port);
        if (isGateway) {
          return port;
        }
      }
    }
    
    return null;
  }
}
