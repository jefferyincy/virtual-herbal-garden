#!/usr/bin/env bash
# Local MongoDB control for development. Uses a portable mongod unpacked into .mongo/
# (there is no system mongod and no sudo on this machine).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BIN="$ROOT/.mongo/bin/mongod"
DATA="$ROOT/.mongo/data"
LOG="$ROOT/.mongo/log/mongod.log"
PORT="${MONGO_PORT:-27017}"

if [ ! -x "$BIN" ]; then
  echo "mongod not found at $BIN" >&2
  echo "install: curl -sSL https://fastdl.mongodb.org/linux/mongodb-linux-x86_64-ubuntu2204-7.0.14.tgz | tar xz --strip-components=1 -C $ROOT/.mongo" >&2
  exit 1
fi

running() {
  # A portable mongod is started with --fork; the reliable liveness signal is the port.
  (exec 3<>/dev/tcp/127.0.0.1/"$PORT") 2>/dev/null
}

case "${1:-status}" in
  start)
    if running; then echo "mongod already running on 127.0.0.1:$PORT"; exit 0; fi
    mkdir -p "$DATA" "$(dirname "$LOG")"
    "$BIN" --dbpath "$DATA" --bind_ip 127.0.0.1 --port "$PORT" --logpath "$LOG" --fork
    echo "mongod started on 127.0.0.1:$PORT (log: $LOG)"
    ;;
  stop)
    if ! running; then echo "mongod not running"; exit 0; fi
    "$BIN" --dbpath "$DATA" --shutdown
    echo "mongod stopped"
    ;;
  status)
    if running; then
      echo "mongod running on 127.0.0.1:$PORT"
    else
      echo "mongod stopped"
      exit 1
    fi
    ;;
  *)
    echo "usage: $0 {start|stop|status}" >&2
    exit 2
    ;;
esac
