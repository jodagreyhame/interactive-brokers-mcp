import axios, { AxiosInstance, AxiosRequestConfig } from "axios";
import https from "https";

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
}



export class IBClient {
  private client: AxiosInstance;
  private baseUrl: string;
  private isAuthenticated = false;
  private authAttempts = 0;
  private maxAuthAttempts = 3;

  constructor(config: IBClientConfig) {
    // Use HTTPS as IB Gateway expects it
    this.baseUrl = `https://${config.host}:${config.port}/v1/api`;
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
      console.log(`[REQUEST-${requestId}] ${config.method?.toUpperCase()} ${config.url}`, {
        baseURL: config.baseURL,
        timeout: config.timeout,
        headers: config.headers,
        data: config.data
      });
      
      if (!this.isAuthenticated) {
        console.log(`[REQUEST-${requestId}] Not authenticated, authenticating... (attempt ${this.authAttempts + 1}/${this.maxAuthAttempts})`);
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
        console.log(`[RESPONSE-${requestId}] ${response.status} ${response.statusText}`, {
          url: response.config.url,
          responseSize: JSON.stringify(response.data).length,
          headers: response.headers,
          dataPreview: JSON.stringify(response.data).substring(0, 500) + '...'
        });
        return response;
      },
      (error) => {
        const requestId = (error.config as ExtendedAxiosRequestConfig)?.metadata?.requestId || 'unknown';
        console.error(`[ERROR-${requestId}] Request failed:`, {
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

  private async authenticate(): Promise<void> {
    console.log(`[AUTH] Starting authentication process... (attempt ${this.authAttempts + 1}/${this.maxAuthAttempts})`);
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
      console.log("[AUTH] Checking authentication status...");
      const response = await authClient.get("/iserver/auth/status");
      console.log("[AUTH] Auth status response:", response.data);
      
      if (response.data.authenticated) {
        console.log("[AUTH] Already authenticated");
        this.isAuthenticated = true;
        this.authAttempts = 0; // Reset on success
        return;
      }

      // Re-authenticate if needed
      console.log("[AUTH] Re-authenticating...");
      await authClient.post("/iserver/reauthenticate");
      console.log("[AUTH] Re-authentication successful");
      this.isAuthenticated = true;
      this.authAttempts = 0; // Reset on success
    } catch (error) {
      console.error(`[AUTH] Authentication failed (attempt ${this.authAttempts}/${this.maxAuthAttempts}):`, error);
      if (this.authAttempts >= this.maxAuthAttempts) {
        throw new Error(`Failed to authenticate with IB Gateway after ${this.maxAuthAttempts} attempts`);
      }
      throw new Error("Failed to authenticate with IB Gateway");
    }
  }

  async getAccountInfo(): Promise<any> {
    console.log("[ACCOUNT-INFO] Starting getAccountInfo request...");
    try {
      console.log("[ACCOUNT-INFO] Fetching portfolio accounts...");
      const accountsResponse = await this.client.get("/portfolio/accounts");
      const accounts = accountsResponse.data;
      console.log(`[ACCOUNT-INFO] Found ${accounts?.length || 0} accounts:`, accounts);

      const result = {
        accounts: accounts,
        summaries: [] as any[]
      };

      console.log("[ACCOUNT-INFO] Processing account summaries...");
      for (let i = 0; i < accounts.length; i++) {
        const account = accounts[i];
        console.log(`[ACCOUNT-INFO] Processing account ${i + 1}/${accounts.length}: ${account.id}`);
        
        const summaryResponse = await this.client.get(
          `/portfolio/${account.id}/summary`
        );
        const summary = summaryResponse.data;
        console.log(`[ACCOUNT-INFO] Account ${account.id} summary:`, summary);

        result.summaries.push({
          accountId: account.id,
          summary: summary
        });
      }

      console.log(`[ACCOUNT-INFO] Completed processing ${result.summaries.length} accounts`);
      return result;
    } catch (error) {
      console.error("[ACCOUNT-INFO] Failed to get account info:", error);
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
      console.error("Failed to get positions:", error);
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
      console.error("Failed to get market data:", error);
      throw new Error(`Failed to retrieve market data for ${symbol}`);
    }
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
        conid,
        orderType: orderRequest.orderType,
        side: orderRequest.action,
        quantity: orderRequest.quantity,
        tif: "DAY", // Time in force
      };

      // Add price for limit orders
      if (orderRequest.orderType === "LMT" && orderRequest.price) {
        (order as any).price = orderRequest.price;
      }

      // Add stop price for stop orders
      if (orderRequest.orderType === "STP" && orderRequest.stopPrice) {
        (order as any).auxPrice = orderRequest.stopPrice;
      }

      // Place the order
      const response = await this.client.post(
        `/iserver/account/${orderRequest.accountId}/orders`,
        {
          orders: [order],
        }
      );

      return response.data;
    } catch (error) {
      console.error("Failed to place order:", error);
      throw new Error("Failed to place order");
    }
  }

  async getOrderStatus(orderId: string): Promise<any> {
    try {
      const response = await this.client.get(`/iserver/account/orders/${orderId}`);
      return response.data;
    } catch (error) {
      console.error("Failed to get order status:", error);
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
      console.error("Failed to get orders:", error);
      throw new Error("Failed to retrieve orders");
    }
  }
}
