module.exports = {
  apps: [{
    name: 'wabot',
    script: 'index.js',
    watch: false,
    ignore_watch: ['node_modules', 'logs', '.wwebjs_auth', '*.json'],
    instances: 1,
    exec_mode: 'fork',
    max_memory_restart: '1G',
    error_file: './logs/err-0.log',
    out_file: './logs/out-0.log',
    log_file: './logs/combined-0.log',
    time: true,
    env_production: {
      NODE_ENV: 'production',
      PUPPETEER_SKIP_CHROMIUM_DOWNLOAD: true,
      PUPPETEER_EXECUTABLE_PATH: '/usr/bin/chromium-browser'
    },
    restart_delay: 30000,
    max_restarts: 2,
    min_uptime: '1m',
    listen_timeout: 60000,
    kill_timeout: 15000,
    autorestart: true,
    exp_backoff_restart_delay: 100,
    wait_ready: true,
    source_map_support: true
  }]
}; 