# Vite Deployment Platform

A self-hosted drag-and-drop deployment platform for Vite applications. Upload ZIP files containing Vite projects (dist folder or full project) and automatically deploy them with unique subdomains.

## Features

- 🚀 **Drag-and-Drop Upload**: Simple interface for uploading Vite project ZIP files
- 🔄 **Automatic Deployment**: Automatically unzips, installs dependencies, builds, and deploys projects
- 🌐 **Subdomain Routing**: Each deployment gets a unique subdomain (e.g., `https://myapp.server.appstetic.com`)
- 📊 **Dashboard**: View all deployed sites with status indicators
- 🗑️ **Easy Removal**: Remove deployments with a single click
- 📝 **Build Logs**: View build and error logs for each deployment
- 🔧 **Self-Hosted**: No third-party deployment limits - use your own server storage

## Prerequisites

- Node.js 18+ and npm/pnpm
- Ubuntu/Debian server (or similar Linux distribution)
- Nginx (for reverse proxy)
- Domain with wildcard DNS configured (e.g., `*.server.appstetic.com`)

## Installation

1. **Clone and install dependencies:**

```bash
git clone <your-repo>
cd auto-website-deployer
npm install
```

2. **Initialize the database:**

```bash
npm run setup-db
```

3. **Configure environment variables:**

Create a `.env` file (optional - defaults work for local development):

```env
NODE_ENV=production
PORT=3000
PROXY_PORT=8080
```

4. **Start the Next.js application:**

```bash
npm run build
npm start
```

5. **Start the reverse proxy server (in a separate terminal or use PM2):**

```bash
node scripts/reverse-proxy.js
```

## DNS Configuration

Configure your DNS to point wildcard subdomains to your server:

- `*.server.appstetic.com` → Your server IP address

## Nginx Configuration

1. Copy the example Nginx configuration:

```bash
sudo cp nginx.conf.example /etc/nginx/sites-available/auto-deployer
sudo ln -s /etc/nginx/sites-available/auto-deployer /etc/nginx/sites-enabled/
```

2. Update the configuration with your domain names

3. Test and reload Nginx:

```bash
sudo nginx -t
sudo systemctl reload nginx
```

## Production Deployment with PM2

For production, use PM2 to manage both processes:

```bash
npm install -g pm2

# Start Next.js app
pm2 start npm --name "deployer-app" -- start

# Start reverse proxy
pm2 start scripts/reverse-proxy.js --name "deployer-proxy"

# Save PM2 configuration
pm2 save
pm2 startup
```

## Usage

1. **Access the platform:** Navigate to `http://your-domain.com` (or `http://localhost:3000` for local development)

2. **Upload a project:**
   - Enter an optional site name
   - Drag and drop a ZIP file containing:
     - A `dist` folder (pre-built Vite project), OR
     - A full Vite project with `package.json`

3. **Monitor deployment:**
   - The dashboard shows all deployments with their status
   - Status can be: `pending`, `processing`, `running`, or `failed`

4. **Access deployed sites:**
   - Running deployments are accessible at `http://localhost:[port]` locally
   - With proper DNS/Nginx setup: `https://[subdomain].server.appstetic.com`

5. **Remove deployments:**
   - Click "Remove" on any deployment to stop and delete it

## Project Structure

```
auto-website-deployer/
├── app/                    # Next.js app directory
│   ├── api/               # API routes
│   │   ├── upload/        # File upload endpoint
│   │   └── deployments/   # Deployment management endpoints
│   ├── page.js            # Main dashboard page
│   └── layout.js          # Root layout
├── components/            # React components
│   ├── DragDropUpload.js  # File upload component
│   └── DeploymentTable.js # Deployment list table
├── lib/                   # Server-side libraries
│   ├── db.js              # Database connection
│   └── deployment-manager.js # Deployment logic
├── scripts/               # Utility scripts
│   ├── reverse-proxy.js   # Subdomain routing proxy
│   └── setup-db.js        # Database initialization
├── deployments/          # Deployed projects (created automatically)
├── uploads/              # Uploaded ZIP files (created automatically)
├── data/                 # SQLite database (created automatically)
└── nginx.conf.example    # Nginx configuration template
```

## How It Works

1. **Upload:** User uploads a ZIP file through the web interface
2. **Extract:** System unzips the file to a deployment directory
3. **Detect:** System detects if it's a `dist` folder or full project
4. **Install:** If full project, runs `npm install` or `pnpm install`
5. **Build:** If full project, runs `npm run build` or `pnpm run build`
6. **Deploy:** Starts `vite preview` or `npm run preview` on an available port
7. **Route:** Reverse proxy routes subdomain requests to the correct port
8. **Store:** Metadata stored in SQLite database

## Supported Project Types

- ✅ Pre-built Vite projects (ZIP containing `dist` folder)
- ✅ Full Vite projects (ZIP containing project with `package.json`)
- ✅ Projects using npm or pnpm
- ✅ Projects with nested folder structures

## Troubleshooting

### Port Already in Use

If you get port conflicts, the system automatically finds the next available port. You can also manually kill processes:

```bash
# Find process on port
lsof -ti:3001

# Kill process
kill -9 <PID>
```

### Build Failures

Check the deployment logs in the dashboard. Common issues:
- Missing dependencies in `package.json`
- Build script errors
- Node version incompatibility

### Reverse Proxy Not Working

1. Verify DNS is configured correctly
2. Check Nginx configuration: `sudo nginx -t`
3. Ensure reverse proxy server is running: `node scripts/reverse-proxy.js`
4. Check firewall rules allow ports 80, 443, 3000, 8080

### Database Errors

If you encounter database errors:
```bash
# Reinitialize database
rm -rf data/
npm run setup-db
```

## Security Considerations

- ⚠️ **File Upload Validation**: Currently accepts any ZIP file - add validation in production
- ⚠️ **Authentication**: Add authentication before deploying to production
- ⚠️ **Rate Limiting**: Implement rate limiting on upload endpoints
- ⚠️ **Resource Limits**: Set memory/CPU limits for deployment processes
- ⚠️ **HTTPS**: Configure SSL certificates for production (use Let's Encrypt)

## License

MIT License - feel free to use and modify for your needs.

## Contributing

Contributions welcome! Please open an issue or submit a pull request.
