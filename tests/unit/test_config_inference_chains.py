"""Unit tests for the N-tier inference chain registry (Phase 0)."""
from app.config_inference_chains import INFERENCE_CHAINS


class TestChainShape:
    def test_all_three_roles_present(self):
        assert set(INFERENCE_CHAINS.keys()) == {"main", "judge", "vision"}

    def test_main_chain_is_four_tiers_identical_model(self):
        chain = INFERENCE_CHAINS["main"]
        assert len(chain) == 4
        models = {tier["model"] for tier in chain}
        assert models == {"gpt-oss-120b"} or models == {"gpt-oss-120b", "openai/gpt-oss-120b", "@cf/openai/gpt-oss-120b"}
        # Every main tier serves the same underlying weights, per DEC-019's
        # zero-drift design — the exact string differs only by provider
        # naming convention (Groq requires "openai/" prefix, Cloudflare "@cf/openai/").
        for tier in chain:
            assert "gpt-oss-120b" in tier["model"]

    def test_judge_chain_is_four_tiers(self):
        assert len(INFERENCE_CHAINS["judge"]) == 4

    def test_vision_chain_is_five_tiers(self):
        assert len(INFERENCE_CHAINS["vision"]) == 5

    def test_every_tier_has_required_keys(self):
        required = {"provider", "model", "base_url", "api_key", "cb_name", "wire_format", "quota_kind"}
        for role, chain in INFERENCE_CHAINS.items():
            for tier in chain:
                assert required.issubset(tier.keys()), f"{role} tier missing keys: {required - tier.keys()}"

    def test_circuit_breaker_names_are_unique_within_a_role(self):
        for role, chain in INFERENCE_CHAINS.items():
            cb_names = [tier["cb_name"] for tier in chain]
            assert len(cb_names) == len(set(cb_names)), f"duplicate cb_name within {role} chain"

    def test_vision_circuit_breaker_names_match_shared_convention(self):
        # ollama_vision.py and vision_task.py both deliberately share these
        # exact circuit-breaker keys — a rename here would silently break
        # that shared-state design (Design Principle 7).
        cb_names = [tier["cb_name"] for tier in INFERENCE_CHAINS["vision"]]
        assert "groq_vision" in cb_names
        assert "cerebras_vision" in cb_names

    def test_wire_formats_are_known_values(self):
        known = {"openai", "cloudflare", "gemini"}
        for role, chain in INFERENCE_CHAINS.items():
            for tier in chain:
                assert tier["wire_format"] in known

    def test_quota_kinds_are_known_values(self):
        known = {"header_groq", "header_cerebras", "sliding_window", "neuron_pool"}
        for role, chain in INFERENCE_CHAINS.items():
            for tier in chain:
                assert tier["quota_kind"] in known

    def test_gemini_is_vision_only_and_last_tier(self):
        for role in ("main", "judge"):
            providers = [t["provider"] for t in INFERENCE_CHAINS[role]]
            assert "gemini" not in providers
        vision_providers = [t["provider"] for t in INFERENCE_CHAINS["vision"]]
        assert vision_providers[-1] == "gemini"

    def test_judge_primary_is_the_highest_volume_model(self):
        # llama-3.1-8b-instant (14,400 req/day) over gpt-oss-20b (1,000/day) —
        # judge fires on nearly every query, volume matters more than raw
        # capability for the primary tier specifically.
        assert INFERENCE_CHAINS["judge"][0]["model"] == "llama-3.1-8b-instant"
