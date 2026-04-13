module.exports = {
  apps: [{
    name: "2m-parking-api",
    script: "index.js",
    cwd: __dirname,
    // 2 instâncias (conservador — evita conflito com rate-limiters in-memory)
    instances: 2,
    exec_mode: "cluster",
    autorestart: true,
    watch: false,
    max_memory_restart: "400M",
    env: {
      NODE_ENV: "development",
      PORT: 3000,
    },
    env_production: {
      NODE_ENV: "production",
      PORT: 3000,
      // Variáveis sensíveis vêm do .env (dotenv carrega automaticamente)
      // DB_SERVER, DB_PORT, DB_NAME, DB_USER, DB_PASSWORD
      // JWT_SECRET, SETUP_KEY, CORS_ORIGINS
      // HTTPS_ENABLED, HTTPS_KEY, HTTPS_CERT
      LOG_LEVEL: "WARN",
    },
    // Log configuration
    log_date_format: "YYYY-MM-DD HH:mm:ss",
    error_file: "./logs/error.log",
    out_file: "./logs/app.log",
    merge_logs: true,
    // Restart policy
    restart_delay: 4000,
    max_restarts: 10,
    min_uptime: "10s",
    // Graceful shutdown
    kill_timeout: 10000,
    listen_timeout: 8000,
  }],
};
