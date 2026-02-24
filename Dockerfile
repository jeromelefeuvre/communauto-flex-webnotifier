# Use a lightweight Node.js Alpine image
FROM node:20-alpine

# Set the working directory inside the container
WORKDIR /app

# Copy the server script and the frontend web files
COPY package.json ./
COPY backend/ ./backend/
COPY frontend/ ./frontend/

# The server.mjs script runs on port 8000
EXPOSE 8000

# Start the lightweight Node proxy server
CMD ["node", "backend/server.mjs"]
