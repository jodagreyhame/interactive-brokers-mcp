import { config as dotenvConfig } from "dotenv";

// Load environment variables
dotenvConfig();

export const config = {
  IB_GATEWAY_HOST: process.env.IB_GATEWAY_HOST || "localhost",
  IB_GATEWAY_PORT: parseInt(process.env.IB_GATEWAY_PORT || "5000"),
  IB_ACCOUNT: process.env.IB_ACCOUNT || "",
  IB_PASSWORD: process.env.IB_PASSWORD || "",
  TRADING_MODE: process.env.TRADING_MODE || "paper",
  MCP_SERVER_PORT: parseInt(process.env.MCP_SERVER_PORT || "3000"),
} as const;


