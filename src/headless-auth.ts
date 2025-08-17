import { chromium, Browser, Page } from 'playwright-core';
import { Logger } from './logger.js';
import { IBClient } from './ib-client.js';
import { BrowserInstaller } from './browser-installer.js';
import { SecureTunnelManager } from './secure-tunnel.js';

export interface HeadlessAuthConfig {
  url: string;
  username: string;
  password: string;
  timeout?: number;
  ibClient?: IBClient;
  browserEndpoint?: string; // Remote browser URL if provided
}

export interface HeadlessAuthResult {
  success: boolean;
  message: string;
  waitingFor2FA?: boolean;
  error?: string;
}

export class HeadlessAuthenticator {
  private browser: Browser | null = null;
  private page: Page | null = null;
  private activeTunnel: any = null;

  async authenticate(authConfig: HeadlessAuthConfig): Promise<HeadlessAuthResult> {
    try {
      Logger.info('🔐 Starting headless authentication...');
      
      // Log the full auth config for debugging (excluding sensitive data)
      const logConfig = { ...authConfig };
      if (logConfig.password) logConfig.password = '[REDACTED]';
      Logger.info(`🔍 Authentication config: ${JSON.stringify(logConfig, null, 2)}`);
      
      // Setup browser - remote if endpoint provided, otherwise local
      Logger.info(`🔍 Browser endpoint check: ${authConfig.browserEndpoint ? `"${authConfig.browserEndpoint}"` : 'undefined/empty'}`);
      
      let finalAuthUrl = authConfig.url;
      
      if (authConfig.browserEndpoint) {
        // Use remote browser - need to create secure tunnel for localhost URLs
        Logger.info(`🌐 Using remote browser at: ${authConfig.browserEndpoint}`);
        
        // Check if we need to create a secure tunnel for localhost
        if (this.isLocalUrl(authConfig.url)) {
          Logger.info('🔒 Remote browser with localhost URL detected - creating secure tunnel...');
          try {
            this.activeTunnel = await SecureTunnelManager.createSecureAuthTunnel(authConfig.url, 15);
            finalAuthUrl = this.activeTunnel.url;
            Logger.info(`🔒 ✅ Using secure tunnel: ${finalAuthUrl}`);
            Logger.info(`🔒 🔑 Tunnel auth: ${this.activeTunnel.auth}`);
          } catch (tunnelError) {
            Logger.error('🔒 ❌ Failed to create secure tunnel:', tunnelError);
            throw new Error(`Failed to create secure tunnel for remote browser: ${tunnelError}`);
          }
        } else {
          Logger.info('🌐 Remote browser with public URL - no tunnel needed');
        }
        
        this.browser = await BrowserInstaller.connectToRemoteBrowser(authConfig.browserEndpoint);
      } else {
        // Use local browser - let Playwright handle everything
        Logger.info('🔧 Using local browser (Playwright default)');
        this.browser = await BrowserInstaller.launchLocalBrowser();
      }

      this.page = await this.browser.newPage();
      
      // If we have a tunnel with auth, we need to set up basic auth
      if (this.activeTunnel) {
        Logger.info('🔒 Setting up basic authentication for secure tunnel...');
        const [username, password] = this.activeTunnel.auth.split(':');
        await this.page.setExtraHTTPHeaders({
          'Authorization': `Basic ${Buffer.from(this.activeTunnel.auth).toString('base64')}`
        });
      }
      
      // Set a longer timeout for navigation - several minutes for full auth process
      this.page.setDefaultTimeout(authConfig.timeout || 300000); // 5 minutes default

      // Navigate to IB Gateway login page (using tunnel URL if created)
      Logger.info(`🌐 Navigating to ${finalAuthUrl}...`);
      await this.page.goto(finalAuthUrl, { waitUntil: 'networkidle' });

      // Wait for login form to be visible
      Logger.info('⏳ Waiting for login form...');
      await this.page.waitForSelector('input[name="user"], input[id="user"], input[type="text"]', { timeout: 30000 });

      // Find and fill username field
      const usernameSelector = 'input[name="user"], input[id="user"], input[type="text"]';
      await this.page.fill(usernameSelector, authConfig.username);
      Logger.info('✅ Username filled');

      // Find and fill password field
      const passwordSelector = 'input[name="password"], input[id="password"], input[type="password"]';
      await this.page.fill(passwordSelector, authConfig.password);
      Logger.info('✅ Password filled');

      // Look for submit button and click it
      const submitSelector = 'input[type="submit"], button[type="submit"], button';
      
      Logger.info('🔄 Submitting login form...');
      await this.page.click(submitSelector);

      // Wait for the authentication process to complete using IB client polling
      Logger.info('⏳ Waiting for authentication to complete...');
      
      const maxWaitTime = authConfig.timeout || 300000; // 5 minutes default
      const startTime = Date.now();
      
      while (Date.now() - startTime < maxWaitTime) {
        await new Promise(resolve => setTimeout(resolve, 3000)); // Check every 3 seconds
        
        // Use IB Client to check authentication status if available
        if (authConfig.ibClient) {
          try {
            const isAuthenticated = await authConfig.ibClient.checkAuthenticationStatus();
            if (isAuthenticated) {
              Logger.info('🎉 Authentication completed! IB Client confirmed authentication.');
              await this.cleanup();
              
              return {
                success: true,
                message: 'Headless authentication completed successfully. IB Client confirmed authentication.'
              };
            }
          } catch (error) {
            Logger.debug('IB Client auth check failed, continuing...', error);
          }
        }
        
        // Fallback to page content checking if no IB client or client check fails
        try {
          const currentUrl = this.page.url();
          const pageContent = await this.page.content();

          // Check if we successfully authenticated by looking for the specific success message
          const authSuccess = pageContent.includes('Client login succeeds');

          if (authSuccess) {
            Logger.info('🎉 Authentication completed! Found "Client login succeeds" message.');
            await this.cleanup();
            
            return {
              success: true,
              message: 'Headless authentication completed successfully. Client login succeeds message detected.'
            };
          }

          // Check for potential 2FA or other intermediate states
          const has2FAIndicators = 
            pageContent.includes('two-factor') ||
            pageContent.includes('2FA') ||
            pageContent.includes('authentication') ||
            pageContent.includes('verification') ||
            pageContent.includes('code') ||
            currentUrl.includes('sso');

          if (has2FAIndicators) {
            Logger.info('🔐 Two-factor authentication detected - continuing to wait...');
          } else {
            Logger.info(`🔍 Still waiting for authentication completion... (${Math.round((Date.now() - startTime) / 1000)}s elapsed)`);
          }
        } catch (pageError) {
          Logger.warn('Page content check failed, continuing with IB client checks only...', pageError);
          // Continue with just IB client checks if page becomes unavailable
        }
      }

      // Timeout reached without seeing success message
      Logger.warn('⏰ Authentication timeout reached without seeing "Client login succeeds"');
      
      return {
        success: false,
        message: 'Authentication timeout. Did not detect "Client login succeeds" message within the timeout period.',
        error: 'Authentication timeout - success message not detected'
      };

    } catch (error) {
      Logger.error('❌ Headless authentication failed:', error);
      Logger.error('Environment info:', {
        platform: process.platform,
        arch: process.arch,
        nodeVersion: process.version
      });
      await this.cleanup();
      
      const errorMessage = error instanceof Error ? error.message : String(error);
      const errorDetails = error instanceof Error ? error.stack : 'No stack trace available';
      
      return {
        success: false,
        message: 'Headless authentication failed',
        error: `${errorMessage}\n\nStack trace:\n${errorDetails}\n\nEnvironment: ${process.platform}-${process.arch}, Node: ${process.version}`
      };
    }
  }

  /**
   * Check if a URL is a localhost URL
   */
  private isLocalUrl(url: string): boolean {
    try {
      const urlObj = new URL(url);
      return urlObj.hostname === 'localhost' || 
             urlObj.hostname === '127.0.0.1' || 
             urlObj.hostname === '0.0.0.0';
    } catch {
      return false;
    }
  }

  async waitForAuthentication(maxWaitTime: number = 300000, ibClient?: IBClient): Promise<HeadlessAuthResult> {
    if (!this.page) {
      return {
        success: false,
        message: 'No active browser session',
        error: 'Browser session not found'
      };
    }

    try {
      Logger.info('⏳ Waiting for 2FA completion...');
      
      // Poll for authentication completion
      const startTime = Date.now();
      while (Date.now() - startTime < maxWaitTime) {
        // Use IB Client to check authentication status if available
        if (ibClient) {
          try {
            const isAuthenticated = await ibClient.checkAuthenticationStatus();
            if (isAuthenticated) {
              Logger.info('🎉 Authentication completed! IB Client confirmed authentication.');
              await this.cleanup();
              
              return {
                success: true,
                message: 'Authentication completed successfully. IB Client confirmed authentication.'
              };
            }
          } catch (error) {
            Logger.debug('IB Client auth check failed during 2FA wait, continuing...', error);
          }
        }

        // Fallback to page content checking
        try {
          const currentUrl = this.page.url();
          const pageContent = await this.page.content();

          // Check if authentication is complete by looking for the specific success message
          const authSuccess = pageContent.includes('Client login succeeds');

          if (authSuccess) {
            Logger.info('🎉 Authentication completed! Found "Client login succeeds" message.');
            await this.cleanup();
            
            return {
              success: true,
              message: 'Authentication completed successfully. Client login succeeds message detected.'
            };
          }
        } catch (pageError) {
          Logger.warn('Page content check failed during 2FA wait, continuing with IB client checks only...', pageError);
        }

        // Wait before next check
        await new Promise(resolve => setTimeout(resolve, 5000));
      }

      // Timeout reached
      Logger.warn('⏰ 2FA timeout reached');
      await this.cleanup();
      
      return {
        success: false,
        message: 'Two-factor authentication timeout. Please try again.',
        error: 'Authentication timeout'
      };

    } catch (error) {
      Logger.error('❌ Error waiting for 2FA:', error);
      await this.cleanup();
      
      const errorMessage = error instanceof Error ? error.message : String(error);
      const errorDetails = error instanceof Error ? error.stack : 'No stack trace available';
      
      return {
        success: false,
        message: 'Error while waiting for two-factor authentication',
        error: `${errorMessage}\n\nStack trace:\n${errorDetails}`
      };
    }
  }

  private async cleanup(): Promise<void> {
    try {
      if (this.page) {
        await this.page.close();
        this.page = null;
      }
      if (this.browser) {
        await this.browser.close();
        this.browser = null;
      }
      // Clean up tunnel if created
      if (this.activeTunnel) {
        Logger.info('🔒 Cleaning up secure tunnel...');
        await this.activeTunnel.cleanup();
        this.activeTunnel = null;
      }
    } catch (error) {
      Logger.error('⚠️ Error during cleanup:', error);
    }
  }

  // Cleanup method that can be called externally
  async close(): Promise<void> {
    await this.cleanup();
  }

}