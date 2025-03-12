FROM node:18-slim

# Install Chromium dependencies and PM2
RUN apt-get update && apt-get install -y \
    chromium \
    libgconf-2-4 \
    libatk1.0-0 \
    libatk-bridge2.0-0 \
    libgdk-pixbuf2.0-0 \
    libgtk-3-0 \
    libgbm-dev \
    libnss3-dev \
    libxss-dev \
    && rm -rf /var/lib/apt/lists/* \
    && npm install -g pm2

WORKDIR /app

# Create persistent directories
RUN mkdir -p /app/data
VOLUME ["/app/data"]

# Copy package files
COPY package*.json ecosystem.config.js ./
RUN npm install

# Copy the rest of the application
COPY . .

# Move important files to persistent storage
RUN mv learned.json /app/data/ || true
RUN mv .wwebjs_auth /app/data/ || true
RUN ln -s /app/data/learned.json /app/learned.json
RUN ln -s /app/data/.wwebjs_auth /app/.wwebjs_auth

# Set environment variables
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium
ENV PORT=10000
ENV NODE_ENV=production

# Expose the port
EXPOSE 10000

# Start the application with PM2 in production mode
CMD ["pm2-runtime", "start", "ecosystem.config.js", "--env", "production"] 