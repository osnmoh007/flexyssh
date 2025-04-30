FROM node:18-alpine

# Create app directory
WORKDIR /usr/src/app

# Install dependencies for node-pty (required for SSH)
RUN apk add --no-cache make python3 g++ openssh-client

# Copy package files and install dependencies
COPY package*.json ./
RUN npm ci --only=production

# Copy application code
COPY . .

# Expose port
EXPOSE 3000

# Create directory for SSH keys
RUN mkdir -p keys && chmod 700 keys

# Set environment variables
ENV NODE_ENV=production
ENV PORT=3000

# Start the app
CMD ["node", "server.js"] 