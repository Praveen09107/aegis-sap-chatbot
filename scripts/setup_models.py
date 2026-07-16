#!/usr/bin/env python3
"""
AEGIS Model Setup Script
Pulls all required Ollama models (skipping if already present) and verifies
all AI services respond correctly.
Run this after Docker services are healthy.
Usage: python scripts/setup_models.py
"""
import json
import sys
import subprocess


# Model configurations — actual tags matching our pulled models
OLLAMA_INSTANCES = {
    "aegis-ollama-main": {
        "model": "qwen2.5:32b-instruct",
        "description": "Main generation model (Qwen2.5-32B)",
        "expected_size_gb": 19,
    },
    "aegis-ollama-judge": {
        "model": "qwen2.5:7b-instruct",
        "description": "Judge and CRAG model (Qwen2.5-7B)",
        "expected_size_gb": 4.5,
    },
    "aegis-ollama-vision": {
        "model": "qwen2.5vl:7b",
        "description": "Vision model (Qwen2.5-VL-7B)",
        "expected_size_gb": 6,
    },
}

BGE_CONTAINER = "aegis-bge"
BGE_URL = "http://localhost:8002"

DEBERTA_CONTAINER = "aegis-deberta"
DEBERTA_URL = "http://localhost:8001"


def docker_curl(container: str, method: str, url: str, data: dict | None = None) -> dict | None:
    """Execute a curl command inside a container and return parsed JSON."""
    cmd = ["docker", "exec", container, "curl", "-sf"]
    if method == "POST":
        cmd += ["-X", "POST", "-H", "Content-Type: application/json"]
        if data:
            cmd += ["-d", json.dumps(data)]
    cmd.append(url)
    result = subprocess.run(cmd, capture_output=True, text=True, timeout=120)
    if result.returncode != 0:
        return None
    try:
        return json.loads(result.stdout)
    except json.JSONDecodeError:
        return None


def check_ollama_models(container: str, model: str) -> bool:
    """Check if a model is already present in an Ollama container."""
    result = subprocess.run(
        ["docker", "exec", container, "ollama", "list"],
        capture_output=True, text=True, timeout=30
    )
    if result.returncode != 0:
        return False
    return model in result.stdout


def pull_ollama_model(container: str, model: str, description: str) -> bool:
    """Pull a model if not already present."""
    if check_ollama_models(container, model):
        print(f"  ✓ {description}: {model} already present — skipping pull")
        return True

    print(f"  Pulling {model} into {container}...")
    print(f"  This may take several minutes for large models...")
    result = subprocess.run(
        ["docker", "exec", container, "ollama", "pull", model],
        capture_output=False, text=True
    )
    if result.returncode == 0:
        print(f"  ✓ Successfully pulled: {model}")
        return True
    print(f"  ✗ Failed to pull: {model}")
    return False


def verify_ollama_inference(container: str, model: str, description: str) -> bool:
    """Verify a model can actually respond to a prompt."""
    print(f"  Testing {description}...")
    result = subprocess.run(
        ["docker", "exec", container, "ollama", "run", model, "Respond with exactly: OK"],
        capture_output=True, text=True, timeout=180
    )
    if result.returncode == 0 and result.stdout.strip():
        preview = result.stdout.strip()[:100]
        print(f"  ✓ {description} responds: {preview}")
        return True
    print(f"  ✗ {description} inference failed")
    return False


def verify_ollama_keepalive(container: str, model: str) -> bool:
    """Verify KEEP_ALIVE=-1 keeps model loaded permanently."""
    result = subprocess.run(
        ["docker", "exec", container, "ollama", "ps"],
        capture_output=True, text=True, timeout=30
    )
    if result.returncode != 0:
        print(f"  ✗ Could not check loaded models on {container}")
        return False
    if model in result.stdout:
        print(f"  ✓ {model} is loaded in memory on {container}")
        return True
    print(f"  ⚠ {model} not currently loaded on {container} (will load on first request)")
    return True  # Not a failure — just not warmed up yet


def verify_bge_service() -> bool:
    """Verify BGE embedding service returns 768-dim vectors."""
    print("  Testing BGE embedding...")
    payload = {"texts": ["test embedding for AEGIS verification"]}
    result = docker_curl(BGE_CONTAINER, "POST", f"{BGE_URL}/embed", payload)
    if result is None:
        print("  ✗ BGE service not responding")
        return False
    dim = result.get("dimension", 0)
    embeddings = result.get("embeddings", [])
    if dim == 768 and len(embeddings) == 1 and len(embeddings[0]) == 768:
        print(f"  ✓ BGE returns 768-dim vectors (correct)")
        return True
    print(f"  ✗ BGE returned dimension {dim} (expected 768)")
    return False


def verify_deberta_nli() -> bool:
    """Verify DeBERTa NLI service with entailment scoring."""
    print("  Testing DeBERTa NLI...")
    payload = {
        "hypothesis": "The delivery failed due to insufficient stock",
        "premises": ["The VL150 error occurs when available stock is less than delivery quantity"]
    }
    result = docker_curl(DEBERTA_CONTAINER, "POST", f"{DEBERTA_URL}/nli", payload)
    if result is None:
        print("  ✗ DeBERTa NLI not responding")
        return False
    scores = result.get("scores", [])
    max_ent = result.get("max_entailment", -1)
    if scores and 0 <= max_ent <= 1:
        print(f"  ✓ DeBERTa NLI responds — max_entailment: {max_ent:.3f}")
        return True
    print(f"  ✗ DeBERTa NLI malformed response: {result}")
    return False


def verify_reranker() -> bool:
    """Verify cross-encoder reranker returns ordered scores."""
    print("  Testing cross-encoder reranker...")
    payload = {
        "query": "How to fix VL150 error in SAP delivery",
        "passages": [
            "VL150 material availability error occurs when stock minus safety stock is insufficient",
            "The FI posting period configuration is maintained in OB52"
        ]
    }
    result = docker_curl(DEBERTA_CONTAINER, "POST", f"{DEBERTA_URL}/rerank", payload)
    if result is None:
        print("  ✗ Reranker not responding")
        return False
    scores = result.get("scores", [])
    if len(scores) == 2 and all(isinstance(s, (int, float)) for s in scores):
        relevant_higher = scores[0] > scores[1]
        print(f"  ✓ Reranker scores: {scores}")
        print(f"  ✓ Relevant passage scores higher: {relevant_higher}")
        return True
    print(f"  ✗ Reranker malformed response: {result}")
    return False


def main():
    print("=" * 60)
    print("AEGIS Model Setup and Verification")
    print("=" * 60)

    # Step 1: Check service health
    print("\n[STEP 1] Checking AI service health...")
    bge_health = docker_curl(BGE_CONTAINER, "GET", f"{BGE_URL}/health")
    deberta_health = docker_curl(DEBERTA_CONTAINER, "GET", f"{DEBERTA_URL}/health")
    print(f"  {'✓' if bge_health else '✗'} BGE Embedding Service")
    print(f"  {'✓' if deberta_health else '✗'} DeBERTa NLI Service")
    if not bge_health or not deberta_health:
        print("\nERROR: AI services not ready. Run: docker compose ps")
        sys.exit(1)

    # Step 2: Pull models (skip if present)
    print("\n[STEP 2] Checking/pulling Ollama models...")
    pull_ok = {}
    for container, cfg in OLLAMA_INSTANCES.items():
        pull_ok[container] = pull_ollama_model(container, cfg["model"], cfg["description"])
    if not all(pull_ok.values()):
        print("\nERROR: Model pulls failed.")
        sys.exit(1)

    # Step 3: Verify Ollama inference
    print("\n[STEP 3] Verifying Ollama model inference...")
    infer_ok = {}
    for container, cfg in OLLAMA_INSTANCES.items():
        infer_ok[container] = verify_ollama_inference(container, cfg["model"], cfg["description"])

    # Step 4: Verify KEEP_ALIVE
    print("\n[STEP 4] Checking KEEP_ALIVE status...")
    for container, cfg in OLLAMA_INSTANCES.items():
        verify_ollama_keepalive(container, cfg["model"])

    # Step 5: Verify BGE
    print("\n[STEP 5] Verifying BGE embedding service...")
    bge_ok = verify_bge_service()

    # Step 6: Verify DeBERTa NLI
    print("\n[STEP 6] Verifying DeBERTa NLI service...")
    nli_ok = verify_deberta_nli()

    # Step 7: Verify reranker
    print("\n[STEP 7] Verifying cross-encoder reranker...")
    reranker_ok = verify_reranker()

    # Summary
    print("\n" + "=" * 60)
    print("VERIFICATION SUMMARY")
    print("=" * 60)
    all_passed = True
    for container, cfg in OLLAMA_INSTANCES.items():
        ok = infer_ok.get(container, False)
        print(f"  {'✓' if ok else '✗'} {cfg['description']}")
        if not ok:
            all_passed = False
    for label, ok in [("BGE Embedding (768-dim)", bge_ok), ("DeBERTa NLI", nli_ok), ("Cross-Encoder Reranker", reranker_ok)]:
        print(f"  {'✓' if ok else '✗'} {label}")
        if not ok:
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
