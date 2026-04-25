module.exports = {
  apps: [
    {
      name: 'kubot-web',
      script: 'web/server.js',
      cwd: __dirname,
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      max_memory_restart: '512M',
      env: {
        NODE_ENV: 'production',
        TZ: 'America/Lima',
      },
      error_file: './logs/kubot-web.error.log',
      out_file: './logs/kubot-web.out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      merge_logs: true,
    },
  ],
};
