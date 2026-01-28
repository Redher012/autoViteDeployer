# Screenshot Fix Guide

## Problem
Puppeteer failed to launch Chrome with the error:
```
libnss3.so: cannot open shared object file: No such file or directory
```

## Solution

Run these commands on your Ubuntu server to install all required dependencies:

### Step 1: Install System Dependencies

```bash
# Install Chromium and required libraries
sudo apt-get update

# Install Chromium browser
sudo apt-get install -y chromium-browser

# Install base dependencies
sudo apt-get install -y \
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
  libdrm2 \
  libxkbcommon0 \
  libxshmfence1 \
  fonts-liberation \
  xdg-utils

# Install t64 packages (for Ubuntu 24.04 Noble)
sudo apt-get install -y \
  libcups2t64 \
  libasound2t64 \
  libatk1.0-0t64 \
  libatk-bridge2.0-0t64 \
  libpangocairo-1.0-0 \
  libgtk-3-0t64

# Verify Chromium is installed
which chromium-browser
chromium-browser --version
```

### Step 2: Deploy Updated Code

```bash
cd /var/www/autoViteDeployer
git pull origin main
./deploy.sh
```

### Step 3: Verify Screenshot Capture

Deploy a new website and check the logs:

```bash
pm2 logs deployer-app --lines 50
```

Look for:
- `[SCREENSHOT] Using system Chromium at: /usr/bin/chromium-browser`
- `[SCREENSHOT] Screenshot saved to ...`

## How It Works

The updated code:
1. **Uses system Chromium** instead of downloading Chrome
2. **Skips Chrome download** during `npm install` (via `.puppeteerrc.cjs`)
3. **Auto-detects** Chromium at `/usr/bin/chromium-browser`, `/usr/bin/chromium`, or `/snap/bin/chromium`
4. **Falls back gracefully** if screenshot capture fails (doesn't break deployments)

## Troubleshooting

### If screenshots still don't work:

1. **Check if Chromium is installed:**
   ```bash
   which chromium-browser
   ```

2. **Test Chromium manually:**
   ```bash
   chromium-browser --headless --no-sandbox --disable-gpu --screenshot=test.png https://google.com
   ls -lh test.png
   ```

3. **Check PM2 logs for errors:**
   ```bash
   pm2 logs deployer-app --err
   ```

4. **Verify screenshot directory exists:**
   ```bash
   ls -la /var/www/autoViteDeployer/public/screenshots/
   ```

5. **Check permissions:**
   ```bash
   # Make sure the PM2 user can write to the directory
   sudo chown -R $USER:$USER /var/www/autoViteDeployer/public/screenshots/
   chmod 755 /var/www/autoViteDeployer/public/screenshots/
   ```

### Alternative: Use Puppeteer's bundled Chrome

If system Chromium doesn't work, you can let Puppeteer download Chrome:

1. Remove `.puppeteerrc.cjs`:
   ```bash
   rm /var/www/autoViteDeployer/.puppeteerrc.cjs
   ```

2. Reinstall dependencies:
   ```bash
   cd /var/www/autoViteDeployer
   rm -rf node_modules
   npm install
   ```

3. Install missing libraries:
   ```bash
   sudo apt-get install -y libnss3 libnspr4 libatk1.0-0t64 libatk-bridge2.0-0t64 libcups2t64 libasound2t64 libpangocairo-1.0-0 libxss1 libgtk-3-0t64 libgbm1
   ```

## Expected Result

After fixing, you should see:
- Screenshots automatically captured 5 seconds after deployment
- Preview images displayed in the deployment cards
- No errors in PM2 logs related to screenshot capture

If screenshots don't appear immediately, deploy a new site to trigger the screenshot capture process.
