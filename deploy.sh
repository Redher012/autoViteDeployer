#!/bin/bash

# Server-side deployment script
# Usage: ./deploy.sh
# This script pulls latest code, installs dependencies, builds, and restarts PM2

set -e

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${BLUE}🚀 Starting server deployment...${NC}"

# Get the directory where the script is located
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$SCRIPT_DIR"

echo -e "${BLUE}📂 Working directory: $(pwd)${NC}"

# Pull latest code
echo -e "${BLUE}📥 Pulling latest code from GitHub...${NC}"
git pull origin main || git pull origin master

# Install/update dependencies
echo -e "${BLUE}📦 Installing dependencies...${NC}"
npm install

# Initialize/update database (applies migrations)
echo -e "${BLUE}🗄️  Updating database schema...${NC}"
npm run setup-db

# Build Next.js app
echo -e "${BLUE}🔨 Building Next.js application...${NC}"
npm run build

# Restart PM2 processes
echo -e "${BLUE}🔄 Restarting PM2 processes...${NC}"
pm2 restart ecosystem.config.js

# Show status
echo -e "${GREEN}✅ Deployment complete!${NC}"
echo ""
echo -e "${BLUE}📊 PM2 Status:${NC}"
pm2 status

echo ""
echo -e "${GREEN}🎉 Your application is now live!${NC}"
