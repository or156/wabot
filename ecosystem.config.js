module.exports = {
  apps: [{
    name: 'wabot',
    script: 'index.js',
    watch: ['index.js'],
    ignore_watch: ['learned.json', 'backups', '.wwebjs_auth', 'node_modules'],
    watch_delay: 1000,
    max_memory_restart: '300M',
    env: {
      NODE_ENV: 'development'
    },
    env_production: {
      NODE_ENV: 'production'
    },
    exp_backoff_restart_delay: 100,
    max_restarts: 10,
    restart_delay: 1000,
    autorestart: true,
  }]
}; 