# Interactive Brokers MCP Server

<div align="center">
<img src="https://www.interactivebrokers.com/images/web/logos/ib-logo-text-black.svg" alt="Interactive Brokers" width="300">
</div>

> **⚠️ DISCLAIMER**: This is an **unofficial**, community-developed MCP server
> and is **NOT** affiliated with or endorsed by Interactive Brokers. This
> software is in **Alpha state** and may not work perfectly.

A Model Context Protocol (MCP) server that provides integration with Interactive
Brokers' trading platform. This server allows AI assistants to interact with
your IB account to retrieve market data, check positions, and place trades.

## 🔒 Security Notice

**This MCP server is designed to run locally only** for security reasons. Never
deploy this to remote servers or cloud platforms as it handles sensitive trading
credentials and financial data.

## ✨ Features

- **Account Management**: Get account information and balances
- **Position Tracking**: View current positions and P&L
- **Market Data**: Real-time market data for stocks and instruments
- **Order Management**: Place market, limit, and stop orders
- **Order Monitoring**: Check order status and execution details

## Prerequisites

**No additional installations required!** This package includes:

- Pre-configured IB Gateway for all platforms (Linux, macOS, Windows)
- Java Runtime Environment (JRE) for IB Gateway
- All necessary dependencies

You only need:

- Interactive Brokers account (paper or live trading)
- Node.js 18+ (for running the MCP server)

## Quick Start

Add this MCP server to your Cursor/Claude configuration:

```json
{
  "mcpServers": {
    "interactive-brokers": {
      "command": "npx",
      "args": ["-y", "interactive-brokers-mcp"]
    }
  }
}
```

When you first use the server, a web browser window will automatically open for
the Interactive Brokers OAuth authentication flow. Log in with your IB
credentials to authorize the connection.

## Headless Mode Configuration

For automated environments or when you prefer not to use a browser for
authentication, you can enable headless mode by configuring it in your MCP
server configuration:

```json
{
  "mcpServers": {
    "interactive-brokers": {
      "command": "npx",
      "args": ["-y", "interactive-brokers-mcp"],
      "env": {
        "IB_HEADLESS_MODE": "true",
        "IB_USERNAME": "your_ib_username",
        "IB_PASSWORD_AUTH": "your_ib_password"
      }
    }
  }
}

```

In headless mode, the server will automatically authenticate using your
credentials without opening a browser window. This is useful for:

- Automated trading systems
- Server environments without a display
- CI/CD pipelines
- Situations where browser interaction is not desired

**Important**: Even in headless mode, Interactive Brokers may still require
two-factor authentication (2FA). When 2FA is triggered, the headless
authentication will wait for you to complete the 2FA process through your
configured method (mobile app, SMS, etc.) before proceeding.

**Security Note**: Store credentials securely and never commit them to version
control. Consider using environment variable files or secure credential
management systems.

## Paper Trading Configuration

You can configure the server to automatically enable paper trading mode during authentication. This is useful for testing strategies and development without risking real money:

```json
{
  "mcpServers": {
    "interactive-brokers": {
      "command": "npx",
      "args": ["-y", "interactive-brokers-mcp"],
      "env": {
        "IB_HEADLESS_MODE": "true",
        "IB_USERNAME": "your_ib_username",
        "IB_PASSWORD_AUTH": "your_ib_password",
        "IB_PAPER_TRADING": "true"
      }
    }
  }
}
```

**Environment Variables:**

- `IB_PAPER_TRADING`: Set to `"true"` to enable paper trading mode, `"false"` for live trading (default: `false`)

**Command Line Arguments:**

You can also enable paper trading using command line arguments:

```bash
npx interactive-brokers-mcp --ib-paper-trading=true
# or
npx interactive-brokers-mcp --ib-paper-trading
```

**Notes:**

- Paper trading mode is automatically configured during the headless authentication process
- If the paper trading toggle is not found on the authentication page, a warning will be logged but authentication will continue
- Some account types may not have access to paper trading - check with Interactive Brokers
- When paper trading is enabled, all trades will be simulated and no real money will be at risk

## Available MCP Tools

| Tool               | Description                               |
| ------------------ | ----------------------------------------- |
| `get_account_info` | Retrieve account information and balances |
| `get_positions`    | Get current positions and P&L             |
| `get_market_data`  | Real-time market data for symbols         |
| `place_order`      | Place market, limit, or stop orders       |
| `get_order_status` | Check order execution status              |

## Troubleshooting

**Authentication Problems:**

- Use the web interface that opens automatically
- Complete any required two-factor authentication
- Try paper trading mode if live trading fails

## Security & Risk Disclaimer

⚠️ **IMPORTANT WARNINGS:**

- **Financial Risk**: Trading involves substantial risk of loss. Always test
  with paper trading first.
- **Security**: This software handles sensitive financial data. Only run
  locally, never on public servers.
- **No Warranty**: This unofficial software comes with no warranties. Use at
  your own risk.
- **Not Financial Advice**: This tool is for automation only, not financial
  advice.

## Support

- **IB Gateway Issues**:
  [Interactive Brokers API Documentation](https://www.interactivebrokers.com/campus/ibkr-api-page/cpapi-v1/#introduction)
- **MCP Protocol**:
  [Model Context Protocol Documentation](https://modelcontextprotocol.io/)
- **This Server**: Open an issue in this repository.

## License

MIT License - see LICENSE file for details.
