#!/usr/bin/env sh
set -eu

ROOT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
BASE_IMAGES="node:22-bookworm-slim python:3.11-slim postgres:17-alpine"

# Pulls base images up front so transient Docker Hub failures are retried before Compose starts building every service.
pull_base_images() {
  if [ "${PFG_SKIP_PREFLIGHT_PULL:-}" = "1" ]; then
    return
  fi

  for image in $BASE_IMAGES; do
    if docker image inspect "$image" >/dev/null 2>&1; then
      continue
    fi

    attempt=1
    while [ "$attempt" -le 3 ]; do
      printf '%s\n' "Pulling $image (attempt $attempt/3)..."
      if docker pull "$image"; then
        break
      fi

      if [ "$attempt" -eq 3 ]; then
        printf '%s\n' "Failed to pull $image. Check Docker Hub connectivity, then rerun ./scripts/dev-up.sh." >&2
        exit 1
      fi

      attempt=$((attempt + 1))
      sleep 3
    done
  done
}

if [ ! -f "$ROOT_DIR/.env" ]; then
  cp "$ROOT_DIR/.env.example" "$ROOT_DIR/.env"
  printf '%s\n' "Created .env from .env.example. Edit it if you need real runner credentials."
fi

cd "$ROOT_DIR"
pull_base_images

if [ "$#" -eq 0 ]; then
  set -- hub admin runner
fi

exec docker compose --profile runner up --build "$@"
