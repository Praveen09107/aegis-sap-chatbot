# AEGIS — Adaptive Enterprise Grade Intelligence System
## Sona Comstar SAP Helpdesk AI Platform

## Quick Start

### Prerequisites
- Python 3.11+
- Node.js 20+
- Docker with Docker Compose plugin
- OpenSSL

### First-Time Setup
```bash
# 1. Install Python dependencies
cd backend && python3 -m venv venv && source venv/bin/activate
pip install torch==2.5.1+cpu --index-url https://download.pytorch.org/whl/cpu
pip install -r requirements.txt && cd ..

# 2. Install frontend dependencies
cd frontend && npm install && cd ..

# 3. Start all services
docker compose up -d

# 4. Check system health
python scripts/verify_health.py
```

### Architecture
AEGIS is a six-zone enterprise AI platform with zero-trust security,
adaptive tri-modal retrieval, and three-tier answer validation.
See specs/ directory for complete architecture documentation.

### Specifications
All architecture and implementation specifications are in the specs/ directory.
- specs/tier0_agent_guide/ — Implementation guide for AI-assisted development
- specs/tier1_foundation/ — Core architecture reference documents
- specs/tier2_implementation/ — Step-by-step implementation guides
- specs/tier3_verification/ — Testing and compliance verification
