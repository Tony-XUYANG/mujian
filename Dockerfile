FROM node:22-bookworm-slim AS frontend
WORKDIR /build/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY frontend/ ./
RUN npm run build

FROM maven:3.9-eclipse-temurin-21 AS backend
WORKDIR /build/backend
COPY backend/pom.xml ./
COPY backend/src/ ./src/
COPY --from=frontend /build/frontend/dist/ ./src/main/resources/static/
RUN mvn -B -ntp package

FROM eclipse-temurin:21-jre-jammy AS runtime
RUN groupadd --gid 10001 mujian \
    && useradd --uid 10001 --gid 10001 --no-create-home --shell /usr/sbin/nologin mujian \
    && mkdir -p /app /data/uploads \
    && chown -R mujian:mujian /app /data
WORKDIR /app
COPY --from=backend --chown=mujian:mujian /build/backend/target/mujian-1.0.0.jar /app/mujian.jar
COPY --chmod=755 deploy/container-entrypoint.sh /app/container-entrypoint.sh
ENV PORT=8080 BIND_ADDRESS=0.0.0.0 UPLOAD_DIR=/data/uploads SEED_DEMO=false
USER 10001:10001
EXPOSE 8080
ENTRYPOINT ["/app/container-entrypoint.sh"]
