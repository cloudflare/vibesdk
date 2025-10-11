#!/bin/bash

# Example usage of CLI tools outside Docker environment
# This script demonstrates how to use the CLI tools in any directory

echo "=== CLI Tools Configuration Example ==="
echo

# Set custom data directory (optional)
export CLI_DATA_DIR="./monitoring-data"

# Set custom database paths (optional)
export CLI_ERROR_DB_PATH="./monitoring-data/runtime-errors.db"
export CLI_LOG_DB_PATH="./monitoring-data/process-logs.db"

echo "Data directory: $CLI_DATA_DIR"
echo "Error database: $CLI_ERROR_DB_PATH"
echo "Log database: $CLI_LOG_DB_PATH"
echo

# Example: Start monitoring a process
echo "=== Starting Process Monitor ==="
bun run cli-tools.ts process start --instance-id "my-app" --port 3000 -- npm run dev &
MONITOR_PID=$!

# Wait a bit for the process to start
sleep 2

# Example: Check process status
echo "=== Process Status ==="
bun run cli-tools.ts process status --instance-id "my-app"
echo

# Example: List recent errors
echo "=== Recent Errors ==="
bun run cli-tools.ts errors list --instance-id "my-app" --limit 10 --format table
echo

# Example: Get recent logs
echo "=== Recent Logs ==="
bun run cli-tools.ts logs get --instance-id "my-app" --format raw
echo

# Example: Get error statistics
echo "=== Error Statistics ==="
bun run cli-tools.ts errors stats --instance-id "my-app"
echo

# Example: Get log statistics
echo "=== Log Statistics ==="
bun run cli-tools.ts logs stats --instance-id "my-app"
echo

# Example: Get all logs and reset (useful for periodic log collection)
echo "=== All Logs (and reset) ==="
bun run cli-tools.ts logs get --instance-id "my-app" --format raw --reset > collected-logs.txt
echo "Logs saved to collected-logs.txt"
echo

# Cleanup: Stop the monitor
echo "=== Stopping Monitor ==="
bun run cli-tools.ts process stop --instance-id "my-app"

echo "=== Example Complete ==="