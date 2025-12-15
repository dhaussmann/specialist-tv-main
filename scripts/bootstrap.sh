#!/bin/bash

# ============================================================================
# Specialist TV - Bootstrap Script
# ============================================================================
# This script sets up everything needed to run Specialist TV after forking.
# It handles: dependencies, Cloudflare resources, database, and first admin.
#
# Usage: ./scripts/bootstrap.sh [--local|--remote] [admin-email]
#
# Examples:
#   ./scripts/bootstrap.sh --local                    # Local dev setup only
#   ./scripts/bootstrap.sh --remote admin@email.com  # Full production setup
# ============================================================================

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Parse arguments
MODE="local"
ADMIN_EMAIL=""

while [[ $# -gt 0 ]]; do
  case $1 in
    --local)
      MODE="local"
      shift
      ;;
    --remote)
      MODE="remote"
      shift
      ;;
    *)
      ADMIN_EMAIL="$1"
      shift
      ;;
  esac
done

echo ""
echo -e "${CYAN}╔════════════════════════════════════════════════════════════════╗${NC}"
echo -e "${CYAN}║           🎬 Specialist TV - Bootstrap Setup                   ║${NC}"
echo -e "${CYAN}╚════════════════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "${BLUE}Mode:${NC} $MODE"
[[ -n "$ADMIN_EMAIL" ]] && echo -e "${BLUE}Admin Email:${NC} $ADMIN_EMAIL"
echo ""

# ============================================================================
# Step 1: Prerequisites Check
# ============================================================================
echo -e "${YELLOW}━━━ Step 1: Checking Prerequisites ━━━${NC}"

# Check Node.js
if ! command -v node &> /dev/null; then
  echo -e "${RED}❌ Node.js not found. Please install Node.js 18+ first.${NC}"
  exit 1
fi
NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [[ $NODE_VERSION -lt 18 ]]; then
  echo -e "${RED}❌ Node.js 18+ required. Current: $(node -v)${NC}"
  exit 1
fi
echo -e "${GREEN}✓${NC} Node.js $(node -v)"

# Check npm
if ! command -v npm &> /dev/null; then
  echo -e "${RED}❌ npm not found.${NC}"
  exit 1
fi
echo -e "${GREEN}✓${NC} npm $(npm -v)"

# Check wrangler
if ! command -v wrangler &> /dev/null; then
  echo -e "${YELLOW}⚠ Wrangler not found. Installing...${NC}"
  npm install -g wrangler
fi
echo -e "${GREEN}✓${NC} Wrangler $(wrangler --version 2>/dev/null | head -1)"

# Check wrangler login (only for remote mode)
if [[ "$MODE" == "remote" ]]; then
  if ! wrangler whoami &> /dev/null 2>&1; then
    echo -e "${YELLOW}⚠ Not logged in to Cloudflare. Please run:${NC}"
    echo "  wrangler login"
    exit 1
  fi
  ACCOUNT_INFO=$(wrangler whoami 2>/dev/null | grep -o 'Account Name.*' | head -1 || echo "Logged in")
  echo -e "${GREEN}✓${NC} Cloudflare: $ACCOUNT_INFO"
fi

echo ""

# ============================================================================
# Step 2: Install Dependencies
# ============================================================================
echo -e "${YELLOW}━━━ Step 2: Installing Dependencies ━━━${NC}"

if [[ -f "package-lock.json" ]]; then
  npm ci
else
  npm install
fi
echo -e "${GREEN}✓${NC} Dependencies installed"
echo ""

# ============================================================================
# Step 3: Environment Setup
# ============================================================================
echo -e "${YELLOW}━━━ Step 3: Environment Setup ━━━${NC}"

# Create .dev.vars if it doesn't exist
if [[ ! -f ".dev.vars" ]]; then
  if [[ -f ".dev.vars.example" ]]; then
    cp .dev.vars.example .dev.vars
    echo -e "${GREEN}✓${NC} Created .dev.vars from example"
    echo -e "${YELLOW}  ⚠ Please edit .dev.vars with your actual values${NC}"
  else
    echo -e "${YELLOW}⚠${NC} No .dev.vars.example found, skipping"
  fi
else
  echo -e "${GREEN}✓${NC} .dev.vars already exists"
fi

echo ""

# ============================================================================
# Step 4: Create Cloudflare Resources (Remote Mode Only)
# ============================================================================
if [[ "$MODE" == "remote" ]]; then
  echo -e "${YELLOW}━━━ Step 4: Creating Cloudflare Resources ━━━${NC}"

  # Create D1 Database
  echo -e "${BLUE}Creating D1 database...${NC}"
  DB_OUTPUT=$(wrangler d1 create specialist-tv-db 2>&1) || true
  if echo "$DB_OUTPUT" | grep -q "already exists"; then
    echo -e "${GREEN}✓${NC} D1 database already exists"
  elif echo "$DB_OUTPUT" | grep -q "database_id"; then
    DB_ID=$(echo "$DB_OUTPUT" | grep -o '"[a-f0-9-]*"' | tr -d '"' | head -1)
    echo -e "${GREEN}✓${NC} D1 database created: $DB_ID"
    
    # Update wrangler.jsonc with database ID
    if [[ -n "$DB_ID" ]] && grep -q "your-database-id" wrangler.jsonc 2>/dev/null; then
      if [[ "$OSTYPE" == "darwin"* ]]; then
        sed -i '' "s/your-database-id/$DB_ID/g" wrangler.jsonc
      else
        sed -i "s/your-database-id/$DB_ID/g" wrangler.jsonc
      fi
      echo -e "${GREEN}✓${NC} Updated wrangler.jsonc with database ID"
    fi
  else
    echo -e "${GREEN}✓${NC} D1 database ready"
  fi

  # Create R2 Bucket
  echo -e "${BLUE}Creating R2 bucket...${NC}"
  R2_OUTPUT=$(wrangler r2 bucket create specialist-tv-thumbnails 2>&1) || true
  if echo "$R2_OUTPUT" | grep -q "already exists"; then
    echo -e "${GREEN}✓${NC} R2 bucket already exists"
  else
    echo -e "${GREEN}✓${NC} R2 bucket created"
  fi

  # Create Queue
  echo -e "${BLUE}Creating Queue...${NC}"
  QUEUE_OUTPUT=$(wrangler queues create video-processing 2>&1) || true
  if echo "$QUEUE_OUTPUT" | grep -q "already exists"; then
    echo -e "${GREEN}✓${NC} Queue already exists"
  else
    echo -e "${GREEN}✓${NC} Queue created"
  fi

  # Create Vectorize Index
  echo -e "${BLUE}Creating Vectorize index...${NC}"
  VECTORIZE_OUTPUT=$(wrangler vectorize create video-embeddings --dimensions=768 --metric=cosine 2>&1) || true
  if echo "$VECTORIZE_OUTPUT" | grep -q "already exists"; then
    echo -e "${GREEN}✓${NC} Vectorize index already exists"
  else
    echo -e "${GREEN}✓${NC} Vectorize index created"
  fi

  echo ""
fi

# ============================================================================
# Step 5: Database Migrations
# ============================================================================
echo -e "${YELLOW}━━━ Step 5: Running Database Migrations ━━━${NC}"

if [[ "$MODE" == "remote" ]]; then
  echo -e "${BLUE}Applying migrations to remote database...${NC}"
  wrangler d1 migrations apply DB --remote
  echo -e "${GREEN}✓${NC} Remote database migrations applied"
else
  echo -e "${BLUE}Applying migrations to local database...${NC}"
  wrangler d1 migrations apply DB --local
  echo -e "${GREEN}✓${NC} Local database migrations applied"
fi

echo ""

# ============================================================================
# Step 6: Create First Admin (When Email Provided)
# ============================================================================
if [[ -n "$ADMIN_EMAIL" ]]; then
  echo -e "${YELLOW}━━━ Step 6: Creating First Admin ━━━${NC}"
  
  # Generate a random ID
  ADMIN_ID=$(openssl rand -hex 16)
  
  echo -e "${BLUE}Creating admin user and invitation for: $ADMIN_EMAIL${NC}"
  
  ADMIN_PERMISSIONS='["videos.view","videos.create","videos.edit","videos.delete","users.view","users.create","users.edit","users.delete","admin.access","creator.access"]'
  
  if [[ "$MODE" == "remote" ]]; then
    # Create user directly as admin (name will be filled by OAuth on first sign-in)
    wrangler d1 execute DB --remote --command "
INSERT OR REPLACE INTO users (
  id,
  email,
  name,
  role,
  permissions,
  is_active,
  created_at,
  updated_at
) VALUES (
  '$ADMIN_ID',
  '$ADMIN_EMAIL',
  NULL,
  'admin',
  '$ADMIN_PERMISSIONS',
  1,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
);
"
  else
    # Create user directly as admin (name will be filled by OAuth on first sign-in)
    wrangler d1 execute DB --local --command "
INSERT OR REPLACE INTO users (
  id,
  email,
  name,
  role,
  permissions,
  is_active,
  created_at,
  updated_at
) VALUES (
  '$ADMIN_ID',
  '$ADMIN_EMAIL',
  NULL,
  'admin',
  '$ADMIN_PERMISSIONS',
  1,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
);
"
  fi
  
  echo -e "${GREEN}✓${NC} Admin user created for $ADMIN_EMAIL"
  echo -e "${CYAN}  → Sign in with Google using this email to access the app${NC}"
  echo ""
fi

# ============================================================================
# Step 7: Build Application
# ============================================================================
echo -e "${YELLOW}━━━ Step 7: Building Application ━━━${NC}"

# Clean previous build artifacts to avoid stale file issues
if [[ -d ".open-next" ]]; then
  echo -e "${BLUE}Cleaning previous build...${NC}"
  rm -rf .open-next
fi

npm run build
echo -e "${GREEN}✓${NC} Application built successfully"
echo ""

# ============================================================================
# Summary & Next Steps
# ============================================================================
echo -e "${CYAN}╔════════════════════════════════════════════════════════════════╗${NC}"
echo -e "${CYAN}║                    🎉 Setup Complete!                          ║${NC}"
echo -e "${CYAN}╚════════════════════════════════════════════════════════════════╝${NC}"
echo ""

if [[ "$MODE" == "local" ]]; then
  echo -e "${GREEN}Local development is ready!${NC}"
  echo ""
  echo -e "${BLUE}Next steps:${NC}"
  echo "  1. Edit .dev.vars with your credentials"
  echo "  2. Run: npm run dev"
  echo ""
  echo -e "${YELLOW}For production deployment, run:${NC}"
  echo "  ./scripts/bootstrap.sh --remote your-email@example.com"
else
  echo -e "${GREEN}Production setup complete!${NC}"
  echo ""
  echo -e "${BLUE}Required secrets (set via wrangler secret put):${NC}"
  echo "  • CLOUDFLARE_ACCOUNT_ID    - Your Cloudflare account ID"
  echo "  • CLOUDFLARE_API_TOKEN     - API token with Stream permissions"
  echo "  • AUTH_SECRET              - Random string for session encryption"
  echo "  • GOOGLE_CLIENT_ID         - Google OAuth client ID"
  echo "  • GOOGLE_CLIENT_SECRET     - Google OAuth client secret"
  echo ""
  echo -e "${BLUE}Optional secrets:${NC}"
  echo "  • YOUTUBE_API_KEY          - For enhanced YouTube metadata"
  echo "  • OPENAI_API_KEY           - For enhanced AI features"
  echo ""
  echo -e "${BLUE}Deploy with:${NC}"
  echo "  npm run deploy"
  echo ""
  if [[ -n "$ADMIN_EMAIL" ]]; then
    echo -e "${GREEN}Admin access:${NC}"
    echo "  Sign in with Google using: $ADMIN_EMAIL"
  fi
fi

echo ""
echo -e "${CYAN}📚 See README.md for detailed documentation${NC}"
echo ""
