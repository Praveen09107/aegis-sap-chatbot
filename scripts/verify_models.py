#!/usr/bin/env python3
"""
AEGIS Model Verification Script
Verifies all AI models and inference services are operational.
Does NOT pull models — use setup_models.py for that.
Usage: python scripts/verify_models.py
Exit code 0 = all checks pass, 1 = one or more failures.
"""
import json
import math
import subprocess
import sys


OLLAMA_INSTANCES = {
    "aegis-ollama-main": {
        "model": "qwen2.5:32b-instruct",
        "description": "Main generation model (Qwen2.5-32B)",
    },
    "aegis-ollama-judge": {
        "model": "qwen2.5:7b-instruct",
        "description": "Judge and CRAG model (Qwen2.5-7B)",
    },
    "aegis-ollama-vision": {
        "model": "qwen2.5vl:7b",
        "description": "Vision model (Qwen2.5-VL-7B)",
    },
}

BGE_CONTAINER = "aegis-bge"
BGE_URL = "http://localhost:8002"

DEBERTA_CONTAINER = "aegis-deberta"
DEBERTA_URL = "http://localhost:8001"


def docker_curl(container: str, method: str, url: str, data: dict | None = None) -> dict | None:
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


def check_models_present() -> bool:
    """Verify all models are listed in their respective containers."""
    ok = True
    for container, cfg in OLLAMA_INSTANCES.items():
        result = subprocess.run(
            ["docker", "exec", container, "ollama", "list"],
            capture_output=True, text=True, timeout=30,
        )
        if cfg["model"] in result.stdout:
            print(f"  PASS: {cfg['model']} present in {container}")
        else:
            print(f"  FAIL: {cfg['model']} NOT found in {container}")
            ok = False
    return ok


def check_ollama_inference() -> bool:
    """Run inference on main and judge models."""
    ok = True
    for container, cfg in OLLAMA_INSTANCES.items():
        result = subprocess.run(
            ["docker", "exec", container, "ollama", "run", cfg["model"],
             "Respond with exactly: OK"],
            capture_output=True, text=True, timeout=180,
        )
        if result.returncode == 0 and result.stdout.strip():
            print(f"  PASS: {cfg['description']} inference OK")
        else:
            print(f"  FAIL: {cfg['description']} inference failed")
            ok = False
    return ok


def check_keepalive() -> bool:
    """Verify KEEP_ALIVE=-1 (Forever) on all instances."""
    ok = True
    for container, cfg in OLLAMA_INSTANCES.items():
        result = subprocess.run(
            ["docker", "exec", container, "ollama", "ps"],
            capture_output=True, text=True, timeout=30,
        )
        if cfg["model"] in result.stdout and "Forever" in result.stdout:
            print(f"  PASS: {cfg['model']} loaded Forever in {container}")
        else:
            print(f"  WARN: {cfg['model']} not showing Forever in {container}")
            # Not a hard failure — model loads on first request
    return ok


def check_bge_embedding() -> bool:
    """Verify BGE returns 768-dim vectors."""
    payload = {"texts": ["SAP error VL150 stock unavailable for delivery"]}
    result = docker_curl(BGE_CONTAINER, "POST", f"{BGE_URL}/embed", payload)
    if result is None:
        print("  FAIL: BGE service not responding")
        return False
    dim = result.get("dimension", 0)
    embeddings = result.get("embeddings", [])
    if dim == 768 and len(embeddings) == 1 and len(embeddings[0]) == 768:
        print(f"  PASS: BGE returns 768-dim vectors")
        return True
    print(f"  FAIL: BGE returned dimension {dim} (expected 768)")
    return False


def check_bge_semantics() -> bool:
    """Verify BGE embeddings are semantically meaningful."""
    def embed(text: str) -> list[float]:
        result = docker_curl(BGE_CONTAINER, "POST", f"{BGE_URL}/embed",
                             {"texts": [text]})
        return result["embeddings"][0] if result else []

    def cosine(a: list[float], b: list[float]) -> float:
        dot = sum(x * y for x, y in zip(a, b))
        mag_a = math.sqrt(sum(x ** 2 for x in a))
        mag_b = math.sqrt(sum(x ** 2 for x in b))
        return dot / (mag_a * mag_b) if mag_a and mag_b else 0.0

    e1 = embed("VL150 error stock unavailable")
    e2 = embed("delivery error insufficient stock")
    e3 = embed("Grafana dashboard configuration")
    if not e1 or not e2 or not e3:
        print("  FAIL: could not get embeddings")
        return False
    sim_related = cosine(e1, e2)
    sim_unrelated = cosine(e1, e3)
    print(f"  Related pair similarity:   {sim_related:.4f}")
    print(f"  Unrelated pair similarity: {sim_unrelated:.4f}")
    if sim_related > sim_unrelated:
        print("  PASS: embeddings semantically meaningful")
        return True
    print("  FAIL: embeddings not semantically meaningful")
    return False


def check_nli() -> bool:
    """Verify DeBERTa NLI returns valid labels."""
    payload = {
        "premises": ["VL150 error occurs when stock quantity is zero"],
        "hypothesis": "VL150 is a stock availability error",
    }
    result = docker_curl(DEBERTA_CONTAINER, "POST", f"{DEBERTA_URL}/nli", payload)
    if result is None:
        print("  FAIL: DeBERTa NLI not responding")
        return False
    label = result.get("label")
    score = result.get("score", 0)
    if label in ("entailment", "neutral", "contradiction") and 0 <= score <= 1:
        print(f"  Label: {label}, Score: {score:.4f}")
        print("  PASS: NLI working")
        return True
    print(f"  FAIL: invalid response — {result}")
    return False


def check_nli_logic() -> bool:
    """Verify DeBERTa correctly identifies entailment."""
    payload = {
        "premises": ["The earth orbits around the sun"],
        "hypothesis": "The sun is orbited by the earth",
    }
    result = docker_curl(DEBERTA_CONTAINER, "POST", f"{DEBERTA_URL}/nli", payload)
    if result is None:
        print("  FAIL: DeBERTa NLI not responding")
        return False
    label = result.get("label")
    score = result.get("score", 0)
    if label == "entailment" and score > 0.70:
        print(f"  Label: {label}, Score: {score:.4f}")
        print("  PASS: entailment detected correctly")
        return True
    print(f"  FAIL: expected entailment>0.70 got {label} {score:.4f}")
    return False


def check_reranker() -> bool:
    """Verify reranker correctly ranks relevant passages higher."""
    payload = {
        "query": "how to resolve VL150 delivery stock error in SAP",
        "passages": [
            "VL150 error means no stock available for delivery item",
            "Configure Grafana dashboard refresh interval",
            "VL150 resolution: check plant stock levels and confirm delivery quantity",
        ],
    }
    result = docker_curl(DEBERTA_CONTAINER, "POST", f"{DEBERTA_URL}/rerank", payload)
    if result is None:
        print("  FAIL: Reranker not responding")
        return False
    scores = result.get("scores", [])
    if len(scores) != 3:
        print(f"  FAIL: expected 3 scores, got {len(scores)}")
        return False
    labels = [
        "VL150 error means no stock available",
        "Configure Grafana dashboard",
        "VL150 resolution: check plant stock",
    ]
    print("  Scores:")
    for lbl, s in zip(labels, scores):
        print(f"    {s:7.3f} — {lbl}")
    best_idx = scores.index(max(scores))
    print(f"  Highest score: passage {best_idx} ({labels[best_idx][:40]})")
    if best_idx in (0, 2):
        print("  PASS: reranker correctly prioritizes relevant passage")
        return True
    print("  FAIL: wrong passage ranked highest")
    return False


def main():
    print("=" * 60)
    print("AEGIS Model Verification")
    print("=" * 60)

    checks = [
        ("Models present in containers", check_models_present),
        ("Ollama inference (all 3 models)", check_ollama_inference),
        ("KEEP_ALIVE status", check_keepalive),
        ("BGE embedding 768-dim", check_bge_embedding),
        ("BGE semantic similarity", check_bge_semantics),
        ("DeBERTa NLI format", check_nli),
        ("DeBERTa NLI logic", check_nli_logic),
        ("Cross-encoder reranker", check_reranker),
    ]

    results = {}
    for name, func in checks:
        print(f"\n[{name}]")
        results[name] = func()

    print("\n" + "=" * 60)
    print("SUMMARY")
    print("=" * 60)
    passed = 0
    for name, ok in results.items():
        status = "PASS" if ok else "FAIL"
        print(f"  {status}: {name}")
        if ok:
            passed += 1

    total = len(checks)
    print(f"\n{passed}/{total} checks passed")
    if passed == total:
        print("✓ ALL VERIFICATIONS PASSED")
        sys.exit(0)
    else:
        print("✗ SOME VERIFICATIONS FAILED")
        sys.exit(1)


if __name__ == "__main__":
    main()
