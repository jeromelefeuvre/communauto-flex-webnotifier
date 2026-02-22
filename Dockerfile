# Use a lightweight Node.js Alpine image
FROM node:20-alpine

# Set the working directory inside the container
WORKDIR /app

# Copy the server script and the frontend web files
COPY server.mjs index.html style.css app.js ./

# The server.mjs script runs on port 8000
EXPOSE 8000

# Start the lightweight Node proxy server
CMD ["node", "server.mjs"]
