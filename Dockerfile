FROM ubuntu:22.04

# Install required packages for both Java (IB Gateway) and Node.js (MCP Server)
RUN apt-get update && \
    apt-get upgrade -y && \
    apt-get install -y default-jre wget unzip curl && \
    curl -fsSL https://deb.nodesource.com/setup_18.x | bash - && \
    apt-get install -y nodejs && \
    rm -rf /var/lib/apt/lists/*

# Set up IB Gateway
WORKDIR /home
RUN wget https://download2.interactivebrokers.com/portal/clientportal.gw.zip && \
    unzip clientportal.gw.zip -d ./clientportal.gw && \
    rm clientportal.gw.zip

# Copy IB Gateway configuration
COPY ib-gateway/conf.yaml /home/clientportal.gw/root/conf.yaml

# Set up MCP Server
WORKDIR /app

# Copy package files and install all dependencies (including dev deps for build)
COPY package*.json ./
RUN npm ci

# Copy source code and build
COPY src/ ./src/
COPY tsconfig.json ./
RUN npm run build

# Remove dev dependencies after build
RUN npm prune --omit=dev

# Create logs directory
RUN mkdir -p logs

# Copy startup script
COPY start-services.sh /start-services.sh
RUN chmod +x /start-services.sh

# Expose both ports
EXPOSE 5000 3000 3001

# Health check for MCP server (IB Gateway will be checked internally)
HEALTHCHECK --interval=30s --timeout=10s --start-period=120s --retries=3 \
  CMD curl -f http://localhost:3000/health || exit 1

# Start both services
CMD ["/start-services.sh"]
