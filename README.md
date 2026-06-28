# Developer Guide
Welcome to Nestjs ai playground


## Quick Start

### Prerequisites
- Node.js 25 and pnpm
- Docker and Docker Compose
- SOPS (for secret management): `brew install sops`
- AGE key configured (see [Secret Management](#secret-management) below)

### First Time Setup

1. **Clone and install dependencies:**
```bash
git clone <repo-url>
cd <repo-name>
pnpm install
```

2. **Configure your SOPS key:**
```bash
# Ensure your AGE private key is available
export SOPS_AGE_KEY_FILE=~/.secrets/sops/age/keys.txt
# Or add to your ~/.zshrc for persistence
```

3. **Update encrypted secrets:**
```bash
sops secrets/dev.yaml
# Add your actual credentials (see structure below)
```

4. **Start Docker services:**
```bash
./scripts/docker.sh up -d
```

5. **Start the backend:**
```bash
cd packages/fw_backend
npm run start:dev
```

6. **Start the admin UI:**
```bash
cd packages/fw_admin
yarn dev
```

## Daily Workflow

### Starting Everything (Recommended)

Use the services script to start Docker + Backend:

```bash
# Start in dev mode (default)
./scripts/services.sh up:dev

# Start in debug mode (debugger on port 9229)
./scripts/services.sh up:dev-debug

# Start in production mode
./scripts/services.sh up:prod

# Check status
./scripts/services.sh status

# View logs
./scripts/services.sh logs -f

# Stop everything
./scripts/services.sh down
```

### Starting Services Individually

If you prefer to run services separately:

```bash
# Start Docker only
docker compose up -d

# Start backend (in another terminal)
cd packages/fw_backend && npm run start:dev

# Start admin UI (in another terminal)
cd packages/fw_admin && yarn dev
```

### Stopping Services

```bash
# Stop everything (Docker + Backend)
./scripts/services.sh down

# Or stop individually with Ctrl+C in their terminals
```

## Secret Management

### Overview
This project uses **SOPS** (Secrets OPerationS) with **AGE** encryption for secure secret management:

- ✅ Secrets encrypted at rest in Git
- ✅ No plaintext secrets committed
- ✅ Runtime validation with Zod schemas
- ✅ Docker secrets via file-based mounting

## Interactive Shell

You can run the interactive chatbot terminal shell with:

```bash
pnpm start:dev -- shell
```

---

## Observability & Logging

This project integrates OpenTelemetry (OTel) and Grafana Loki for a modern, unified observability stack.

### 1. Where are the logs?

* **Local Logs (CLI Shell Mode)**: 
  When running the interactive CLI shell (`pnpm start:dev -- shell`), application logs are suppressed from standard output (to avoid corrupting the React-Ink terminal interface) and written as structured JSON to:
  ```
  data/logs/app.log
  ```
* **Stdout Logs (Standard Mode)**: 
  When running normally (without the `shell` command), logs are printed to `stdout` in structured JSON.
* **Distributed Logs (Loki)**:
  All logs are automatically captured by the OpenTelemetry SDK and exported via OTLP/HTTP to the local OpenTelemetry Collector, which forwards them directly to **Grafana Loki**.

### 2. How to view logs in Grafana

1. **Start the Observability Stack**:
   Make sure Docker compose is up:
   ```bash
   docker compose up -d
   ```
   This spins up the database, OTel Collector, Grafana Loki, and Grafana.
2. **Access Grafana**:
   * Open `http://localhost:3000` in your browser.
   * Log in using default credentials:
     * **Username**: `admin`
     * **Password**: `admin`
3. **Open the Observability Dashboard**:
   * Loki is automatically pre-configured as the default data source, and a custom **NestJS AI Playground Observability** dashboard is pre-loaded.
   * Go to **Dashboards** in the left sidebar and select the **NestJS AI Playground Observability** dashboard.
   * This dashboard displays real-time metrics for:
     * **Log Ingestion Rate**: Ingestion speed.
     * **Error Logs (Last 5m)**: Active error tracking.
     * **ReAct Agent Runs (Last 1h)**: Turn executions count.
     * **Log Console Stream**: A live-tailing console.
4. **Ad-hoc Query & Filter Logs**:
   * Head over to **Explore** in the Grafana sidebar.
   * Write LogQL queries to search your logs, e.g.:
     * Show all playground logs: `{service_name="nestjs-ai-playground"}`
     * Filter by context: `{service_name="nestjs-ai-playground"} | json | context="ReActAgentExecutor"`
     * Filter by trace ID: `{service_name="nestjs-ai-playground"} | json | traceId="th-XXXX"`