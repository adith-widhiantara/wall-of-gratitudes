#!/bin/sh
set -e
chown -R node:node /data
exec gosu node "$@"
