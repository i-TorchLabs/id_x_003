#!/usr/bin/env bash
# id_x_003 一键启动（幂等，已存在则跳过）
set -euo pipefail

PLUGIN="id_x_003"
HOST_PORT=8003
OPS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${OPS_DIR}/../../.." && pwd)"

# 1. .env 检查
if [ ! -f "${OPS_DIR}/.env" ]; then
    cp "${OPS_DIR}/.env.example" "${OPS_DIR}/.env"
    echo "已生成 ${OPS_DIR}/.env，请修改后重新执行本脚本"
    exit 0
fi
set -a; source "${OPS_DIR}/.env"; set +a

# 2. 构建镜像
if [ "${1:-}" = "--build" ] || ! podman image exists "${PLUGIN}_service"; then
    podman build --format docker -t "${PLUGIN}_service" -f "${OPS_DIR}/Dockerfile.service" "${REPO_ROOT}"
fi
if [ "${1:-}" = "--build" ] || ! podman image exists "${PLUGIN}_web"; then
    podman build --format docker -t "${PLUGIN}_web" "${OPS_DIR}/../web"
fi

# 3. Pod（已存在则跳过）
if ! podman pod exists "${PLUGIN}"; then
    # 宿主机 35432 -> pod 5432(由容器内 db 监听),宿主机 8003 -> pod 8080
    podman pod create --name "${PLUGIN}" \
        -p "${HOST_PORT}:8080" \
        -p "35432:5432"
fi

# 4. 数据卷（已存在则跳过）
podman volume exists "${PLUGIN}_db_data" || podman volume create "${PLUGIN}_db_data"

# 5. 逐容器启动（已存在则跳过）
if ! podman container exists "${PLUGIN}_db"; then
    podman run -d --pod "${PLUGIN}" --name "${PLUGIN}_db" \
        -e POSTGRES_DB="${POSTGRES_DB}" \
        -e POSTGRES_USER="${POSTGRES_USER}" \
        -e POSTGRES_PASSWORD="${POSTGRES_PASSWORD}" \
        --expose 5432 \
        -v "${PLUGIN}_db_data:/var/lib/postgresql" \
        -v "${OPS_DIR}/init:/docker-entrypoint-initdb.d:ro" \
        --health-cmd "pg_isready -U ${POSTGRES_USER} -d ${POSTGRES_DB}" \
        --health-interval 5s --health-retries 10 \
        docker.io/library/postgres:18
fi

echo "等待 db 就绪..."
until [ "$(podman inspect --format '{{.State.Health.Status}}' "${PLUGIN}_db" 2>/dev/null)" = "healthy" ]; do
    sleep 2
done

if ! podman container exists "${PLUGIN}_service"; then
    podman run -d --pod "${PLUGIN}" --name "${PLUGIN}_service" \
        -e DB_NAME="${POSTGRES_DB}" \
        -e DB_HOST=127.0.0.1 \
        -e DB_PORT=5432 \
        -e DB_USERNAME="${POSTGRES_USER}" \
        -e DB_PASSWORD="${POSTGRES_PASSWORD}" \
        -e AA_MAIL_PASSWORD="${AA_MAIL_PASSWORD:-}" \
        -e AA_OAUTH_CLIENT_ID="${AA_OAUTH_CLIENT_ID:-}" \
        -e AA_OAUTH_CLIENT_SECRET="${AA_OAUTH_CLIENT_SECRET:-}" \
        -e AA_OAUTH_REDIRECT_URI="${AA_OAUTH_REDIRECT_URI:-}" \
        -e PROJECT_PATH=/app/i-Core \
        "${PLUGIN}_service"
fi

if ! podman container exists "${PLUGIN}_web"; then
    podman run -d --pod "${PLUGIN}" --name "${PLUGIN}_web" "${PLUGIN}_web"
fi

if ! podman container exists "${PLUGIN}_haproxy"; then
    podman run -d --pod "${PLUGIN}" --name "${PLUGIN}_haproxy" \
        -e SERVICE_HOST=127.0.0.1 \
        -e WEB_HOST=127.0.0.1 \
        -v "${OPS_DIR}/haproxy.cfg:/usr/local/etc/haproxy/haproxy.cfg:ro" \
        docker.io/library/haproxy:3.2
fi

echo "启动完成: http://localhost:${HOST_PORT}"
