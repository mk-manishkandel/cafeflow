// PM2 process definition for CafeFlow POS.
//
// deploy.sh regenerates this file on install with absolute paths for the chosen
// install directory. Paths here are resolved relative to this file so a manual
// install works from any location.
//
// Environment variables come from pos/.env, which server/index.cjs loads itself
// (dotenv); NODE_ENV is forced to production here.
const path = require('path');

module.exports = {
    apps: [
        {
            name: 'cafeflow-pos',
            cwd: path.join(__dirname, 'pos'),
            script: 'server/index.cjs',
            instances: 'max',
            exec_mode: 'cluster',
            env: { NODE_ENV: 'production' },
            max_memory_restart: '500M',
            // Directory must exist (deploy.sh creates it): mkdir -p /var/log/cafeflow
            out_file: '/var/log/cafeflow/pos-out.log',
            error_file: '/var/log/cafeflow/pos-error.log',
            merge_logs: true,
            autorestart: true,
            // Allow graceful shutdown to finish. Must exceed the 10s force-exit
            // timer in server/index.cjs shutdown().
            kill_timeout: 12000
        }
    ]
};
