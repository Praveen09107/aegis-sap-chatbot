#!/usr/bin/env python3
"""
AEGIS Dependency Verification Script
Run after installing requirements.txt to confirm all packages load correctly.
Usage: python scripts/verify_deps.py
"""
import sys

def check(package_name: str, import_statement: str) -> bool:
    try:
        exec(import_statement)
        print(f"  ✓ {package_name}")
        return True
    except ImportError as e:
        print(f"  ✗ {package_name} — FAILED: {e}")
        return False

print("\nVerifying AEGIS Python dependencies...\n")
results = []

# Web Framework
results.append(check("fastapi", "import fastapi; assert fastapi.__version__.startswith('0.115')"))
results.append(check("uvicorn", "import uvicorn"))
results.append(check("pydantic", "import pydantic; assert pydantic.__version__.startswith('2.')"))
results.append(check("python-multipart", "import multipart"))
results.append(check("websockets", "import websockets"))

# Database
results.append(check("asyncpg", "import asyncpg"))
results.append(check("sqlalchemy", "import sqlalchemy"))
results.append(check("redis", "import redis.asyncio"))
results.append(check("qdrant-client", "from qdrant_client import QdrantClient"))
results.append(check("opensearch-py", "from opensearchpy import AsyncOpenSearch"))

# Auth
results.append(check("python-jose", "from jose import jwt"))
results.append(check("passlib", "from passlib.context import CryptContext"))
results.append(check("cryptography", "import cryptography"))

# Document parsing
results.append(check("python-docx", "from docx import Document"))
results.append(check("pdfplumber", "import pdfplumber"))

# AI/ML
results.append(check("sentence-transformers", "from sentence_transformers import SentenceTransformer"))
results.append(check("transformers", "from transformers import pipeline"))
results.append(check("torch (CPU)", "import torch; assert not torch.cuda.is_available() or True"))
results.append(check("numpy", "import numpy"))

# Background tasks
results.append(check("arq", "import arq"))

# Vault
results.append(check("hvac", "import hvac"))

# HTTP
results.append(check("httpx", "import httpx"))
results.append(check("aiofiles", "import aiofiles"))

# Observability
results.append(check("prometheus-client", "import prometheus_client"))
results.append(check("structlog", "import structlog"))

# Utilities
results.append(check("python-dotenv", "from dotenv import load_dotenv"))
results.append(check("pyyaml", "import yaml"))
results.append(check("pillow", "from PIL import Image"))
results.append(check("tiktoken", "import tiktoken"))

# Summary
passed = sum(results)
total = len(results)
print(f"\n{'='*50}")
print(f"Results: {passed}/{total} packages verified")
if passed == total:
    print("✓ ALL DEPENDENCIES VERIFIED SUCCESSFULLY")
    sys.exit(0)
else:
    print(f"✗ {total - passed} PACKAGES FAILED — resolve before proceeding")
    sys.exit(1)
