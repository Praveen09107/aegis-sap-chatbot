# IMPL_04: AI MODELS SETUP
## Pulling Ollama Models and Verifying All AI Inference Services
## Session 04 Implementation Guide

---

## AGENT INSTRUCTIONS FOR THIS SESSION

You are implementing Session 04: Pull all AI models and verify all inference services.

Attach: AEGIS_MASTER_REFERENCE.md, AEGIS_DATA_CONTRACTS.md, AEGIS_CONFIGURATION_CONSTANTS.md, and this document.

**Prerequisites:** Session 03 must be complete. All 19 Docker services must be running and healthy before starting this session. Run `docker compose ps` and confirm all containers show "healthy" status.

**Important warning:** Pulling the Qwen2.5-32B model requires approximately 19GB of download. Ensure the server has sufficient disk space (at least 40GB free) before starting. The download may take 30-60 minutes depending on internet speed.

---

## PART 1 — VERIFY SERVICES ARE READY

```bash
# Confirm all services are running before pulling models
docker compose ps --format "table {{.Name}}\t{{.Status}}\t{{.Health}}"

# Specifically confirm Ollama instances are healthy
docker exec aegis-ollama-main curl -sf http://localhost:11434/api/tags
docker exec aegis-ollama-judge curl -sf http://localhost:11434/api/tags
docker exec aegis-ollama-vision curl -sf http://localhost:11434/api/tags

# Check available disk space (need at least 40GB free)
df -h /var/lib/docker
```

Expected: All Ollama instances return `{"models":[]}` (empty model list — no models pulled yet). Disk has at least 40GB free.

---

## PART 2 — CREATE THE MODEL SETUP SCRIPT

Create this file at `scripts/setup_models.py`. This script pulls all models and verifies them.

```python
#!/usr/bin/env python3
"""
AEGIS Model Setup Script
Pulls all required Ollama models and verifies all AI services respond correctly.
Run this after Docker services are healthy.
Usage: python scripts/setup_models.py
"""
import json
import sys
import time
import subprocess
import urllib.request
import urllib.error

# Model configurations from AEGIS_CONFIGURATION_CONSTANTS.md
OLLAMA_INSTANCES = {
    "aegis-ollama-main": {
        "port": 11434,
        "model": "qwen2.5:32b-instruct-q4_K_M",
        "model_short": "qwen2.5:32b",  # Fallback search name
        "description": "Main generation model (Qwen2.5-32B)",
        "expected_size_gb": 19,
    },
    "aegis-ollama-judge": {
        "port": 11434,
        "model": "qwen2.5:7b-instruct-q4_K_M",
        "model_short": "qwen2.5:7b",
        "description": "Judge and CRAG model (Qwen2.5-7B)",
        "expected_size_gb": 4.5,
    },
    "aegis-ollama-vision": {
        "port": 11434,
        "model": "qwen2.5vl:7b-instruct-q4_K_M",
        "model_short": "qwen2.5vl:7b",
        "description": "Vision model (Qwen2.5-VL-7B)",
        "expected_size_gb": 5,
    },
}

BGE_SERVICE_URL = "http://localhost:8002"
DEBERTA_SERVICE_URL = "http://localhost:8001"


def check_service(url: str, service_name: str) -> bool:
    try:
        req = urllib.request.urlopen(f"{url}/health", timeout=10)
        data = json.loads(req.read())
        print(f"  ✓ {service_name} healthy: {data}")
        return True
    except Exception as e:
        print(f"  ✗ {service_name} not ready: {e}")
        return False


def pull_ollama_model(container: str, model: str, description: str) -> bool:
    print(f"\nPulling {description}...")
    print(f"  Model: {model}")
    print(f"  Container: {container}")
    print(f"  This may take several minutes for large models...")
    
    result = subprocess.run(
        ["docker", "exec", container, "ollama", "pull", model],
        capture_output=False,  # Show progress output
        text=True
    )
    
    if result.returncode == 0:
        print(f"  ✓ Successfully pulled: {model}")
        return True
    else:
        print(f"  ✗ Failed to pull: {model}")
        print(f"    If this fails, check available model names with:")
        print(f"    docker exec {container} ollama search qwen2.5")
        return False


def verify_ollama_model(container: str, model: str, description: str) -> bool:
    print(f"\nVerifying {description}...")
    
    # Check model is listed
    result = subprocess.run(
        ["docker", "exec", container, "ollama", "list"],
        capture_output=True, text=True
    )
    if model.split(":")[0] not in result.stdout and model not in result.stdout:
        print(f"  ✗ Model not found in ollama list")
        return False
    
    # Run a minimal test inference
    test_prompt = "Respond with exactly: OK"
    result = subprocess.run(
        ["docker", "exec", container, "ollama", "run", model, test_prompt],
        capture_output=True, text=True, timeout=120
    )
    
    if result.returncode == 0 and result.stdout.strip():
        print(f"  ✓ Model responds to test inference")
        print(f"  Response preview: {result.stdout.strip()[:100]}")
        return True
    else:
        print(f"  ✗ Model inference failed: {result.stderr[:200]}")
        return False


def verify_bge_service() -> bool:
    print("\nVerifying BGE Embedding Service...")
    try:
        data = json.dumps({"texts": ["test embedding for AEGIS verification"]}).encode()
        req = urllib.request.Request(
            f"{BGE_SERVICE_URL}/embed",
            data=data,
            headers={"Content-Type": "application/json"}
        )
        resp = urllib.request.urlopen(req, timeout=30)
        result = json.loads(resp.read())
        
        dim = result.get("dimension", 0)
        embeddings = result.get("embeddings", [])
        
        if dim == 768 and len(embeddings) == 1 and len(embeddings[0]) == 768:
            print(f"  ✓ BGE service returns 768-dim vectors (CORRECT)")
            return True
        else:
            print(f"  ✗ BGE service returned dimension {dim} (expected 768)")
            return False
    except Exception as e:
        print(f"  ✗ BGE service failed: {e}")
        return False


def verify_deberta_service() -> bool:
    print("\nVerifying DeBERTa NLI Service...")
    try:
        test_payload = {
            "hypothesis": "The delivery failed due to insufficient stock",
            "premises": ["The VL150 error occurs when available stock is less than delivery quantity"]
        }
        data = json.dumps(test_payload).encode()
        req = urllib.request.Request(
            f"{DEBERTA_SERVICE_URL}/nli",
            data=data,
            headers={"Content-Type": "application/json"}
        )
        resp = urllib.request.urlopen(req, timeout=60)
        result = json.loads(resp.read())
        
        max_ent = result.get("max_entailment", 0)
        scores = result.get("scores", [])
        
        if scores and 0 <= max_ent <= 1:
            print(f"  ✓ DeBERTa NLI responds correctly")
            print(f"  Max entailment score: {max_ent:.3f}")
            return True
        else:
            print(f"  ✗ DeBERTa response malformed: {result}")
            return False
    except Exception as e:
        print(f"  ✗ DeBERTa NLI failed: {e}")
        return False


def verify_reranker() -> bool:
    print("\nVerifying Cross-Encoder Reranker...")
    try:
        test_payload = {
            "query": "How to fix VL150 error in SAP delivery",
            "passages": [
                "VL150 material availability error occurs when stock minus safety stock is insufficient",
                "The FI posting period configuration is maintained in OB52"
            ]
        }
        data = json.dumps(test_payload).encode()
        req = urllib.request.Request(
            f"{DEBERTA_SERVICE_URL}/rerank",
            data=data,
            headers={"Content-Type": "application/json"}
        )
        resp = urllib.request.urlopen(req, timeout=60)
        result = json.loads(resp.read())
        
        scores = result.get("scores", [])
        if len(scores) == 2 and all(isinstance(s, float) for s in scores):
            print(f"  ✓ Reranker responds correctly")
            print(f"  Scores: {scores}")
            print(f"  ✓ First passage (VL150 relevant) scores higher: {scores[0] > scores[1]}")
            return True
        else:
            print(f"  ✗ Reranker response malformed: {result}")
            return False
    except Exception as e:
        print(f"  ✗ Reranker failed: {e}")
        return False


def main():
    print("=" * 60)
    print("AEGIS Model Setup and Verification")
    print("=" * 60)
    
    # Step 1: Verify embedding and NLI services are ready
    print("\n[STEP 1] Checking AI microservices health...")
    bge_ready = check_service(BGE_SERVICE_URL, "BGE Embedding Service")
    deberta_ready = check_service(DEBERTA_SERVICE_URL, "DeBERTa NLI Service")
    
    if not bge_ready or not deberta_ready:
        print("\nERROR: AI services not ready. Wait for Docker containers to finish starting.")
        print("Run: docker compose ps")
        sys.exit(1)
    
    # Step 2: Pull all Ollama models
    print("\n[STEP 2] Pulling Ollama models...")
    pull_results = {}
    for container, config in OLLAMA_INSTANCES.items():
        success = pull_ollama_model(container, config["model"], config["description"])
        pull_results[container] = success
    
    # Check all pulls succeeded
    if not all(pull_results.values()):
        print("\nERROR: Some model pulls failed. Check the output above.")
        print("If model names are wrong, search with: docker exec {container} ollama search qwen2.5")
        sys.exit(1)
    
    # Step 3: Verify each Ollama model
    print("\n[STEP 3] Verifying Ollama model inference...")
    verify_results = {}
    for container, config in OLLAMA_INSTANCES.items():
        success = verify_ollama_model(container, config["model"], config["description"])
        verify_results[container] = success
    
    # Step 4: Verify BGE embedding service
    print("\n[STEP 4] Verifying BGE embedding service...")
    bge_ok = verify_bge_service()
    
    # Step 5: Verify DeBERTa NLI service
    print("\n[STEP 5] Verifying DeBERTa NLI service...")
    deberta_ok = verify_deberta_service()
    
    # Step 6: Verify cross-encoder reranker
    print("\n[STEP 6] Verifying cross-encoder reranker...")
    reranker_ok = verify_reranker()
    
    # Final summary
    print("\n" + "=" * 60)
    print("VERIFICATION SUMMARY")
    print("=" * 60)
    
    all_passed = True
    for container, config in OLLAMA_INSTANCES.items():
        status = "✓" if verify_results.get(container) else "✗"
        print(f"  {status} {config['description']}")
        if not verify_results.get(container):
            all_passed = False
    
    print(f"  {'✓' if bge_ok else '✗'} BGE Embedding Service (768-dim vectors)")
    print(f"  {'✓' if deberta_ok else '✗'} DeBERTa NLI Service")
    print(f"  {'✓' if reranker_ok else '✗'} Cross-Encoder Reranker")
    
    if not bge_ok or not deberta_ok or not reranker_ok:
        all_passed = False
    
    print("\n" + "=" * 60)
    if all_passed:
        print("✓ ALL MODELS VERIFIED SUCCESSFULLY")
        print("The AEGIS AI inference layer is ready.")
        sys.exit(0)
    else:
        print("✗ SOME MODELS FAILED VERIFICATION")
        print("Resolve failures before proceeding to Session 05.")
        sys.exit(1)


if __name__ == "__main__":
    main()
```

---

## PART 3 — RUN THE MODEL SETUP SCRIPT

```bash
# From project root
python scripts/setup_models.py
```

**Important notes:**
- The Qwen2.5-32B model pull takes the longest. Expect 30-60 minutes for download.
- During the pull, progress bars show in the terminal. This is normal.
- If a model pull fails with "model not found", run: `docker exec aegis-ollama-main ollama search qwen2.5` and find the correct model tag.

---

## PART 4 — VERIFY KEEP_ALIVE IS WORKING

After pulling models, verify that OLLAMA_KEEP_ALIVE=-1 is preventing model unloading.

```bash
# List loaded models on each instance
docker exec aegis-ollama-main ollama ps
docker exec aegis-ollama-judge ollama ps
docker exec aegis-ollama-vision ollama ps
```

Expected: Each shows the loaded model with `Until` showing `Forever`. If `Until` shows a time, KEEP_ALIVE is not set correctly — check the Docker Compose environment variable.

---

## PART 5 — CREATE A MODEL INFO REFERENCE FILE

Create `scripts/model_info.txt` with the exact model names that were successfully pulled. This file is referenced by later sessions.

```bash
echo "Documenting pulled model names..."

# List all models across all instances
echo "=== aegis-ollama-main ===" > scripts/model_info.txt
docker exec aegis-ollama-main ollama list >> scripts/model_info.txt

echo "=== aegis-ollama-judge ===" >> scripts/model_info.txt
docker exec aegis-ollama-judge ollama list >> scripts/model_info.txt

echo "=== aegis-ollama-vision ===" >> scripts/model_info.txt
docker exec aegis-ollama-vision ollama list >> scripts/model_info.txt

cat scripts/model_info.txt
```

---

## VERIFICATION STEPS

### Final verification — run the complete script
```bash
python scripts/setup_models.py
```
Expected final output: `✓ ALL MODELS VERIFIED SUCCESSFULLY`

### Manual sanity check — test each model directly
```bash
# Test main generation model
docker exec aegis-ollama-main ollama run qwen2.5:32b-instruct-q4_K_M \
  "What is transaction VL01N in SAP? Respond in one sentence." 2>&1 | head -5

# Test judge model
docker exec aegis-ollama-judge ollama run qwen2.5:7b-instruct-q4_K_M \
  "Respond with exactly the word: READY" 2>&1 | head -3
```

Expected: Models respond with relevant content within 30-60 seconds.

---

## WHEN ALL VERIFICATIONS PASS

```bash
git add -A
git commit -m "IMPL-04: AI models setup - all models verified responding"
```

Update `specs/tier3_verification/DECISIONS_LOG.md` with:
- All three Ollama models pulled and verified
- Exact model tags that were successfully pulled (copy from model_info.txt)
- BGE embedding service verified returning 768-dim vectors
- DeBERTa NLI and reranker verified
- Any model name differences from AEGIS_CONFIGURATION_CONSTANTS.md

---

*Document version: 1.0 | AEGIS Specification Set*
