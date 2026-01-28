/**
 * PM2 Ecosystem Configuration
 * 
 * Run with: pm2 start ecosystem.config.js
 */

module.exports = {
  apps: [
    {
      name: 'deployer-app',
      script: 'npm',
      args: 'start',
      cwd: './',
      instances: 1,
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'production',
        PORT: 3000,
        PATH: process.env.PATH || '/usr/local/bin:/usr/bin:/bin:/usr/local/sbin:/usr/sbin:/sbin',
      },
      error_file: './logs/app-error.log',
      out_file: './logs/app-out.log',
      log_file: './logs/app-combined.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
    },
    {
      name: 'deployer-proxy',
      script: './scripts/reverse-proxy.js',
      instances: 1,
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'production',
        PORT: 8080,
        DEPLOYMENT_DOMAIN: 'server.appstetic.com', // Change to your domain
        PATH: process.env.PATH || '/usr/local/bin:/usr/bin:/bin:/usr/local/sbin:/usr/sbin:/sbin',
      },
      error_file: './logs/proxy-error.log',
      out_file: './logs/proxy-out.log',
      log_file: './logs/proxy-combined.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
      autorestart: true,
      watch: false,
      max_memory_restart: '500M',
    },
  ],
};
