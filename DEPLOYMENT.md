# Quick Deployment Guide

## Local Machine (Development)

### Deploy Script Usage

```bash
# Basic deployment (auto-commits with timestamp)
./deploy

# With custom commit message
./deploy "Fixed upload issue"
```

The `deploy` script will:
1. Stage all changes
2. Commit with your message (or auto-generated timestamp)
3. Push to GitHub

## Server (Production)

### First Time Setup

```bash
# Make script executable
chmod +x deploy.sh

# Run deployment
./deploy.sh
```

### What deploy.sh Does

1. **Pulls latest code** from GitHub
2. **Installs/updates dependencies** (`npm install`)
3. **Initializes database** if needed (`npm run setup-db`)
4. **Builds Next.js app** (`npm run build`)
5. **Restarts PM2 processes** (`pm2 restart ecosystem.config.js`)

### Manual Steps (if needed)

```bash
cd /var/www/autoViteDeployer
git pull origin main
npm install
npm run build
pm2 restart ecosystem.config.js
pm2 status
```

## Troubleshooting Upload Issues

If you see "Unexpected token '<'" errors when uploading:

1. **Check Nginx config** - Ensure `client_max_body_size 100M;` is set
2. **Reload Nginx**: `sudo systemctl reload nginx`
3. **Check PM2 logs**: `pm2 logs deployer-app`
4. **Verify Next.js config** has `bodySizeLimit: '50mb'` in `next.config.mjs`

## Quick Commands Reference

```bash
# View PM2 status
pm2 status

# View logs
pm2 logs deployer-app
pm2 logs deployer-proxy

# Restart services
pm2 restart ecosystem.config.js

# Check Nginx config
sudo nginx -t
sudo systemctl reload nginx

# Check if services are listening
sudo netstat -tulpn | grep -E '3000|8080'
```
