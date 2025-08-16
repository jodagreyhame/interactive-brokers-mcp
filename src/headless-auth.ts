import puppeteer, { Browser, Page } from 'puppeteer';
import { Logger } from './logger.js';
import { IBClient } from './ib-client.js';

export interface HeadlessAuthConfig {
  url: string;
  username: string;
  password: string;
  timeout?: number;
  ibClient?: IBClient;
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

  async authenticate(config: HeadlessAuthConfig): Promise<HeadlessAuthResult> {
    try {
      Logger.info('🔐 Starting headless authentication...');

      // Launch browser in headless mode (puppeteer includes Chromium)
      this.browser = await puppeteer.launch({ 
        headless: true,
        // Accept self-signed certificates
        args: [
          '--ignore-certificate-errors', 
          '--ignore-ssl-errors', 
          '--disable-web-security',
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage'
        ]
      });

      this.page = await this.browser.newPage();
      
      // Set a longer timeout for navigation - several minutes for full auth process
      this.page.setDefaultTimeout(config.timeout || 300000); // 5 minutes default

      // Navigate to IB Gateway login page
      Logger.info(`🌐 Navigating to ${config.url}...`);
      await this.page.goto(config.url, { waitUntil: 'networkidle2' });

      // Wait for login form to be visible
      Logger.info('⏳ Waiting for login form...');
      await this.page.waitForSelector('input[name="user"], input[id="user"], input[type="text"]', { timeout: 30000 });

      // Find and fill username field
      const usernameSelector = 'input[name="user"], input[id="user"], input[type="text"]';
      await this.page.type(usernameSelector, config.username);
      Logger.info('✅ Username filled');

      // Find and fill password field
      const passwordSelector = 'input[name="password"], input[id="password"], input[type="password"]';
      await this.page.type(passwordSelector, config.password);
      Logger.info('✅ Password filled');

      // Look for submit button and click it
      const submitSelector = 'input[type="submit"], button[type="submit"], button';
      
      Logger.info('🔄 Submitting login form...');
      await this.page.click(submitSelector);

      // Wait for the authentication process to complete using IB client polling
      Logger.info('⏳ Waiting for authentication to complete...');
      
      const maxWaitTime = config.timeout || 300000; // 5 minutes default
      const startTime = Date.now();
      
      while (Date.now() - startTime < maxWaitTime) {
        await new Promise(resolve => setTimeout(resolve, 3000)); // Check every 3 seconds
        
        // Use IB Client to check authentication status if available
        if (config.ibClient) {
          try {
            const isAuthenticated = await config.ibClient.checkAuthenticationStatus();
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
      await this.cleanup();
      
      return {
        success: false,
        message: 'Headless authentication failed',
        error: error instanceof Error ? error.message : String(error)
      };
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
      
      return {
        success: false,
        message: 'Error while waiting for two-factor authentication',
        error: error instanceof Error ? error.message : String(error)
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
    } catch (error) {
      Logger.error('⚠️ Error during cleanup:', error);
    }
  }

  // Cleanup method that can be called externally
  async close(): Promise<void> {
    await this.cleanup();
  }
}
