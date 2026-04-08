#!/bin/sh

. "$HOME/.cargo/env" 2>/dev/null || true

exec npx tauri "$@"
