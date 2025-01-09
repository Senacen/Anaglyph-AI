# Stage 1: Build the application using Node.js
FROM node:18-alpine AS build

# Set the working directory
WORKDIR /app

# Copy package.json and package-lock.json
COPY package*.json ./

# Install npm dependencies
RUN npm install

# Copy the rest of the application code
COPY . .

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
