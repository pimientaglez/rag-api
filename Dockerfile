# Use Node.js 18 Alpine for smaller image size
FROM node:18-alpine

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production --legacy-peer-deps

# Copy source code
COPY . .

# Build the TypeScript code
RUN npm run build

# Create pdfs directory for temporary files
RUN mkdir -p pdfs

# Expose port
EXPOSE 3001

# Start the application
CMD ["npm", "start"]