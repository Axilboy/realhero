/**
 * Пример PM2: cd /PROGS/RH/web-app/api && npm run build
 * Запуск: pm2 start /PROGS/RH/web-app/deploy/ecosystem.config.cjs
 * Сохранить автозапуск: pm2 save && pm2 startup
 */
module.exports = {
  apps: [
    {
      name: "realhero-api",
      cwd: "/PROGS/RH/web-app/api",
      script: "dist/index.js",
      instances: 1,
      autorestart: true,
      max_memory_restart: "400M",
      env: {
        NODE_ENV: "production",
      },
      env_production: {
        NODE_ENV: "production",
      },
    },
  ],
};
