// PM2 দিয়ে চালানোর কনফিগ: pm2 start ecosystem.config.js
module.exports = {
  apps: [
    {
      name: 'missed-call-sms',
      script: 'src/server.js',
      instances: 1, // একটার বেশি দেবেন না — তাহলে একই SMS দুবার যেতে পারে
      autorestart: true,
      max_memory_restart: '300M',
      env: { NODE_ENV: 'production' },
    },
  ],
};
