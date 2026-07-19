"""
AEGIS Inference Provider Benchmark — rewritten 2026-07-19 for DEC-058's
N-tier architecture (the pre-DEC-058 version only exercised 2 of 5
providers and called a Groq vision model DEC-058 found had already been
pulled from the catalog).

Measures real latency and format compliance for every tier of every role
in INFERENCE_CHAINS (main/judge/vision), using the exact same dispatch
function walk_chain() itself uses (_dispatch_tier_nonstreaming) — not a
separate reimplementation that could drift from production behavior.

Step 0 fires one real, minimal-token call per provider and dumps the full
raw response header set, looking for genuine rate-limit evidence, rather
than trusting existing code comments about RPM ceilings. Where no real
evidence exists, results are labeled "paced conservatively — unconfirmed"
instead of asserting a number as fact (see DEC-060, OPEN-06).

Must run inside the aegis-fastapi container (no source bind-mount exists,
so copy in first):
  docker cp scripts/aegis_inference_benchmark.py aegis-fastapi:/tmp/benchmark.py
  docker exec aegis-fastapi python3 /tmp/benchmark.py
"""
import asyncio
import base64
import io
import json
import sys
import time

import httpx

sys.path.insert(0, "/app")

from app.config_inference_chains import INFERENCE_CHAINS
from app.services.model_gateway import _dispatch_tier_nonstreaming

MAIN_PROMPT = """You are AEGIS, an SAP ERP helpdesk assistant.

---DOCUMENTATION---
[Chunk 1 — MM-ERR-014 (cause_resolution) | Verified: 2026-03-01]
CAUSE_1: Delivery blocked due to incomplete credit check at header level.
RESOLUTION_STEPS: 1. Go to VKM3 2. Release the blocked delivery 3. Re-run VL06G

---EMPLOYEE QUESTION---
Why is my delivery showing as blocked in VL02N?

Answer:"""

CRAG_PROMPT = """Given the retrieved context below, respond with EXACTLY
"SUFFICIENT" or "INSUFFICIENT: <one sentence reason>". Nothing else.

Context: Delivery blocked due to incomplete credit check. Resolution: use VKM3.
Question: Why is my delivery blocked and how do I fix it?"""

VISION_PROMPT = """Extract the following fields from this SAP screenshot as JSON:
error_code, transaction_code, material_number. Use null if not visible."""

ROLE_PROMPTS = {"main": MAIN_PROMPT, "judge": CRAG_PROMPT, "vision": VISION_PROMPT}
ROLE_MAX_TOKENS = {"main": 400, "judge": 50, "vision": 300}
REPS_PER_TIER = 3

# Conservative defaults, overwritten per-provider once Step 0's real probe
# runs — Cerebras/Gemini start at their documented/previously-confirmed
# ~5 RPM, SambaNova starts deliberately conservative since OPEN-06 already
# flags its real limit as unconfirmed.
PACE_SECONDS = {
    "groq": 2.5,
    "cloudflare": 2.0,
    "cerebras": 13.0,
    "sambanova": 10.0,
    "gemini": 13.0,
}


def make_test_screenshot_b64() -> str:
    from PIL import Image, ImageDraw
    img = Image.new("RGB", (500, 300), color="white")
    draw = ImageDraw.Draw(img)
    draw.rectangle([0, 0, 499, 40], fill="#003d6b")
    draw.text((10, 10), "SAP Easy Access - VL02N Change Outbound Delivery", fill="white")
    draw.text((10, 60), "Error: VL150", fill="red")
    draw.text((10, 90), "Not enough stock available for material 4711 plant 1000", fill="black")
    draw.text((10, 260), "Transaction: VL02N", fill="black")
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return base64.b64encode(buf.getvalue()).decode()


TEST_IMAGE_B64 = make_test_screenshot_b64()


async def probe_headers(role: str, tier: dict) -> dict:
    """Step 0: one real, minimal call per tier's provider, full raw header
    dump — not just the subset _record_quota_from_headers currently
    parses. Independent of _dispatch_tier_nonstreaming on purpose, since
    the Cloudflare/Gemini adapter functions discard headers entirely
    before returning."""
    result = {"provider": tier["provider"], "model": tier["model"], "role": role,
               "status": None, "rate_limit_headers": {}, "error": None}
    headers = {"Authorization": f"Bearer {tier['api_key']}", "Content-Type": "application/json"}
    try:
        async with httpx.AsyncClient(timeout=30) as client:
            if tier["wire_format"] == "openai" and role != "vision":
                body = {"model": tier["model"], "messages": [{"role": "user", "content": "Say OK."}],
                         "max_completion_tokens": 5, "temperature": 0.0}
                resp = await client.post(f"{tier['base_url']}/chat/completions", json=body, headers=headers)
            elif tier["wire_format"] == "openai" and role == "vision":
                body = {"model": tier["model"], "messages": [{
                    "role": "user",
                    "content": [
                        {"type": "text", "text": "Say OK."},
                        {"type": "image_url", "image_url": {"url": f"data:image/png;base64,{TEST_IMAGE_B64}"}},
                    ],
                }], "max_completion_tokens": 5}
                resp = await client.post(f"{tier['base_url']}/chat/completions", json=body, headers=headers)
            elif tier["wire_format"] == "cloudflare":
                is_openai_ns = "openai" in tier["model"]
                if role == "vision":
                    body = {"messages": [{"role": "user", "content": "Say OK."}], "image": []}
                else:
                    body = {"input": [{"role": "user", "content": "Say OK."}]} if is_openai_ns \
                        else {"messages": [{"role": "user", "content": "Say OK."}]}
                resp = await client.post(f"{tier['base_url']}/{tier['model']}", json=body, headers=headers)
            elif tier["wire_format"] == "gemini":
                url = f"{tier['base_url']}/models/{tier['model']}:generateContent?key={tier['api_key']}"
                body = {"contents": [{"parts": [
                    {"text": "Say OK."},
                    {"inline_data": {"mime_type": "image/png", "data": TEST_IMAGE_B64}},
                ]}]}
                resp = await client.post(url, json=body)
            else:
                result["error"] = f"unknown wire_format {tier['wire_format']}"
                return result

            result["status"] = resp.status_code
            result["rate_limit_headers"] = {
                k: v for k, v in resp.headers.items()
                if "ratelimit" in k.lower() or "retry-after" in k.lower()
            }
            if resp.status_code == 429:
                try:
                    result["error_body"] = resp.json()
                except Exception:
                    result["error_body"] = resp.text[:300]
    except httpx.HTTPStatusError as e:
        result["status"] = e.response.status_code
        result["error"] = str(e)
        try:
            result["error_body"] = e.response.json()
        except Exception:
            result["error_body"] = e.response.text[:300]
    except Exception as e:
        result["error"] = str(e)
    return result


def check_format(role: str, content: str) -> bool:
    if content is None:
        return False
    if role == "main":
        return "VKM3" in content and "VL06G" in content
    if role == "judge":
        stripped = content.strip()
        return stripped.startswith("SUFFICIENT") or stripped.startswith("INSUFFICIENT")
    if role == "vision":
        # Mirrors app/clients/ollama_vision.py::_parse_extraction_response —
        # find the first "{" and last "}" rather than requiring the whole
        # string to be JSON. Real vision responses can be prefixed with a
        # <think>...</think> reasoning block (confirmed live 2026-07-19,
        # Groq's qwen/qwen3.6-27b) before the actual JSON; a naive
        # "does the whole string parse" check would wrongly fail those,
        # understating a model that production's real parser handles fine.
        start = content.find("{")
        end = content.rfind("}") + 1
        if start < 0 or end <= start:
            return False
        try:
            json.loads(content[start:end])
            return True
        except Exception:
            return False
    return False


async def run_tier(role: str, tier: dict) -> dict:
    prompt = ROLE_PROMPTS[role]
    image_b64 = TEST_IMAGE_B64 if role == "vision" else None
    max_tokens = ROLE_MAX_TOKENS[role]
    pace = PACE_SECONDS.get(tier["provider"], 5.0)

    reps = []
    for _ in range(REPS_PER_TIER):
        start = time.monotonic()
        try:
            content = await _dispatch_tier_nonstreaming(
                tier, prompt, max_tokens=max_tokens, temperature=0.0,
                image_b64=image_b64, mime_type="image/png",
            )
            elapsed = time.monotonic() - start
            reps.append({"elapsed": elapsed, "success": True,
                         "format_ok": check_format(role, content), "error": None,
                         "preview": content[:150] if content else None})
        except Exception as e:
            elapsed = time.monotonic() - start
            reps.append({"elapsed": elapsed, "success": False, "format_ok": False, "error": str(e)})
        await asyncio.sleep(pace)
    return {"role": role, "provider": tier["provider"], "model": tier["model"], "reps": reps}


async def main():
    from app.infrastructure.redis_client import redis_session
    await redis_session.connect()

    print("=" * 70)
    print("STEP 0 — real rate-limit header probe, 1 call per tier")
    print("=" * 70)
    probe_results = []
    for role in ("main", "judge", "vision"):
        for tier in INFERENCE_CHAINS[role]:
            if not tier["api_key"]:
                print(f"  SKIP {role}/{tier['provider']} — no API key configured")
                continue
            r = await probe_headers(role, tier)
            probe_results.append(r)
            print(f"  {role}/{tier['provider']} ({tier['model']}): status={r['status']} "
                  f"rate_limit_headers={r['rate_limit_headers']} error={r.get('error')}")
            if r.get("error_body"):
                print(f"    error_body={r['error_body']}")
            await asyncio.sleep(3.0)

    with open("/tmp/benchmark_probe_results.json", "w") as f:
        json.dump(probe_results, f, indent=2, default=str)

    print("\n" + "=" * 70)
    print(f"STEP 1 — full benchmark, {REPS_PER_TIER} reps per tier")
    print("=" * 70)
    run_results = []
    for role in ("main", "judge", "vision"):
        for tier in INFERENCE_CHAINS[role]:
            if not tier["api_key"]:
                continue
            print(f"\n  Running {role}/{tier['provider']} ({tier['model']})...")
            result = await run_tier(role, tier)
            run_results.append(result)
            for i, rep in enumerate(result["reps"]):
                status = "OK" if rep["success"] else "FAIL"
                fmt = "format_ok" if rep.get("format_ok") else "format_bad"
                print(f"    rep {i+1}: {status} {rep['elapsed']:.2f}s {fmt} "
                      f"{rep.get('error') or rep.get('preview', '')[:80]}")

    with open("/tmp/benchmark_run_results.json", "w") as f:
        json.dump(run_results, f, indent=2, default=str)

    print("\nDone. Raw results: /tmp/benchmark_probe_results.json, /tmp/benchmark_run_results.json")


if __name__ == "__main__":
    asyncio.run(main())
