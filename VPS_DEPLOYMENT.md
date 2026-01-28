# VPS Deployment Guide

This guide will help you deploy the Vite Deployment Platform on your Ubuntu VPS.

## ✅ What's Already Working

- ✅ Next.js application (port 3000)
- ✅ Reverse proxy server (port 8080)
- ✅ Database (SQLite)
- ✅ File upload and deployment logic
- ✅ Port management (3001+)

## 📋 Prerequisites Checklist

Before deploying to your VPS, ensure you have:

- [ ] Ubuntu/Debian VPS with root access
- [ ] Node.js 20.9.0+ installed (required for Next.js 16)
- [ ] Nginx installed
- [ ] Domain name (e.g., `appstetic.com`)
- [ ] DNS access to configure wildcard subdomains
- [ ] Firewall configured (ports 80, 443, 3000, 8080)

## 🚀 Step-by-Step VPS Deployment

### 1. Transfer Files to VPS

```bash
# On your local machine
cd /Users/kristiyanhalachev/Desktop/auto-website-deployer
tar -czf deployer.tar.gz --exclude='node_modules' --exclude='.next' --exclude='deployments' --exclude='uploads' --exclude='data' .
scp deployer.tar.gz user@your-vps-ip:/home/user/
```

### 2. On Your VPS - Initial Setup

```bash
# SSH into your VPS
ssh user@your-vps-ip

# Check current Node.js version
node --version

# If Node.js < 20.9.0, upgrade using NodeSource repository
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# Verify Node.js version (should be 20.9.0 or higher)
node --version
npm --version

# Extract files (if using tar method)
cd /home/user
tar -xzf deployer.tar.gz -C /opt/auto-website-deployer
cd /opt/auto-website-deployer

# OR if cloning from Git (as you did)
cd /var/www/autoViteDeployer

# Install Puppeteer system dependencies (required for screenshots)
sudo apt-get update
sudo apt-get install -y \
  chromium-browser \
  libx11-xcb1 \
  libxcomposite1 \
  libxcursor1 \
  libxdamage1 \
  libxi6 \
  libxtst6 \
  libnss3 \
  libnspr4 \
  libdbus-1-3 \
  libxss1 \
  libxrandr2 \
  libgbm1 \
  fonts-liberation \
  xdg-utils

# For Ubuntu 24.04 (Noble), use t64 packages
sudo apt-get install -y \
  libcups2t64 \
  libasound2t64 \
  libatk1.0-0t64 \
  libatk-bridge2.0-0t64 \
  libpangocairo-1.0-0 \
  libgtk-3-0t64 \
  libdrm2 \
  libxkbcommon0 \
  libxshmfence1

# Install dependencies
npm install

# Initialize database (will add screenshot_path column if needed)
npm run setup-db

# Build Next.js app
npm run build
```

### 3. Install and Configure Nginx

```bash
# Install Nginx (if not already installed)
sudo apt update
sudo apt install nginx -y

# Copy configuration
sudo cp nginx.conf.example /etc/nginx/sites-available/auto-deployer

# Edit configuration with your domain
sudo nano /etc/nginx/sites-available/auto-deployer
```

Update the domain names in `/etc/nginx/sites-available/auto-deployer`:
- Replace `appstetic.com` with your domain
- Replace `*.server.appstetic.com` with `*.server.yourdomain.com`

```bash
# Enable site
sudo ln -s /etc/nginx/sites-available/auto-deployer /etc/nginx/sites-enabled/

# Test configuration
sudo nginx -t

# Reload Nginx
sudo systemctl reload nginx
```

### 4. Configure DNS

In your domain's DNS settings, add:

**A Records:**
- `appstetic.com` → Your VPS IP
- `www.appstetic.com` → Your VPS IP
- `*.server.appstetic.com` → Your VPS IP (wildcard)

**Example DNS Configuration:**
```
Type    Name                    Value           TTL
A       appstetic.com           123.45.67.89    3600
A       www                     123.45.67.89    3600
A       *.server                123.45.67.89    3600
```

### 5. Configure Firewall

```bash
# Allow HTTP, HTTPS, and required ports
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw allow 3000/tcp
sudo ufw allow 8080/tcp
sudo ufw allow 3001:9999/tcp  # Range for Vite preview servers

# Enable firewall (if not already enabled)
sudo ufw enable
```

### 6. Install PM2 (Process Manager)

```bash
# Install PM2 globally
sudo npm install -g pm2

# Start both services with PM2
cd /opt/auto-website-deployer
pm2 start ecosystem.config.js

# Save PM2 configuration
pm2 save

# Setup PM2 to start on boot
pm2 startup
# Follow the instructions it outputs
```

### 7. Configure SSL/HTTPS (Recommended)

```bash
# Install Certbot
sudo apt install certbot python3-certbot-nginx -y

# Get SSL certificate
sudo certbot --nginx -d appstetic.com -d www.appstetic.com -d *.server.appstetic.com

# Auto-renewal is set up automatically
```

Update Nginx config to use HTTPS:
```nginx
server {
    listen 443 ssl http2;
    server_name appstetic.com www.appstetic.com;
    
    ssl_certificate /etc/letsencrypt/live/appstetic.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/appstetic.com/privkey.pem;
    
    location / {
        proxy_pass http://localhost:3000;
        # ... rest of config
    }
}
```

## 🔧 Configuration Files

### Environment Variables (`.env`)

Create `/opt/auto-website-deployer/.env`:

```env
NODE_ENV=production
PORT=3000
PROXY_PORT=8080
```

### Update Reverse Proxy Domain

Edit `scripts/reverse-proxy.js` and update the domain:

```javascript
// Line 34 - Update to your domain
const subdomainMatch = host.match(/^([^.]+)\.server\.yourdomain\.com/);
```

## 📊 Monitoring

### Check PM2 Status

```bash
pm2 status
pm2 logs
pm2 monit
```

### Check Nginx Status

```bash
sudo systemctl status nginx
sudo nginx -t
```

### Check Ports

```bash
# Check if services are running
netstat -tulpn | grep -E '3000|8080'
```

## 🐛 Troubleshooting

### Port Already in Use

```bash
# Find process using port
sudo lsof -i :3000
sudo lsof -i :8080

# Kill process if needed
sudo kill -9 <PID>
```

### Nginx Not Routing Correctly

```bash
# Check Nginx error logs
sudo tail -f /var/log/nginx/error.log

# Test Nginx config
sudo nginx -t
```

### PM2 Services Not Starting

```bash
# Check logs
pm2 logs deployer-app
pm2 logs deployer-proxy

# Restart services
pm2 restart ecosystem.config.js
```

### Database Issues

```bash
# Reinitialize database (WARNING: Deletes all deployments)
cd /opt/auto-website-deployer
rm -rf data/
npm run setup-db
```

## 🔒 Security Considerations

1. **Firewall**: Only expose ports 80 and 443 publicly
2. **SSL**: Always use HTTPS in production
3. **Authentication**: Add authentication before deploying (see README security section)
4. **File Size Limits**: Configure Nginx to limit upload sizes:
   ```nginx
   client_max_body_size 100M;
   ```
5. **Rate Limiting**: Add rate limiting to prevent abuse
6. **Backups**: Regularly backup the `data/` directory

## 📝 Post-Deployment Checklist

- [ ] Main app accessible at `https://appstetic.com`
- [ ] Reverse proxy running on port 8080
- [ ] Test upload and deployment
- [ ] Verify subdomain routing works
- [ ] SSL certificate installed and auto-renewal configured
- [ ] PM2 services start on server reboot
- [ ] Firewall configured correctly
- [ ] Monitoring/logging set up

## 🎯 Quick Start Commands

```bash
# Start services
pm2 start ecosystem.config.js

# Stop services
pm2 stop ecosystem.config.js

# Restart services
pm2 restart ecosystem.config.js

# View logs
pm2 logs

# Check status
pm2 status
```

## 📞 Support

If you encounter issues:
1. Check PM2 logs: `pm2 logs`
2. Check Nginx logs: `sudo tail -f /var/log/nginx/error.log`
3. Verify DNS propagation: `dig *.server.appstetic.com`
4. Test reverse proxy: `curl http://localhost:8080/health`
