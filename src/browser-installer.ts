import { chromium, Browser } from 'playwright-core';
import { Logger } from './logger.js';

export interface BrowserConnectionResult {
  browser: Browser;
  isRemote: boolean;
}

export class BrowserInstaller {
  /**
   * Connect to a remote browser if endpoint is provided
   */
  static async connectToRemoteBrowser(endpoint: string): Promise<Browser> {
    Logger.info(`🌐 Connecting to remote browser at ${endpoint}...`);
    try {
      const browser = await chromium.connect(endpoint);
      Logger.info('✅ Successfully connected to remote browser');
      return browser;
    } catch (error) {
      Logger.error(`❌ Failed to connect to remote browser: ${error}`);
      throw new Error(`Remote browser connection failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Launch a local browser using Playwright's default behavior
   */
  static async launchLocalBrowser(): Promise<Browser> {
    Logger.info('🔧 Starting local browser with Playwright...');
    try {
      const browser = await chromium.launch({
        headless: true,
        args: this.getChromiumLaunchArgs()
      });
      Logger.info('✅ Local browser started successfully');
      return browser;
    } catch (error) {
      Logger.error('❌ Failed to start local browser:', error);
      
      // Provide helpful error message
      const errorMessage = error instanceof Error ? error.message : String(error);
      const suggestions = [
        '- Use a remote browser: set IB_BROWSER_ENDPOINT=ws://browser:3000',
        '- Use a browser service: set IB_BROWSER_ENDPOINT=wss://chrome.browserless.io?token=YOUR_TOKEN',
        '- Install Chromium locally and let Playwright find it',
        '- Disable headless mode: set IB_HEADLESS_MODE=false'
      ];
      
      const helpText = `\n\nSuggestions:\n${suggestions.join('\n')}`;
      throw new Error(`Local browser startup failed: ${errorMessage}${helpText}`);
    }
  }

  static getChromiumLaunchArgs(): string[] {
    return [
      '--headless=new',
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--disable-web-security',
      '--ignore-certificate-errors',
      '--ignore-ssl-errors',
      '--disable-features=VizDisplayCompositor',
      '--disable-background-timer-throttling',
      '--disable-backgrounding-occluded-windows',
      '--disable-renderer-backgrounding',
    ];
  }
}