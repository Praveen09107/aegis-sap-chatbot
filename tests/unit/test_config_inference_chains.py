"""Unit tests for the N-tier inference chain registry (Phase 0)."""
import copy
from unittest.mock import AsyncMock, patch

import pytest

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


@pytest.fixture(autouse=True)
def _restore_provider_key_state():
    """
    get_provider_key/refresh_provider_keys mutate module-level state
    (_CURRENT_KEYS and INFERENCE_CHAINS's own tier dicts) shared across the
    whole test session — snapshot and restore both around every test in
    this file so these tests can't leak state into each other or into
    unrelated tests elsewhere in the suite that import INFERENCE_CHAINS.
    """
    import app.config_inference_chains as cic

    keys_snapshot = dict(cic._CURRENT_KEYS)
    chains_snapshot = copy.deepcopy(INFERENCE_CHAINS)
    yield
    cic._CURRENT_KEYS.clear()
    cic._CURRENT_KEYS.update(keys_snapshot)
    for role, chain in chains_snapshot.items():
        for i, tier in enumerate(chain):
            INFERENCE_CHAINS[role][i]["api_key"] = tier["api_key"]


class TestGetProviderKey:
    def test_returns_current_value_for_a_known_provider(self):
        import app.config_inference_chains as cic

        cic._CURRENT_KEYS["GROQ_API_KEY"] = "gsk-current"
        assert cic.get_provider_key("groq") == "gsk-current"

    def test_returns_empty_string_for_an_unknown_provider(self):
        import app.config_inference_chains as cic

        assert cic.get_provider_key("not-a-real-provider") == ""


class TestRefreshProviderKeys:
    @pytest.mark.asyncio
    async def test_updates_current_keys_and_every_matching_tier_from_vault(self):
        import app.config_inference_chains as cic

        fake_secret = {
            "GROQ_API_KEY": "gsk-rotated",
            "CEREBRAS_API_KEY": "csk-rotated",
            "SAMBANOVA_API_KEY": "snk-rotated",
            "CLOUDFLARE_API_TOKEN": "cft-rotated",
            "GEMINI_API_KEY": "gmk-rotated",
        }
        mock_vault_client = AsyncMock()
        mock_vault_client.get_secret.return_value = fake_secret

        with patch("app.infrastructure.vault_client.vault_client", mock_vault_client):
            await cic.refresh_provider_keys()

        assert cic.get_provider_key("groq") == "gsk-rotated"
        assert cic.get_provider_key("cerebras") == "csk-rotated"
        assert cic.get_provider_key("sambanova") == "snk-rotated"
        assert cic.get_provider_key("cloudflare") == "cft-rotated"
        assert cic.get_provider_key("gemini") == "gmk-rotated"

        for chain in INFERENCE_CHAINS.values():
            for tier in chain:
                env_var = cic._PROVIDER_TO_ENV_VAR.get(tier["provider"])
                if env_var:
                    assert tier["api_key"] == fake_secret[env_var]

    @pytest.mark.asyncio
    async def test_falls_back_to_env_value_when_vault_is_unreachable(self):
        import app.config_inference_chains as cic

        original_groq_key = cic.get_provider_key("groq")
        mock_vault_client = AsyncMock()
        mock_vault_client.get_secret.side_effect = ConnectionError("Vault unreachable")

        with patch("app.infrastructure.vault_client.vault_client", mock_vault_client):
            await cic.refresh_provider_keys()  # must not raise

        # Vault outage never takes inference down — current values untouched.
        assert cic.get_provider_key("groq") == original_groq_key

    @pytest.mark.asyncio
    async def test_falls_back_per_key_when_vault_omits_one(self):
        import app.config_inference_chains as cic

        original_gemini_key = cic._ENV_FALLBACK["GEMINI_API_KEY"]
        mock_vault_client = AsyncMock()
        mock_vault_client.get_secret.return_value = {"GROQ_API_KEY": "gsk-rotated"}  # missing the other 4

        with patch("app.infrastructure.vault_client.vault_client", mock_vault_client):
            await cic.refresh_provider_keys()

        assert cic.get_provider_key("groq") == "gsk-rotated"
        assert cic.get_provider_key("gemini") == original_gemini_key

    @pytest.mark.asyncio
    async def test_is_a_no_op_in_local_inference_mode(self):
        import app.config_inference_chains as cic

        original_groq_key = cic.get_provider_key("groq")
        mock_vault_client = AsyncMock()
        mock_vault_client.get_secret.return_value = {"GROQ_API_KEY": "gsk-should-not-apply"}

        with patch.object(cic, "INFERENCE_MODE", "local"), patch("app.infrastructure.vault_client.vault_client", mock_vault_client):
            await cic.refresh_provider_keys()

        mock_vault_client.get_secret.assert_not_called()
        assert cic.get_provider_key("groq") == original_groq_key
