#!/bin/sh
set -eu
PORT="${PORT:-8080}"
case "$PORT" in
  ''|*[!0-9]*) echo 'PORT must be an integer from 1 to 65535.' >&2; exit 1 ;;
esac
if [ "$PORT" -lt 1 ] || [ "$PORT" -gt 65535 ]; then
  echo 'PORT must be an integer from 1 to 65535.' >&2
  exit 1
fi
export PORT
envsubst '$PORT' < /etc/nginx/prisma.conf.template > /tmp/prisma-nginx.conf
exec nginx -c /tmp/prisma-nginx.conf -g 'daemon off;'
