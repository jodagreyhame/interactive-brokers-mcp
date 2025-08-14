#!/bin/bash

# Start IB Gateway directly (web interface only)
echo "Starting IB Client Portal Gateway..."
cd /home/clientportal.gw
./bin/run.sh ./root/conf.yaml &
IB_GATEWAY_PID=$!

# Wait for IB Gateway to start up
echo "Waiting for IB Gateway to start..."
sleep 30

# Check if IB Gateway is running
for i in {1..12}; do
    # Check if the port is responding (HTTPS)
    if curl -k -s --connect-timeout 5 https://localhost:5000/ >/dev/null 2>&1; then
        echo "IB Gateway is running and responding"
        break
    fi
    echo "Waiting for IB Gateway... ($i/12)"
    sleep 10
done

# Start MCP Server (stdio)
echo "Starting MCP Server (stdio)..."
cd /app
npm start &
MCP_SERVER_PID=$!

# Also start HTTP server for development/testing
echo "Starting MCP Server (HTTP on port 3001)..."
npm run start:http &
MCP_HTTP_SERVER_PID=$!

# Function to handle shutdown
shutdown() {
    echo "Shutting down services..."
    kill $MCP_SERVER_PID 2>/dev/null
    kill $MCP_HTTP_SERVER_PID 2>/dev/null
    kill $IB_GATEWAY_PID 2>/dev/null
    exit 0
}

# Trap signals
trap shutdown SIGTERM SIGINT

# Wait for both processes
wait
