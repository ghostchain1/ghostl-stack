/**
 * PM2 process definitions for local API + web dev.
 * Uses .env.local files for each app; create them from the examples first.
 */
module.exports = {
  apps: [
    {
      name: 'ghostl-api',
      cwd: './apps/api',
      script: 'npm',
      args: ['run', 'dev'],
      env_file: './apps/api/.env.local'
    },
    {
      name: 'ghostl-web',
      cwd: './apps/web',
      script: 'npm',
      args: ['run', 'dev'],
      env_file: './apps/web/.env.local'
    }
  ]
};
