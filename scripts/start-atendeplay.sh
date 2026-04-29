#!/usr/bin/env bash

set -a
source /home/deploy/apps/atendeplay/.env
set +a

exec /usr/bin/node /home/deploy/apps/atendeplay/.next/standalone/server.js