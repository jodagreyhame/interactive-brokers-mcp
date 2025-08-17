import { execSync } from 'child_process';
import { existsSync } from 'fs';
import { Logger } from './logger.js';
import path from 'path';

export class BrowserInstaller {
  private static readonly CHROMIUM_PATHS = [
    '/usr/bin/chromium-browser',  // Alpine
    '/usr/bin/chromium',          // Debian/Ubuntu
    '/usr/bin/google-chrome',     // Chrome
    '/usr/bin/google-chrome-stable',
    '/opt/google/chrome/chrome',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', // macOS
  ];

  static detectChromiumPath(): string | null {
    Logger.debug('🔍 Detecting Chromium executable...');
    
    for (const path of this.CHROMIUM_PATHS) {
      if (existsSync(path)) {
        Logger.info(`✅ Found Chromium at: ${path}`);
        return path;
      }
    }
    
    Logger.warn('❌ No Chromium executable found in standard locations');
    return null;
  }

  static async installChromiumIfNeeded(autoInstall: boolean = false): Promise<string | null> {
    // If auto-install is enabled, we take over browser management from playwright
    if (autoInstall) {
      process.env.PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD = '1';
      Logger.debug('🎯 Auto-install enabled: setting PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1');
    }

    const existingPath = this.detectChromiumPath();
    if (existingPath) {
      return existingPath;
    }

    if (!autoInstall) {
      Logger.warn('🚫 Chromium not found and auto-install disabled');
      Logger.info('💡 Either install Chromium manually or set IB_AUTO_INSTALL_BROWSER=true');
      return null;
    }

    Logger.info('🔧 Chromium not found, attempting auto-installation...');
    
    try {
      // Check if we're on Alpine
      if (existsSync('/etc/alpine-release')) {
        await this.installChromiumAlpine();
        return this.detectChromiumPath();
      } else {
        Logger.error('❌ Auto-installation only supported on Alpine Linux currently');
        Logger.info('💡 To enable browser support:');
        Logger.info('   - Set IB_AUTO_INSTALL_BROWSER=true for Alpine containers');
        Logger.info('   - Or install Chromium manually: apt-get install chromium-browser');
        return null;
      }
    } catch (error) {
      Logger.error('❌ Failed to install Chromium:', error);
      return null;
    }
  }

  private static async installChromiumAlpine(): Promise<void> {
    Logger.info('🐳 Installing Chromium on Alpine Linux...');
    
    const scriptPath = path.join(__dirname, '..', 'install', 'install-chromium-alpine.sh');
    
    if (!existsSync(scriptPath)) {
      throw new Error(`Installation script not found: ${scriptPath}`);
    }

    try {
      const result = execSync(`sh "${scriptPath}"`, { 
        encoding: 'utf8',
        stdio: 'pipe'
      });
      
      Logger.info('📦 Chromium installation output:');
      result.split('\n').forEach(line => {
        if (line.trim()) {
          Logger.info(`   ${line}`);
        }
      });
      
      Logger.info('✅ Chromium installation completed');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new Error(`Chromium installation failed: ${errorMessage}`);
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
