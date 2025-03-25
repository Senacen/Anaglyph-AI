# Stage 1: Build the application using Node.js
# Cloudrun requires linux amd64, used buildx tool to convert it to linux/amd64
FROM node:18-alpine AS build

# Set the working directory
WORKDIR /app

# Define build arguments
ARG VITE_FLASK_BACKEND_API_URL

# Copy package.json and package-lock.json
COPY package*.json ./

# Install npm dependencies
RUN npm install

# Copy the rest of the application code
COPY . .

# Set the environment variables for the build process to point to the backend service not local
ENV VITE_FLASK_BACKEND_API_URL=https://backend.anaglyph-ai.com

# Build the application (this will depend on your specific setup)
RUN npm run build  # Adjust this command as necessary

# Stage 2: Serve the application using Nginx
FROM nginx:alpine

# Copy built application files from the previous stage
COPY --from=build /app/dist /usr/share/nginx/html

# Expose port 80
EXPOSE 80

# Command to run Nginx (default command is fine)
CMD ["nginx", "-g", "daemon off;"]
