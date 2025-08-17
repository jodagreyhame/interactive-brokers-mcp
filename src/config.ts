import { config as dotenvConfig } from "dotenv";

// Load environment variables
dotenvConfig();

export const config = {
  IB_GATEWAY_HOST: process.env.IB_GATEWAY_HOST || "localhost",
  IB_GATEWAY_PORT: parseInt(process.env.IB_GATEWAY_PORT || "5000"),
  IB_ACCOUNT: process.env.IB_ACCOUNT || "",
  IB_PASSWORD: process.env.IB_PASSWORD || "",
  
  // Headless authentication configuration
  IB_USERNAME: process.env.IB_USERNAME || "",
  IB_PASSWORD_AUTH: process.env.IB_PASSWORD_AUTH || process.env.IB_PASSWORD || "",
  IB_AUTH_TIMEOUT: parseInt(process.env.IB_AUTH_TIMEOUT || "60000"),
  IB_HEADLESS_MODE: process.env.IB_HEADLESS_MODE === "true",
  
  // Browser configuration
  IB_BROWSER_ENDPOINT: process.env.IB_BROWSER_ENDPOINT || "", // e.g., "ws://browser:3000" or "wss://chrome.browserless.io"
};