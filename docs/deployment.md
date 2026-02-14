# Deployment and Hosting Guide

## Prerequisites

- Node.js 20+ (specified in `.nvmrc`)
- npm 10+
- Git

## Environment Configuration

AXIS requires environment variables to run. Create a `.env` file in the project root based on `.env.example`:

```bash
cp .env.example .env
```

### Required Environment Variables

```bash
PORT=8787                              # Server port
AXIS_TIMEZONE=America/New_York         # Your timezone
AXIS_USER_NAME=Lucy                    # Your name
AXIS_NOTES_PROVIDER=local              # Notes storage: local
AXIS_ASSIGNMENT_PROVIDER=manual        # Assignment tracking method
AXIS_FOOD_PROVIDER=manual              # Food tracking method
AXIS_SOCIAL_PROVIDER=manual            # Social media integration
AXIS_VIDEO_PROVIDER=manual             # Video generation method
```

Adjust values to match your preferences and location.

## Development Deployment

### Local Setup

1. Clone the repository:

```bash
git clone https://github.com/lucyscript/companion.git
cd companion
```

2. Install dependencies:

```bash
npm install
```

3. Configure environment:

```bash
cp .env.example .env
# Edit .env with your preferences
```

4. Start both server and web UI:

```bash
npm run dev
```

This runs both the backend and frontend in parallel:
- Web UI: `http://localhost:5173`
- API Server: `http://localhost:8787`

### Run Services Separately

If needed, start services independently:

```bash
# Backend only
npm run dev:server

# Frontend only
npm run dev:web
```

## Production Deployment

### Build for Production

1. Typecheck the codebase:

```bash
npm run typecheck
```

2. Build both applications:

```bash
npm run build
```

This creates optimized production bundles:
- Server: `apps/server/dist/`
- Web: `apps/web/dist/`

### Deployment Options

#### Option 1: VPS / Cloud VM (Recommended)

Deploy to a virtual private server (DigitalOcean, Linode, AWS EC2, etc.):

1. **Provision server** with Ubuntu 22.04+ or similar
2. **Install Node.js 20+**:

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs
```

3. **Clone and setup**:

```bash
git clone https://github.com/lucyscript/companion.git
cd companion
npm install
cp .env.example .env
# Edit .env with production values
npm run build
```

4. **Start the server**:

```bash
cd apps/server
npm start
```

5. **Serve the web app** using nginx or another web server pointing to `apps/web/dist/`

6. **Setup process manager** (recommended):

```bash
# Install PM2
npm install -g pm2

# Start server with PM2
cd apps/server
pm2 start npm --name axis-server -- start

# Auto-start on boot
pm2 startup
pm2 save
```

#### Option 2: Static Hosting + Serverless

Split deployment:

1. **Frontend (Web UI)**: Deploy `apps/web/dist/` to:
   - Vercel
   - Netlify
   - Cloudflare Pages
   - GitHub Pages

2. **Backend (API Server)**: Deploy `apps/server/` to:
   - Heroku
   - Railway
   - Fly.io
   - AWS Lambda (requires adaptation)

Update `apps/web/vite.config.ts` to point API proxy to your backend URL.

#### Option 3: Docker Deployment (Planned)

Docker support is planned but not yet implemented. When available, use:

```bash
docker-compose up -d
```

### Nginx Configuration Example

For VPS deployment, configure nginx as a reverse proxy:

```nginx
server {
    listen 80;
    server_name your-domain.com;

    # Serve web app
    location / {
        root /path/to/companion/apps/web/dist;
        try_files $uri $uri/ /index.html;
    }

    # Proxy API requests
    location /api/ {
        proxy_pass http://localhost:8787;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

For HTTPS, use Certbot:

```bash
sudo certbot --nginx -d your-domain.com
```

## Mobile Access (iPhone)

AXIS is designed as a mobile-friendly web app. For quick access:

### Option 1: Home Screen Shortcut

1. Deploy AXIS to a public HTTPS URL
2. Open Safari and navigate to your AXIS URL
3. Tap the Share button
4. Select "Add to Home Screen"
5. Name it "AXIS" and choose an icon
6. Tap "Add"

### Option 2: iPhone Shortcuts

1. Open the Shortcuts app
2. Create a new shortcut
3. Add action: "Open URLs"
4. Enter your AXIS URL: `https://your-axis-url.com`
5. Name the shortcut "Launch AXIS"
6. Add to Home Screen

## Health Check and Verification

After deployment, verify AXIS is running:

### API Health Check

```bash
curl http://localhost:8787/api/health
```

Expected response:

```json
{"status":"ok"}
```

### Dashboard Endpoint

```bash
curl http://localhost:8787/api/dashboard
```

Should return orchestrator state, agent statuses, and notifications.

### Web UI

Navigate to `http://localhost:5173` (dev) or your production URL and verify:
- Page loads without errors
- Dashboard displays correctly
- API calls succeed (check browser console)

## Troubleshooting

### Port Already in Use

If port 8787 or 5173 is occupied:

```bash
# Find process using the port
lsof -i :8787
kill -9 <PID>

# Or change PORT in .env
```

### Build Failures

```bash
# Clear node_modules and reinstall
rm -rf node_modules package-lock.json
rm -rf apps/*/node_modules apps/*/package-lock.json
npm install

# Verify Node.js version
node --version  # Should be 20+
```

### Module Resolution Errors

Ensure you're using Node.js 20+ and npm 10+. Check `.nvmrc`:

```bash
nvm use
```

### API Connection Issues

Verify the proxy configuration in `apps/web/vite.config.ts` matches your server setup. For production, ensure environment variables are set correctly.

### Permission Denied

If you encounter permission errors on Linux/Mac:

```bash
# Fix npm permissions
sudo chown -R $USER:$(id -gn $USER) ~/.npm
```

## Security Considerations

- **Never commit `.env` files** to version control (already in `.gitignore`)
- **Use HTTPS** in production for mobile access
- **Restrict API access** if exposing to the internet
- **Keep dependencies updated**: `npm audit` and `npm update`
- **Set strong firewall rules** on your VPS

## Monitoring and Logs

### View Logs

```bash
# Development
# Logs appear in terminal where npm run dev is running

# Production with PM2
pm2 logs axis-server

# View specific logs
pm2 logs axis-server --lines 100
```

### Monitor Resources

```bash
# With PM2
pm2 monit

# System resources
htop
```

## Backup and Data Persistence

AXIS stores runtime data in `apps/server/data/` (gitignored). For production:

1. **Backup strategy**: Regularly backup the `data/` directory
2. **Persistent storage**: Ensure data directory persists across deployments
3. **Database migration**: If switching servers, copy `data/` to new location

## Updating AXIS

To update an existing deployment:

```bash
# Pull latest changes
git pull origin main

# Reinstall dependencies
npm install

# Rebuild
npm run build

# Restart (with PM2)
pm2 restart axis-server

# Or restart manually
# Stop server, then: cd apps/server && npm start
```

## Performance Tuning

- **Node.js memory**: Set `NODE_OPTIONS=--max-old-space-size=2048` for larger datasets
- **Caching**: Configure nginx caching for static assets
- **CDN**: Use a CDN for the web app if expecting high traffic
- **Database**: Consider external database for agent states if local storage becomes limiting

## Support and Further Reading

- [Dev Environment Guide](dev-environment.md) - Local development setup
- [API Contracts](contracts.md) - API endpoint documentation
- [Project Brief](project-brief.md) - Product vision and architecture
- [README](../README.md) - Project overview and quick start
