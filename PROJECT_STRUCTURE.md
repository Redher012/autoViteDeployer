# Project Structure

## Complete File Tree

```
auto-website-deployer/
├── app/                          # Next.js 14 App Router
│   ├── api/                      # API Routes
│   │   ├── upload/
│   │   │   └── route.js          # File upload endpoint
│   │   └── deployments/
│   │       ├── route.js          # List all deployments
│   │       └── [id]/
│   │           └── route.js      # Get/Delete specific deployment
│   ├── page.js                   # Main dashboard page
│   ├── layout.js                 # Root layout
│   ├── globals.css               # Global styles
│   └── favicon.ico
│
├── components/                   # React Components
│   ├── DragDropUpload.js         # Drag-and-drop file upload component
│   └── DeploymentTable.js        # Table showing all deployments
│
├── lib/                          # Server-side Libraries
│   ├── db.js                     # SQLite database connection & schema
│   └── deployment-manager.js     # Core deployment logic
│
├── scripts/                      # Utility Scripts
│   ├── reverse-proxy.js          # Subdomain routing proxy server
│   └── setup-db.js               # Database initialization
│
├── deployments/                  # Deployed projects (auto-created)
├── uploads/                      # Uploaded ZIP files (auto-created)
├── data/                         # SQLite database (auto-created)
│   └── deployments.db
│
├── public/                       # Static assets
│   └── *.svg
│
├── .gitignore                    # Git ignore rules
├── ecosystem.config.js           # PM2 configuration
├── jsconfig.json                 # JavaScript/Path aliases config
├── next.config.mjs               # Next.js configuration
├── nginx.conf.example            # Nginx reverse proxy example
├── package.json                  # Dependencies & scripts
├── postcss.config.mjs            # PostCSS configuration
├── QUICKSTART.md                 # Quick start guide
├── README.md                     # Full documentation
└── PROJECT_STRUCTURE.md          # This file
```

## Key Components

### Frontend (React/Next.js)

1. **`app/page.js`** - Main dashboard page
   - Displays upload interface
   - Shows deployment table
   - Handles refresh after uploads

2. **`components/DragDropUpload.js`** - File upload component
   - Drag-and-drop interface
   - File validation
   - Upload progress indication
   - Site name input

3. **`components/DeploymentTable.js`** - Deployment list
   - Real-time status updates
   - Status indicators (running/processing/failed)
   - Delete functionality
   - Direct links to deployed sites

### Backend (Node.js/Next.js API Routes)

1. **`app/api/upload/route.js`** - Upload handler
   - Receives ZIP file uploads
   - Saves to uploads directory
   - Triggers deployment process

2. **`app/api/deployments/route.js`** - Deployment listing
   - Returns all deployments from database
   - Used by dashboard for real-time updates

3. **`app/api/deployments/[id]/route.js`** - Deployment management
   - GET: Fetch specific deployment details
   - DELETE: Remove deployment and cleanup

### Core Logic

1. **`lib/db.js`** - Database layer
   - SQLite connection
   - Schema initialization
   - Table: deployments (id, site_name, subdomain, status, port, pid, logs, etc.)

2. **`lib/deployment-manager.js`** - Deployment engine
   - File unzipping
   - Project detection (dist vs full project)
   - Dependency installation (npm/pnpm)
   - Project building
   - Preview server management
   - Process tracking (PID)
   - Cleanup on removal

3. **`scripts/reverse-proxy.js`** - Subdomain routing
   - Express server on port 8080
   - Extracts subdomain from hostname
   - Routes to appropriate port
   - Health check endpoint

## Data Flow

1. **Upload Flow:**
   ```
   User uploads ZIP → API route saves file → deployment-manager.deployProject()
   → Unzip → Detect type → Install/Build → Start preview → Store in DB → Return result
   ```

2. **Access Flow:**
   ```
   Request to subdomain.server.appstetic.com → Nginx → Reverse Proxy (port 8080)
   → Extract subdomain → Query DB → Proxy to localhost:[port]
   ```

3. **Removal Flow:**
   ```
   User clicks Remove → API DELETE → deployment-manager.removeDeployment()
   → Kill process (PID/port) → Remove files → Delete from DB
   ```

## Database Schema

```sql
CREATE TABLE deployments (
  id TEXT PRIMARY KEY,              -- UUID
  site_name TEXT NOT NULL,          -- User-provided name
  subdomain TEXT NOT NULL UNIQUE,   -- Generated subdomain
  status TEXT NOT NULL,             -- pending|processing|running|failed
  created_at DATETIME,              -- Creation timestamp
  updated_at DATETIME,              -- Last update timestamp
  port INTEGER,                      -- Preview server port
  pid INTEGER,                       -- Process ID for cleanup
  build_log TEXT,                    -- Build output logs
  error_log TEXT,                    -- Error messages
  file_path TEXT                     -- Original ZIP file path
);
```

## Port Allocation

- **3000**: Next.js application (main platform)
- **8080**: Reverse proxy server
- **3001+**: Vite preview servers (auto-assigned, tracked in DB)

## Environment Variables

Optional `.env` file:
```env
NODE_ENV=production
PORT=3000
PROXY_PORT=8080
```

## Dependencies

### Production Dependencies
- `next` - Next.js framework
- `react`, `react-dom` - React library
- `better-sqlite3` - SQLite database
- `yauzl` - ZIP file extraction
- `fs-extra` - Enhanced file system operations
- `uuid` - Unique ID generation
- `http-proxy-middleware` - HTTP proxying
- `express` - Reverse proxy server
- `dotenv` - Environment variable management

### Development Dependencies
- `tailwindcss` - CSS framework
- `eslint` - Code linting

## Security Considerations

⚠️ **Production Checklist:**
- [ ] Add authentication/authorization
- [ ] Implement rate limiting on upload endpoint
- [ ] Add file size limits
- [ ] Validate ZIP file contents (prevent zip bombs)
- [ ] Set resource limits for deployment processes
- [ ] Configure HTTPS/SSL certificates
- [ ] Add input sanitization
- [ ] Implement logging and monitoring
- [ ] Set up backup strategy for database
- [ ] Configure firewall rules

## Scaling Considerations

- **Database**: SQLite works for small-medium scale. Consider PostgreSQL for larger deployments
- **Process Management**: Current PID tracking works for single server. Consider process managers (PM2) for production
- **Storage**: Monitor disk usage in `deployments/` and `uploads/` directories
- **Port Management**: Current port allocation (3001-9999) supports ~7000 concurrent deployments
- **Reverse Proxy**: Single Express instance. Consider load balancing for high traffic
