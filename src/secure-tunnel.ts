import { Logger } from './logger.js';
import crypto from 'crypto';
// @ts-ignore
import ngrok from 'ngrok';

export interface SecureTunnel {
  url: string;
  originalUrl: string;
  auth: string;
  cleanup: () => Promise<void>;
}

export class SecureTunnelManager {
  private static activeTunnels: Map<string, SecureTunnel> = new Map();

  /**
   * Creates a secure, time-limited tunnel for authentication
   */
  static async createSecureAuthTunnel(originalUrl: string, expiryMinutes: number = 15): Promise<SecureTunnel> {
    try {
      // Parse the original URL to get port
      const url = new URL(originalUrl);
      const port = parseInt(url.port) || (url.protocol === 'https:' ? 443 : 80);
      
      // Generate session-specific auth credentials
      const sessionId = crypto.randomUUID().slice(0, 8);
      const tempAuth = `auth_${Date.now()}_${sessionId}`;
      
      Logger.info(`🔒 Creating secure tunnel for ${originalUrl}...`);
      Logger.info(`🔒 Port: ${port}, Auth: ${tempAuth}, Expires: ${expiryMinutes} minutes`);
      
      // Create ngrok tunnel with authentication and expiry
      const tunnelUrl = await ngrok.connect({
        port: port,
        basic_auth: tempAuth,
        // Note: ngrok free tier doesn't support expires, but we'll implement our own timeout
        onStatusChange: (status: string) => {
          Logger.debug(`🔒 Tunnel status: ${status}`);
        },
        onLogEvent: (data: any) => {
          Logger.debug(`🔒 Tunnel log: ${JSON.stringify(data)}`);
        }
      });
      
      const tunnel: SecureTunnel = {
        url: tunnelUrl,
        originalUrl,
        auth: tempAuth,
        cleanup: async () => {
          Logger.info(`🔒 Cleaning up tunnel: ${tunnelUrl}`);
          await ngrok.disconnect(tunnelUrl);
          this.activeTunnels.delete(tunnelUrl);
        }
      };
      
      // Store active tunnel
      this.activeTunnels.set(tunnelUrl, tunnel);
      
      // Set up auto-cleanup after expiry
      setTimeout(async () => {
        if (this.activeTunnels.has(tunnelUrl)) {
          Logger.warn(`🔒 Tunnel expired, auto-cleaning up: ${tunnelUrl}`);
          await tunnel.cleanup();
        }
      }, expiryMinutes * 60 * 1000);
      
      Logger.info(`🔒 ✅ Secure tunnel created: ${tunnelUrl}`);
      Logger.info(`🔒 🔑 Basic auth credentials: ${tempAuth}`);
      Logger.info(`🔒 ⏰ Tunnel will expire in ${expiryMinutes} minutes`);
      
      return tunnel;
      
    } catch (error) {
      Logger.error('🔒 ❌ Failed to create secure tunnel:', error);
      throw new Error(`Failed to create secure tunnel: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Creates a secure tunnel URL from a localhost URL
   */
  static async createSecureTunnelUrl(localUrl: string, expiryMinutes: number = 15): Promise<string> {
    // Check if URL is localhost/127.0.0.1
    if (!this.isLocalUrl(localUrl)) {
      Logger.info(`🔒 URL is not localhost, returning as-is: ${localUrl}`);
      return localUrl;
    }

    const tunnel = await this.createSecureAuthTunnel(localUrl, expiryMinutes);
    
    // Replace localhost with tunnel URL, preserving path and query params
    const originalUrl = new URL(localUrl);
    const tunnelUrlObj = new URL(tunnel.url);
    
    // Construct the final URL with tunnel domain but original path/query
    const secureUrl = new URL(originalUrl.pathname + originalUrl.search, tunnel.url);
    
    Logger.info(`🔒 🌍 Converted ${localUrl} → ${secureUrl.toString()}`);
    return secureUrl.toString();
  }

  /**
   * Checks if a URL is a localhost URL
   */
  private static isLocalUrl(url: string): boolean {
    try {
      const urlObj = new URL(url);
      return urlObj.hostname === 'localhost' || 
             urlObj.hostname === '127.0.0.1' || 
             urlObj.hostname === '0.0.0.0';
    } catch {
      return false;
    }
  }

  /**
   * Cleanup all active tunnels
   */
  static async cleanupAllTunnels(): Promise<void> {
    Logger.info(`🔒 Cleaning up ${this.activeTunnels.size} active tunnels...`);
    
    const cleanupPromises = Array.from(this.activeTunnels.values()).map(tunnel => tunnel.cleanup());
    await Promise.all(cleanupPromises);
    
    this.activeTunnels.clear();
    Logger.info('🔒 ✅ All tunnels cleaned up');
  }

  /**
   * Get information about active tunnels
   */
  static getActiveTunnels(): Array<{url: string, originalUrl: string}> {
    return Array.from(this.activeTunnels.values()).map(tunnel => ({
      url: tunnel.url,
      originalUrl: tunnel.originalUrl
    }));
  }
}