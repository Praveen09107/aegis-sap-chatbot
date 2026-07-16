"""
AEGIS Inference Provider Benchmark
Tests the 3 selected free-tier models against AEGIS's ACTUAL prompt shapes,
not generic chat benchmarks. Measures latency, format compliance, and
groundedness for each of the 3 pipeline roles.

Prerequisites:
  pip install groq cerebras-cloud-sdk --break-system-packages
  export GROQ_API_KEY=...
  export CEREBRAS_API_KEY=...

Run: python aegis_inference_benchmark.py
"""
import os
import time
import json
from groq import Groq
from cerebras.cloud.sdk import Cerebras

groq_client = Groq(api_key=os.environ["GROQ_API_KEY"])
cerebras_client = Cerebras(api_key=os.environ["CEREBRAS_API_KEY"])

# ─────────────────────────────────────────────────────────────
# TEST 1 — MAIN REASONING: grounded SAP answer generation
# Mirrors reasoning_service.py's 6-section prompt structure
# ─────────────────────────────────────────────────────────────
MAIN_PROMPT = """You are AEGIS, an SAP ERP helpdesk assistant.

---DOCUMENTATION---
[Chunk 1 — MM-ERR-014 (cause_resolution) | Verified: 2026-03-01]
CAUSE_1: Delivery blocked due to incomplete credit check at header level.
RESOLUTION_STEPS: 1. Go to VKM3 2. Release the blocked delivery 3. Re-run VL06G

---EMPLOYEE QUESTION---
Why is my delivery showing as blocked in VL02N?

Answer:"""

def test_main_reasoning():
    print("\n=== TEST 1: Main Reasoning (grounded SAP answer) ===")
    for label, fn in [
        ("Cerebras gpt-oss-120b", lambda: cerebras_client.chat.completions.create(
            model="gpt-oss-120b",
            messages=[{"role": "user", "content": MAIN_PROMPT}],
            max_completion_tokens=400)),
        ("Groq gpt-oss-120b", lambda: groq_client.chat.completions.create(
            model="openai/gpt-oss-120b",
            messages=[{"role": "user", "content": MAIN_PROMPT}],
            max_completion_tokens=400)),
    ]:
        start = time.time()
        resp = fn()
        elapsed = time.time() - start
        answer = resp.choices[0].message.content
        grounded = "VKM3" in answer and "VL06G" in answer  # cites the actual T-codes given
        print(f"{label}: {elapsed:.2f}s | grounded={grounded} | len={len(answer)} chars")
        print(f"  → {answer[:150]}...")

# ─────────────────────────────────────────────────────────────
# TEST 2 — CRAG / JUDGE: sufficiency check (structured output)
# Mirrors retrieval_engine.py's _stage6_crag prompt
# ─────────────────────────────────────────────────────────────
CRAG_PROMPT = """Given the retrieved context below, respond with EXACTLY
"SUFFICIENT" or "INSUFFICIENT: <one sentence reason>". Nothing else.

Context: Delivery blocked due to incomplete credit check. Resolution: use VKM3.
Question: Why is my delivery blocked and how do I fix it?"""

def test_judge():
    print("\n=== TEST 2: Judge/CRAG (structured, low-latency) ===")
    for label, fn in [
        ("Groq llama-3.1-8b-instant", lambda: groq_client.chat.completions.create(
            model="llama-3.1-8b-instant",
            messages=[{"role": "user", "content": CRAG_PROMPT}],
            max_completion_tokens=50)),
    ]:
        start = time.time()
        resp = fn()
        elapsed = time.time() - start
        answer = resp.choices[0].message.content.strip()
        format_ok = answer.startswith("SUFFICIENT") or answer.startswith("INSUFFICIENT")
        print(f"{label}: {elapsed:.2f}s | format_ok={format_ok} | response='{answer}'")

# ─────────────────────────────────────────────────────────────
# TEST 3 — VISION: SAP screenshot field extraction
# Mirrors vision_integration.py's expected output shape
# Requires a test screenshot at ./test_sap_screenshot.png
# ─────────────────────────────────────────────────────────────
VISION_PROMPT = """Extract the following fields from this SAP screenshot as JSON:
error_code, transaction_code, material_number. Use null if not visible."""

def test_vision():
    import base64
    print("\n=== TEST 3: Vision (field extraction) ===")
    if not os.path.exists("test_sap_screenshot.png"):
        print("  Skipped — place a sample SAP screenshot at ./test_sap_screenshot.png")
        return
    with open("test_sap_screenshot.png", "rb") as f:
        b64 = base64.b64encode(f.read()).decode("utf-8")

    start = time.time()
    resp = groq_client.chat.completions.create(
        model="meta-llama/llama-4-scout-17b-16e-instruct",
        messages=[{
            "role": "user",
            "content": [
                {"type": "text", "text": VISION_PROMPT},
                {"type": "image_url", "image_url": {"url": f"data:image/png;base64,{b64}"}},
            ],
        }],
    )
    elapsed = time.time() - start
    answer = resp.choices[0].message.content
    try:
        json.loads(answer.strip().strip("```json").strip("```"))
        valid_json = True
    except Exception:
        valid_json = False
    print(f"Groq Llama-4-Scout: {elapsed:.2f}s | valid_json={valid_json}")
    print(f"  → {answer}")

if __name__ == "__main__":
    test_main_reasoning()
    test_judge()
    test_vision()
    print("\nDone. Run this 5-10x across different prompts to get stable latency averages,")
    print("since free-tier inference speed can vary with provider load.")
