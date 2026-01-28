# Quick Start Guide

## Local Development Setup

1. **Install dependencies:**
```bash
npm install
```

2. **Initialize database:**
```bash
npm run setup-db
```

3. **Start development server:**
```bash
npm run dev
```

4. **In another terminal, start the reverse proxy (optional for local dev):**
```bash
npm run proxy
```

5. **Access the platform:**
   - Open http://localhost:3000
   - Upload a ZIP file containing a Vite project
   - View deployed sites in the dashboard

## Testing with a Sample Vite Project

1. Create a simple Vite project:
```bash
npm create vite@latest test-project -- --template vanilla
cd test-project
npm install
npm run build
```

2. Create a ZIP file:
```bash
# Option 1: ZIP the dist folder
cd dist
zip -r ../dist.zip .
cd ..

# Option 2: ZIP the entire project
cd ..
zip -r test-project.zip test-project/
```

3. Upload the ZIP file through the web interface

## Production Deployment

### Using PM2 (Recommended)

1. **Install PM2 globally:**
```bash
npm install -g pm2
```

2. **Build the Next.js app:**
```bash
npm run build
```

3. **Start both services with PM2:**
```bash
pm2 start ecosystem.config.js
```

4. **View logs:**
```bash
pm2 logs
```

5. **Stop services:**
```bash
pm2 stop ecosystem.config.js
pm2 delete ecosystem.config.js
```

### Manual Start

1. **Terminal 1 - Next.js app:**
```bash
npm run build
npm start
```

2. **Terminal 2 - Reverse proxy:**
```bash
npm run proxy
```

## Troubleshooting

### Port Already in Use
```bash
# Find what's using port 3000
lsof -ti:3000

# Kill the process
kill -9 <PID>
```

### Database Locked
```bash
# Remove and reinitialize
rm -rf data/
npm run setup-db
```

### Build Failures
- Check that Node.js version is 18+
- Ensure npm/pnpm is installed
- Check build logs in the dashboard

### Preview Server Not Starting
- Verify the project has a `dist` folder after build
- Check that `vite preview` or `npm run preview` works manually
- Review error logs in the dashboard
