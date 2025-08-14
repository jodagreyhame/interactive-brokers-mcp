import axios, { AxiosInstance } from "axios";
import https from "https";

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

export interface Position {
  symbol: string;
  position: number;
  marketPrice: number;
  marketValue: number;
  averageCost: number;
  unrealizedPnl: number;
  realizedPnl: number;
}

export interface AccountInfo {
  accountId: string;
  accountType: string;
  currency: string;
  netLiquidation: number;
  totalCashValue: number;
  buyingPower: number;
  maintenanceMargin: number;
  availableFunds: number;
}

export interface MarketData {
  symbol: string;
  bid: number;
  ask: number;
  last: number;
  volume: number;
  high: number;
  low: number;
  close: number;
  change: number;
  changePercent: number;
}

export interface OrderStatus {
  orderId: string;
  status: string;
  filled: number;
  remaining: number;
  avgFillPrice: number;
  parentId?: string;
  whyHeld?: string;
}

export class IBClient {
  private client: AxiosInstance;
  private baseUrl: string;
  private isAuthenticated = false;

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

    // Add request interceptor to ensure authentication
    this.client.interceptors.request.use(async (config) => {
      if (!this.isAuthenticated) {
        await this.authenticate();
      }
      return config;
    });
  }

  private async authenticate(): Promise<void> {
    try {
      // Check if already authenticated
      const response = await this.client.get("/iserver/auth/status");
      if (response.data.authenticated) {
        this.isAuthenticated = true;
        return;
      }

      // Re-authenticate if needed
      await this.client.post("/iserver/reauthenticate");
      this.isAuthenticated = true;
    } catch (error) {
      console.error("Authentication failed:", error);
      throw new Error("Failed to authenticate with IB Gateway");
    }
  }

  async getAccountInfo(): Promise<AccountInfo[]> {
    try {
      const response = await this.client.get("/portfolio/accounts");
      const accounts = response.data;

      const accountsInfo: AccountInfo[] = [];

      for (const account of accounts) {
        const summaryResponse = await this.client.get(
          `/portfolio/${account.id}/summary`
        );
        const summary = summaryResponse.data;

        accountsInfo.push({
          accountId: account.id,
          accountType: account.type || "Unknown",
          currency: summary.currency || "USD",
          netLiquidation: summary.netliquidation || 0,
          totalCashValue: summary.totalcashvalue || 0,
          buyingPower: summary.buyingpower || 0,
          maintenanceMargin: summary.maintenancemargin || 0,
          availableFunds: summary.availablefunds || 0,
        });
      }

      return accountsInfo;
    } catch (error) {
      console.error("Failed to get account info:", error);
      throw new Error("Failed to retrieve account information");
    }
  }

  async getPositions(accountId?: string): Promise<Position[]> {
    try {
      let url = "/portfolio/positions";
      if (accountId) {
        url = `/portfolio/${accountId}/positions`;
      }

      const response = await this.client.get(url);
      const positions = response.data;

      return positions.map((pos: any) => ({
        symbol: pos.ticker || pos.symbol || "Unknown",
        position: pos.position || 0,
        marketPrice: pos.mktPrice || 0,
        marketValue: pos.mktValue || 0,
        averageCost: pos.avgCost || 0,
        unrealizedPnl: pos.unrealizedPnl || 0,
        realizedPnl: pos.realizedPnl || 0,
      }));
    } catch (error) {
      console.error("Failed to get positions:", error);
      throw new Error("Failed to retrieve positions");
    }
  }

  async getMarketData(symbol: string, exchange?: string): Promise<MarketData> {
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

      const data = response.data[0];
      
      return {
        symbol,
        bid: data["84"] || 0,
        ask: data["86"] || 0,
        last: data["31"] || 0,
        volume: data["87"] || 0,
        high: data["70"] || 0,
        low: data["71"] || 0,
        close: data["31"] || 0, // Using last as close if close not available
        change: data["82"] || 0,
        changePercent: data["83"] || 0,
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

  async getOrderStatus(orderId: string): Promise<OrderStatus> {
    try {
      const response = await this.client.get(`/iserver/account/orders/${orderId}`);
      const order = response.data;

      return {
        orderId: order.orderId || orderId,
        status: order.status || "Unknown",
        filled: order.filled || 0,
        remaining: order.remaining || 0,
        avgFillPrice: order.avgPrice || 0,
        parentId: order.parentId,
        whyHeld: order.whyHeld,
      };
    } catch (error) {
      console.error("Failed to get order status:", error);
      throw new Error(`Failed to get status for order ${orderId}`);
    }
  }

  async getOrders(accountId?: string): Promise<OrderStatus[]> {
    try {
      let url = "/iserver/account/orders";
      if (accountId) {
        url = `/iserver/account/${accountId}/orders`;
      }

      const response = await this.client.get(url);
      const orders = response.data.orders || [];

      return orders.map((order: any) => ({
        orderId: order.orderId,
        status: order.status || "Unknown",
        filled: order.filled || 0,
        remaining: order.remaining || 0,
        avgFillPrice: order.avgPrice || 0,
        parentId: order.parentId,
        whyHeld: order.whyHeld,
      }));
    } catch (error) {
      console.error("Failed to get orders:", error);
      throw new Error("Failed to retrieve orders");
    }
  }
}
