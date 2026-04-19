/**
 * PM2 Ecosystem Configuration
 *
 * Usage:
 *   npm i -g pm2
 *   pm2 start ecosystem.config.js
 *   pm2 save          # persist across reboots
 *   pm2 startup       # generate OS startup script
 *
 * Monitoring:
 *   pm2 monit         # live dashboard
 *   pm2 logs          # tail all logs
 *   pm2 status        # process list
 */
module.exports = {
  apps: [
    {
      name: 'rides-api',
      cwd: './rides-api',
      script: 'src/index.js',
      instances: 1,            // single instance (SQLite is single-writer)
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'development',
        PORT: 3000,
      },
      env_production: {
        NODE_ENV: 'production',
        PORT: 3000,
      },
      // Logging
      error_file: './logs/rides-api-error.log',
      out_file: './logs/rides-api-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
      // Restart policy
      max_restarts: 10,
      min_uptime: '10s',
      restart_delay: 3000,
      autorestart: true,
      // Graceful shutdown
      kill_timeout: 5000,
      // Watch (dev only — disable in production)
      watch: false,
    },
  ],
};
