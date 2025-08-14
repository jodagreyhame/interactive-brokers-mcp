# Interactive Brokers MCP Server

A Model Context Protocol (MCP) server that provides seamless integration with Interactive Brokers' trading platform. This server allows AI assistants to interact with your IB account to retrieve market data, check positions, and place trades.

## Features

- **Account Management**: Get account information, balances, and summaries
- **Position Tracking**: View current positions and P&L
- **Market Data**: Real-time market data for stocks and other instruments
- **Order Management**: Place market, limit, and stop orders
- **Order Monitoring**: Check order status and execution details
- **Docker Support**: Easy deployment with Docker and docker-compose
- **Smithery Integration**: Deploy to Smithery cloud platform

## Prerequisites

- Node.js 18+ (for local development)
- Docker and Docker Compose (for containerized deployment)
- Interactive Brokers account (paper or live)
- IB Gateway or TWS application access

## Quick Start

### 1. Clone and Setup

```bash
git clone <repository-url>
cd interactive-brokers-mcp
npm install
```

### 2. Configuration (Optional)

Optionally copy the environment template to customize settings:

```bash
cp env.example .env
```

The default settings work out of the box. You can customize ports and other settings if needed.

### 3. Run with Docker

Build and run the unified container:

```bash
docker build -t ib-mcp .
docker run -d -p 5000:5000 -p 3000:3000 --name ib-mcp ib-mcp
```

This will:
- Start the IB Gateway with web interface
- Wait for the gateway to be ready
- Start the MCP server that connects to the gateway

### 4. Access the IB Gateway Web Interface

The IB Gateway provides a web-based login interface accessible from your local machine:

1. **Open your browser** and navigate to: `https://localhost:5000`
   - **Accept the SSL certificate warning** (it's a self-signed certificate)
   - Click "Advanced" → "Proceed to localhost (unsafe)" or similar

2. **Login to IB Gateway**: You'll see the Interactive Brokers login page
   - Enter your Interactive Brokers username and password
   - Complete any two-factor authentication if required
   - Once authenticated, the gateway will be ready for API calls

3. **Verify Authentication**: After successful login, you can test the API:
   ```bash
   curl -k https://localhost:5000/v1/api/iserver/auth/status
   ```

### 5. Test the Connection

Check if the container is running:

```bash
docker ps
```

Test the MCP server:

```bash
curl http://localhost:3000/health
```

View the logs:

```bash
docker logs ib-mcp
```

## Development Setup

For local development, you can run the MCP server locally while using the containerized IB Gateway:

### 1. Start IB Gateway Only (in Docker)

```bash
docker build -t ib-mcp .
docker run -d -p 5000:5000 --name ib-gateway --entrypoint "/home/clientportal.gw/bin/run.sh" ib-mcp /home/clientportal.gw/root/conf.yaml
```

### 2. Run MCP Server Locally

```bash
npm install
npm run build
npm run dev  # or npm start
```

## MCP Tools Available

### `get_account_info`
Retrieves account information including balances and buying power.

```json
{
  "name": "get_account_info"
}
```

### `get_positions`
Gets current positions for the account.

```json
{
  "name": "get_positions",
  "arguments": {
    "accountId": "optional_account_id"
  }
}
```

### `get_market_data`
Retrieves real-time market data for a symbol.

```json
{
  "name": "get_market_data",
  "arguments": {
    "symbol": "AAPL",
    "exchange": "NASDAQ"
  }
}
```

### `place_order`
Places a trading order.

```json
{
  "name": "place_order",
  "arguments": {
    "accountId": "your_account_id",
    "symbol": "AAPL",
    "action": "BUY",
    "orderType": "MKT",
    "quantity": 100,
    "price": 150.00
  }
}
```

### `get_order_status`
Checks the status of a specific order.

```json
{
  "name": "get_order_status",
  "arguments": {
    "orderId": "order_id"
  }
}
```

## Deployment to Smithery

This project is configured for deployment to [Smithery](https://smithery.ai), a platform for hosting MCP servers.

### Prerequisites
- Smithery account
- Git repository with your code

### Deployment Steps

1. **Push your code to a Git repository** (GitHub, GitLab, etc.)

2. **Configure environment variables in Smithery** (optional):
   - `IB_GATEWAY_HOST`: Your IB Gateway host (default: localhost)
   - `IB_GATEWAY_PORT`: Gateway port (default: 5000)
   - Other settings use sensible defaults

3. **Deploy using Smithery CLI** or web interface:
   ```bash
   smithery deploy
   ```

The `smithery.yaml` configuration file will handle the deployment automatically.

## Security Considerations

- **Never commit credentials** to version control
- Use environment variables for sensitive information
- Consider using paper trading mode for development and testing
- Ensure proper network security when deploying
- Regularly rotate passwords and API keys

## Development

### Local Development

```bash
npm run dev
```

### Building

```bash
npm run build
```

### Testing

```bash
# Test with a simple MCP client
echo '{"jsonrpc": "2.0", "id": 1, "method": "tools/list"}' | npm start
```

## Troubleshooting

### Common Issues

1. **Connection Refused**
   - Ensure IB Gateway is running and accessible
   - Check firewall settings
   - Verify port configurations

2. **Authentication Failed**
   - Verify IB credentials
   - Check if account is enabled for API access
   - Ensure trading permissions are set up

3. **Market Data Issues**
   - Verify market data subscriptions in your IB account
   - Check symbol format and exchange
   - Ensure market is open for real-time data

### Logs

Check container logs:
```bash
docker-compose logs ib-gateway
docker-compose logs mcp-server
```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## License

MIT License - see LICENSE file for details.

## Support

For issues related to:
- **IB Gateway**: Check [Interactive Brokers API documentation](https://www.interactivebrokers.com/campus/ibkr-api-page/cpapi-v1/#introduction)
- **MCP Protocol**: See [Model Context Protocol documentation](https://modelcontextprotocol.io/)
- **This Server**: Open an issue in this repository

## Disclaimer

This software is for educational and development purposes. Trading involves risk of financial loss. Always test with paper trading before using with real money. The authors are not responsible for any financial losses incurred through the use of this software.
