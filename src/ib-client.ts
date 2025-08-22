import axios, { AxiosInstance, AxiosRequestConfig } from "axios";
import https from "https";
import { Logger } from "./logger.js";

interface ExtendedAxiosRequestConfig extends AxiosRequestConfig {
  metadata?: { requestId: string };
}

export interface IBClientConfig {
  host: string;
  port: number;
}

export interface OrderRequest {
  accountId: string;
  symbol: string;
  action: "BUY" | "SELL";
  orderType: "MKT" | "LMT" | "STP";
  quantity: number;
  price?: number;
  stopPrice?: number;
  suppressConfirmations?: boolean;
}

const isError = (error: unknown): error is Error => {
  return error instanceof Error;
};

export class IBClient {
  private client!: AxiosInstance;
  private baseUrl!: string;
  private config: IBClientConfig;
  private isAuthenticated = false;
  private authAttempts = 0;
  private maxAuthAttempts = 3;

  constructor(config: IBClientConfig) {
    this.config = config;
    this.initializeClient();
  }

  private initializeClient(): void {
    // Use HTTPS as IB Gateway expects it
    this.baseUrl = `https://${this.config.host}:${this.config.port}/v1/api`;
    this.client = axios.create({
      baseURL: this.baseUrl,
      timeout: 30000,
      // Allow self-signed certificates
      httpsAgent: new https.Agent({
        rejectUnauthorized: false,
      }),
    });

    // Add request interceptor to ensure authentication and log requests
    this.client.interceptors.request.use(async (config) => {
      const requestId = Math.random().toString(36).substr(2, 9);
      Logger.log(`[REQUEST-${requestId}] ${config.method?.toUpperCase()} ${config.url}`, {
        baseURL: config.baseURL,
        timeout: config.timeout,
        headers: config.headers,
        data: config.data
      });
      
      if (!this.isAuthenticated) {
        Logger.log(`[REQUEST-${requestId}] Not authenticated, authenticating... (attempt ${this.authAttempts + 1}/${this.maxAuthAttempts})`);
        if (this.authAttempts >= this.maxAuthAttempts) {
          throw new Error(`Max authentication attempts (${this.maxAuthAttempts}) exceeded`);
        }
        await this.authenticate();
      }
      
      // Store requestId for response logging
      (config as ExtendedAxiosRequestConfig).metadata = { requestId };
      return config;
    });

    // Add response interceptor for logging
    this.client.interceptors.response.use(
      (response) => {
        const requestId = (response.config as ExtendedAxiosRequestConfig).metadata?.requestId || 'unknown';
        Logger.log(`[RESPONSE-${requestId}] ${response.status} ${response.statusText}`, {
          url: response.config.url,
          responseSize: JSON.stringify(response.data).length,
          headers: response.headers,
          dataPreview: JSON.stringify(response.data).substring(0, 500) + '...'
        });
        return response;
      },
      (error) => {
        const requestId = (error.config as ExtendedAxiosRequestConfig)?.metadata?.requestId || 'unknown';
          Logger.error(`[ERROR-${requestId}] Request failed:`, {
          url: error.config?.url,
          status: error.response?.status,
          statusText: error.response?.statusText,
          message: error.message,
          responseData: error.response?.data
        });
        return Promise.reject(error);
      }
    );
  }

  updatePort(newPort: number): void {
    if (this.config.port !== newPort) {
      Logger.log(`[CLIENT] Updating port from ${this.config.port} to ${newPort}`);
      this.config.port = newPort;
      this.isAuthenticated = false; // Force re-authentication with new port
      this.authAttempts = 0; // Reset auth attempts
      this.initializeClient(); // Re-initialize client with new port
    }
  }

  /**
   * Check authentication status with IB Gateway without triggering automatic authentication
   */
  async checkAuthenticationStatus(): Promise<boolean> {
    try {
      Logger.log("[AUTH-CHECK] Checking authentication status...");
      
      // Create a new axios instance without interceptors to avoid triggering authentication
      const authClient = axios.create({
        baseURL: this.baseUrl,
        timeout: 30000,
        httpsAgent: new https.Agent({
          rejectUnauthorized: false,
        }),
      });
      
      const response = await authClient.get("/iserver/auth/status");
      Logger.log("[AUTH-CHECK] Auth status response:", response.data);
      
      const authenticated = response.data.authenticated === true;
      this.isAuthenticated = authenticated;
      
      if (authenticated) {
        this.authAttempts = 0; // Reset auth attempts on successful check
      }
      
      return authenticated;
    } catch (error) {
      this.isAuthenticated = false;
      return false;
    }
  }

  private async authenticate(): Promise<void> {
    Logger.log(`[AUTH] Starting authentication process... (attempt ${this.authAttempts + 1}/${this.maxAuthAttempts})`);
    this.authAttempts++;
    
    try {
      // Create a new axios instance without interceptors to avoid infinite recursion
      const authClient = axios.create({
        baseURL: this.baseUrl,
        timeout: 30000,
        httpsAgent: new https.Agent({
          rejectUnauthorized: false,
        }),
      });
      
      // Check if already authenticated
      Logger.log("[AUTH] Checking authentication status...");
      const response = await authClient.get("/iserver/auth/status");
      Logger.log("[AUTH] Auth status response:", response.data);
      
      if (response.data.authenticated) {
        Logger.log("[AUTH] Already authenticated");
        this.isAuthenticated = true;
        this.authAttempts = 0; // Reset on success
        return;
      }

      // Re-authenticate if needed
      Logger.log("[AUTH] Re-authenticating...");
      await authClient.post("/iserver/reauthenticate");
      Logger.log("[AUTH] Re-authentication successful");
      this.isAuthenticated = true;
      this.authAttempts = 0; // Reset on success
    } catch (error) {
      Logger.error(`[AUTH] Authentication failed (attempt ${this.authAttempts}/${this.maxAuthAttempts}):`, isError(error) && error.message, isError(error) && error.stack);
      if (this.authAttempts >= this.maxAuthAttempts) {
        throw new Error(`Failed to authenticate with IB Gateway after ${this.maxAuthAttempts} attempts`);
      }
      throw new Error("Failed to authenticate with IB Gateway");
    }
  }

  async getAccountInfo(): Promise<any> {
    Logger.log("[ACCOUNT-INFO] Starting getAccountInfo request...");
    try {
      Logger.log("[ACCOUNT-INFO] Fetching portfolio accounts...");
      const accountsResponse = await this.client.get("/portfolio/accounts");
      const accounts = accountsResponse.data;
      Logger.log(`[ACCOUNT-INFO] Found ${accounts?.length || 0} accounts:`, accounts);

      const result = {
        accounts: accounts,
        summaries: [] as any[]
      };

      Logger.log("[ACCOUNT-INFO] Processing account summaries...");
      for (let i = 0; i < accounts.length; i++) {
        const account = accounts[i];
        Logger.log(`[ACCOUNT-INFO] Processing account ${i + 1}/${accounts.length}: ${account.id}`);
        
        const summaryResponse = await this.client.get(
          `/portfolio/${account.id}/summary`
        );
        const summary = summaryResponse.data;
        Logger.log(`[ACCOUNT-INFO] Account ${account.id} summary:`, summary);

        result.summaries.push({
          accountId: account.id,
          summary: summary
        });
      }

      Logger.log(`[ACCOUNT-INFO] Completed processing ${result.summaries.length} accounts`);
      return result;
    } catch (error) {
      Logger.error("[ACCOUNT-INFO] Failed to get account info:", error);
      
      // Check if this is likely an authentication error
      if (this.isAuthenticationError(error)) {
        const authError = new Error("Authentication required to retrieve account information. Please authenticate with Interactive Brokers first.");
        (authError as any).isAuthError = true;
        throw authError;
      }
      
      throw new Error("Failed to retrieve account information");
    }
  }

  async getPositions(accountId?: string): Promise<any> {
    try {
      let url = "/portfolio/positions";
      if (accountId) {
        url = `/portfolio/${accountId}/positions`;
      }

      const response = await this.client.get(url);
      return response.data;
    } catch (error) {
        Logger.error("Failed to get positions:", error);
      
      // Check if this is likely an authentication error
      if (this.isAuthenticationError(error)) {
        const authError = new Error("Authentication required to retrieve positions. Please authenticate with Interactive Brokers first.");
        (authError as any).isAuthError = true;
        throw authError;
      }
      
      throw new Error("Failed to retrieve positions");
    }
  }

  async getMarketData(symbol: string, exchange?: string): Promise<any> {
    try {
      // First, get the contract ID for the symbol
      const searchResponse = await this.client.get(
        `/iserver/secdef/search?symbol=${symbol}`
      );
      
      if (!searchResponse.data || searchResponse.data.length === 0) {
        throw new Error(`Symbol ${symbol} not found`);
      }

      const contract = searchResponse.data[0];
      const conid = contract.conid;

      // Get market data snapshot
      const response = await this.client.get(
        `/iserver/marketdata/snapshot?conids=${conid}&fields=31,84,86,87,88,85,70,71,72,73,74,75,76,77,78`
      );

      return {
        symbol: symbol,
        contract: contract,
        marketData: response.data
      };
    } catch (error) {
      Logger.error("Failed to get market data:", error);
      
      // Check if this is likely an authentication error
      if (this.isAuthenticationError(error)) {
        const authError = new Error(`Authentication required to retrieve market data for ${symbol}. Please authenticate with Interactive Brokers first.`);
        (authError as any).isAuthError = true;
        throw authError;
      }
      
      throw new Error(`Failed to retrieve market data for ${symbol}`);
    }
  }

  private isAuthenticationError(error: any): boolean {
    if (!error) return false;
    
    const errorMessage = error.message || error.toString();
    const errorStatus = error.response?.status;
    const responseData = error.response?.data;
    
    // Check for common authentication error patterns
    return (
      errorStatus === 401 ||
      errorStatus === 403 ||
      errorStatus === 500 ||  // IB Gateway sometimes returns 500 for auth issues
      errorMessage.includes("authentication") ||
      errorMessage.includes("authenticate") ||
      errorMessage.includes("unauthorized") ||
      errorMessage.includes("not authenticated") ||
      errorMessage.includes("login") ||
      responseData?.error?.message?.includes("not authenticated") ||
      responseData?.error?.message?.includes("authentication") ||
      // IB Gateway specific patterns
      responseData?.error === "not authenticated" ||
      (errorStatus === 500 && responseData?.error?.includes("authentication"))
    );
  }

  async placeOrder(orderRequest: OrderRequest): Promise<any> {
    try {
      // First, get the contract ID for the symbol
      const searchResponse = await this.client.get(
        `/iserver/secdef/search?symbol=${orderRequest.symbol}`
      );
      
      if (!searchResponse.data || searchResponse.data.length === 0) {
        throw new Error(`Symbol ${orderRequest.symbol} not found`);
      }

      const contract = searchResponse.data[0];
      const conid = contract.conid;

      // Prepare order object
      const order = {
        conid: Number(conid), // Ensure conid is number
        orderType: orderRequest.orderType,
        side: orderRequest.action,
        quantity: Number(orderRequest.quantity), // Ensure quantity is number
        tif: "DAY", // Time in force
      };

      // Add price for limit orders
      if (orderRequest.orderType === "LMT" && orderRequest.price !== undefined) {
        (order as any).price = Number(orderRequest.price);
      }

      // Add stop price for stop orders
      if (orderRequest.orderType === "STP" && orderRequest.stopPrice !== undefined) {
        (order as any).auxPrice = Number(orderRequest.stopPrice);
      }

      // Place the order
      const response = await this.client.post(
        `/iserver/account/${orderRequest.accountId}/orders`,
        {
          orders: [order],
        }
      );

      // Check if we received confirmation messages that need to be handled
      if (response.data && Array.isArray(response.data) && response.data.length > 0) {
        const firstResponse = response.data[0];
        
        // Check if this is a confirmation message response
        if (firstResponse.id && firstResponse.message && firstResponse.messageIds && orderRequest.suppressConfirmations) {
          Logger.log("Order confirmation received, automatically confirming...", firstResponse);
          
          // Automatically confirm all messages
          const confirmResponse = await this.confirmOrder(firstResponse.id, firstResponse.messageIds);
          return confirmResponse;
        }
      }

      return response.data;
    } catch (error) {
      Logger.error("Failed to place order:", error);
      
      // Check if this is likely an authentication error
      if (this.isAuthenticationError(error)) {
        const authError = new Error("Authentication required to place orders. Please authenticate with Interactive Brokers first.");
        (authError as any).isAuthError = true;
        throw authError;
      }
      
      throw new Error("Failed to place order");
    }
  }

  /**
   * Confirm an order by replying to confirmation messages
   * @param replyId The reply ID from the confirmation response
   * @param messageIds Array of message IDs to confirm
   * @returns The confirmation response
   */
  async confirmOrder(replyId: string, messageIds: string[]): Promise<any> {
    try {
      Logger.log(`Confirming order with reply ID ${replyId} and message IDs:`, messageIds);
      
      const response = await this.client.post(`/iserver/reply/${replyId}`, {
        confirmed: true,
        messageIds: messageIds
      });

      Logger.log("Order confirmation response:", response.data);
      return response.data;
    } catch (error) {
      Logger.error("Failed to confirm order:", error);
      
      // Check if this is likely an authentication error
      if (this.isAuthenticationError(error)) {
        const authError = new Error("Authentication required to confirm orders. Please authenticate with Interactive Brokers first.");
        (authError as any).isAuthError = true;
        throw authError;
      }
      
      throw new Error("Failed to confirm order: " + (error as any).message);
    }
  }

  async getOrderStatus(orderId: string): Promise<any> {
    try {
      const response = await this.client.get(`/iserver/account/orders/${orderId}`);
      return response.data;
    } catch (error) {
      Logger.error("Failed to get order status:", error);
      
      // Check if this is likely an authentication error
      if (this.isAuthenticationError(error)) {
        const authError = new Error(`Authentication required to get order status for order ${orderId}. Please authenticate with Interactive Brokers first.`);
        (authError as any).isAuthError = true;
        throw authError;
      }
      
      throw new Error(`Failed to get status for order ${orderId}`);
    }
  }

  async getOrders(accountId?: string): Promise<any> {
    try {
      let url = "/iserver/account/orders";
      if (accountId) {
        url = `/iserver/account/${accountId}/orders`;
      }

      const response = await this.client.get(url);
      return response.data;
    } catch (error) {
      Logger.error("Failed to get orders:", error);
      
      // Check if this is likely an authentication error
      if (this.isAuthenticationError(error)) {
        const authError = new Error("Authentication required to retrieve orders. Please authenticate with Interactive Brokers first.");
        (authError as any).isAuthError = true;
        throw authError;
      }
      
      throw new Error("Failed to retrieve orders");
    }
  }
}
