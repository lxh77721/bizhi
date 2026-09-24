#!/bin/bash
set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
COZE_WORKSPACE_PATH="${COZE_WORKSPACE_PATH:-${ROOT_DIR}}"
export COZE_WORKSPACE_PATH

# FaaS 部署的文件系统可能是只读的。若未显式指定 DATA_DIR，则交给服务端
# 自动回退到 CPU 可写目录（os.tmpdir/coze-server/data），保证服务能启动。
export DATA_DIR="${DATA_DIR:-}"

start_service() {
    cd "${COZE_WORKSPACE_PATH}/server/dist"

    local port="${DEPLOY_RUN_PORT:-3000}"
    echo "Starting Static File Server on port ${port} for deploy..."

    node ./main.js -p "${port}"
}

echo "Starting HTTP service for deploy..."
start_service
