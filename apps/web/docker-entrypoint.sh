#!/bin/sh
# Apply pending migrations, then start the Next.js standalone server.
set -e

cd /app/migrate
node node_modules/prisma/build/index.js migrate deploy

cd /app/apps/web
exec node server.js
