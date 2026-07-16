# UBUNTU OLLAMA PATCH
## Sona Comstar AEGIS — Environment Adjustment Document
## Apply this BEFORE running IMPL_03 and IMPL_04

---

## CONTEXT

The AEGIS development environment uses Ubuntu WSL2 Ollama (at /home/pal/.ollama)
instead of Windows Ollama. This is a better choice for the architecture.

The IMPL spec files are already correct — they use Docker-internal network URLs.
This patch covers the two adjustments needed for IMPL_03 and IMPL_04.

---

## PATCH 1 — Apply during IMPL_03 (Docker Infrastructure)

### What to change

In `docker-compose.yml`, the three Ollama services use a named volume by default:

```yaml
# DEFAULT (from spec) — creates empty Docker volume, forces re-download
volumes:
  - aegis-ollama-models:/root/.ollama
```

Change ALL THREE Ollama services to use a bind mount instead:

```yaml
# PATCHED — reuses models already at /home/pal/.ollama, no re-download
volumes:
  - /home/pal/.ollama:/root/.ollama
```

Apply this to all three containers:
- aegis-ollama-main
- aegis-ollama-judge
- aegis-ollama-vision

### Also remove the named volume declaration

In the top-level `volumes:` section of docker-compose.yml, remove:
```yaml
volumes:
  aegis-ollama-models:
    name: aegis-ollama-models
```

Or simply do not declare it — it is no longer needed.

### Prompt addition for the IMPL_03 Copilot session

Add this instruction at the end of the IMPL_03 prompt:

```
IMPORTANT ENVIRONMENT PATCH:
This project uses Ubuntu WSL2 Ollama with models already downloaded at /home/pal/.ollama
For all three Ollama services (aegis-ollama-main, aegis-ollama-judge, aegis-ollama-vision),
use a bind mount instead of the named volume:
  volumes:
    - /home/pal/.ollama:/root/.ollama

Do NOT create the aegis-ollama-models named volume.
This avoids re-downloading 28GB of models that already exist.
```

---

## PATCH 2 — Apply during IMPL_04 (Models Setup)

### Context

`setup_models.py` runs `docker exec aegis-ollama-main ollama pull qwen2.5:32b`.

Because we bind-mounted `/home/pal/.ollama`, the models are already inside the
container at `/root/.ollama/models/`. Ollama will detect they exist and skip re-download.

No code change needed for IMPL_04. Just verify:

```bash
# After docker compose up, check models are visible inside container:
docker exec aegis-ollama-main ollama list
```

Expected output — all three models appear immediately:
```
NAME                        ID              SIZE      MODIFIED
qwen2.5:7b-instruct         xxxx            4.7 GB    ...
qwen2.5vl:7b                xxxx            5.1 GB    ...
qwen2.5:32b                 xxxx            19.8 GB   ...
```

If they do not appear, the bind mount path may be wrong. Verify:
```bash
ls /home/pal/.ollama/models/
# Should show: blobs/ manifests/
```

### Prompt addition for the IMPL_04 Copilot session

Add this instruction at the end of the IMPL_04 prompt:

```
IMPORTANT ENVIRONMENT NOTE:
Ollama models were pre-downloaded to /home/pal/.ollama before Docker setup.
The docker-compose.yml bind-mounts /home/pal/.ollama into the Ollama containers.
Models should already be present. setup_models.py should detect existing models
and skip re-download rather than pulling from scratch.
Run: docker exec aegis-ollama-main ollama list
to verify all three models are visible before running setup_models.py.
```

---

## OLLAMA MODEL REFERENCE

| Container | Model tag | Role | Size |
|---|---|---|---|
| aegis-ollama-main | qwen2.5:32b | Main generation | ~19 GB |
| aegis-ollama-judge | qwen2.5:7b-instruct | Tier 3 validation | ~4.7 GB |
| aegis-ollama-vision | qwen2.5vl:7b | SAP screenshot reading | ~5.1 GB |

All downloaded to: /home/pal/.ollama/models/ (Ubuntu WSL2)
Accessible inside Docker via bind mount: /root/.ollama/models/

---

## .ENV CORRECT VALUES

The .env.example created by the setup script had a wrong OLLAMA_BASE_URL.
The correct values from IMPL_02 spec are:

```
OLLAMA_MAIN_URL=http://aegis-ollama-main:11434
OLLAMA_JUDGE_URL=http://aegis-ollama-judge:11434
OLLAMA_VISION_URL=http://aegis-ollama-vision:11434
OLLAMA_MODEL_MAIN=qwen2.5:32b
OLLAMA_MODEL_JUDGE=qwen2.5:7b-instruct
OLLAMA_MODEL_VISION=qwen2.5vl:7b
```

These use Docker-internal service names — correct regardless of Ubuntu or Windows Ollama.

---

## SUMMARY

| Item | Action | When |
|---|---|---|
| .env — fix OLLAMA URLs | Update now (see below) | Immediately |
| docker-compose.yml — volume | Bind mount /home/pal/.ollama | During IMPL_03 |
| setup_models.py | No change needed | During IMPL_04 |
| All other spec files | No changes needed | Never |

