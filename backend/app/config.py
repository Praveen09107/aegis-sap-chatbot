"""
AEGIS Configuration Module
Reads all environment variables and exposes them as typed constants.
All values in this file come from AEGIS_CONFIGURATION_CONSTANTS.md.
This file is implemented fully in Session 02.
"""
import os
from dotenv import load_dotenv

load_dotenv()

# This file will be fully implemented in Session 02 (environment setup).
# All constants defined in AEGIS_CONFIGURATION_CONSTANTS.md will be here.
# Placeholder to establish module structure.

ENVIRONMENT = os.getenv("ENVIRONMENT", "demo")
LOG_LEVEL = os.getenv("LOG_LEVEL", "INFO")

# Redis
REDIS_SESSION_URL = os.getenv("REDIS_SESSION_URL", "redis://localhost:6379/0")
REDIS_QUEUE_URL = os.getenv("REDIS_QUEUE_URL", "redis://localhost:6380/0")

# Qdrant
QDRANT_HOST = os.getenv("QDRANT_HOST", "localhost")
QDRANT_PORT = int(os.getenv("QDRANT_PORT", "6333"))

# Note: Full implementation added in Session 02
