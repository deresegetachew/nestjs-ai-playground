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

command to run interfactive shell

```
pnpm start:dev -- shell 
```