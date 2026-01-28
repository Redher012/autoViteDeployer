#!/bin/bash

# VPS Deployment Script
# This script helps deploy the application to your VPS

set -e

echo "🚀 Vite Deployment Platform - VPS Deployment Script"
echo "=================================================="
echo ""

# Check if VPS details are provided
if [ -z "$1" ]; then
    echo "Usage: ./scripts/deploy-to-vps.sh user@vps-ip [vps-path]"
    echo "Example: ./scripts/deploy-to-vps.sh root@123.45.67.89 /opt/auto-website-deployer"
    exit 1
fi

VPS_HOST=$1
VPS_PATH=${2:-/opt/auto-website-deployer}

echo "📦 Preparing deployment package..."
# Create deployment archive (exclude unnecessary files)
tar -czf /tmp/deployer.tar.gz \
    --exclude='node_modules' \
    --exclude='.next' \
    --exclude='deployments' \
    --exclude='uploads' \
    --exclude='data' \
    --exclude='.git' \
    --exclude='*.log' \
    .

echo "📤 Uploading to VPS..."
scp /tmp/deployer.tar.gz $VPS_HOST:/tmp/

echo "🔧 Setting up on VPS..."
ssh $VPS_HOST << EOF
set -e

echo "Creating directory..."
sudo mkdir -p $VPS_PATH
sudo chown \$USER:\$USER $VPS_PATH

echo "Extracting files..."
cd $VPS_PATH
tar -xzf /tmp/deployer.tar.gz
rm /tmp/deployer.tar.gz

echo "Installing dependencies..."
npm install --production

echo "Initializing database..."
npm run setup-db

echo "Building Next.js app..."
npm run build

echo "Creating logs directory..."
mkdir -p logs

echo "✅ Setup complete!"
echo ""
echo "Next steps:"
echo "1. Configure Nginx (see VPS_DEPLOYMENT.md)"
echo "2. Set up DNS wildcard records"
echo "3. Configure firewall"
echo "4. Start with PM2: pm2 start ecosystem.config.js"
EOF

echo ""
echo "✅ Deployment package uploaded successfully!"
echo ""
echo "📋 Next steps:"
echo "1. SSH into your VPS: ssh $VPS_HOST"
echo "2. Follow the VPS_DEPLOYMENT.md guide"
echo "3. Configure Nginx and DNS"
echo "4. Start services with PM2"
