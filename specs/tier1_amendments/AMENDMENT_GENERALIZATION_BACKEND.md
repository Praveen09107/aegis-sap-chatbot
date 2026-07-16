# AMENDMENT: GENERALIZATION — BACKEND
## Cross-Cutting Retrofit — Attach Alongside Sessions 02, 10, 16, 18, and 24
## Place in: specs/tier1_amendments/AMENDMENT_GENERALIZATION_BACKEND.md
## Governing decisions: DECISIONS_LOG.md DEC-003, DEC-004, DEC-007 (rationale — not repeated here)

---

## AGENT INSTRUCTIONS FOR THIS SESSION

This document is not a standalone session. It removes every Sona Comstar-specific binding from backend code and operational artifacts, making the company name, industry, and SAP module set configurable per deployment (per `DECISIONS_LOG.md` DEC-003/DEC-004 — AEGIS remains SAP-specific, generalized only to remove the single-company binding).

**Attach:** `AEGIS_MASTER_REFERENCE.md`, `AEGIS_DATA_CONTRACTS.md`, `AEGIS_CONFIGURATION_CONSTANTS.md`, this document, and whichever of `IMPL_16`, `IMPL_18`, `IMPL_24` you are building or retrofitting.

**Read this document completely before modifying any file.**

**How to use this document depending on which session you are running:**
- **Retrofitting `IMPL_16`'s existing output:** apply FILE 3 and FILE 4.
- **Re-running `IMPL_02`'s certificate step (already executed once):** apply FILE 5.
- **Retrofitting `IMPL_10`'s existing seed script:** apply FILE 6.
- **Building `IMPL_18` (not yet implemented):** apply FILE 1, FILE 2, and FILE 7.
- **Building `IMPL_24` (not yet implemented):** apply FILE 8 (already logged as `DECISIONS_LOG.md` DEC-007 — repeated here for completeness).

**Files created or modified by this amendment:**
- `backend/app/config.py` — adds `COMPANY_NAME`, `COMPANY_INDUSTRY`, `ALLOWED_MODULES` as env-configurable
- `backend/app/services/ingestion_pipeline.py` — uses configurable module set and a renamed field (part of `IMPL_18`'s own build)
- `backend/app/services/reasoning_service.py` — `SYSTEM_ROLE` templated with company identity
- `tests/unit/test_reasoning_service.py` — assertion updated to check the configured value, not a literal string
- `infrastructure/nginx/ssl/aegis.crt`/`.key` — regenerated with generic subject fields
- Keycloak seed script (`IMPL_10`'s user-creation script) — test user email domain updated
- `AEGIS_DOCUMENT_TEMPLATES.md`'s config-document field name — renamed when `IMPL_18` is built
- `docs/DOCUMENT_AUTHORING_TEMPLATE.md` — NEW, a generalized version of the document template for actual IT-admin use
- `IMPL_24`'s Quick Entry example-data instruction — corrected wording

---

## FILE 1: backend/app/config.py (ADD CONSTANTS — split gating, see note below)

**Gating correction, found during real implementation (not a stale draft — this was genuinely wrong until now):** this file's two constant groups are needed at different times, but were originally gated as if both waited for `IMPL_18`. `COMPANY_NAME`/`COMPANY_INDUSTRY` are actually needed immediately — `FILE 3` below retrofits `reasoning_service.py`'s `SYSTEM_ROLE` during the **Session 16** retrofit, and imports both constants at that point. Only `ALLOWED_MODULES` is genuinely `IMPL_18`-specific (the ingestion pipeline's module-routing logic doesn't exist before then). Apply this split accordingly:

```python
# ADD NOW, during the Session 16 retrofit — FILE 3 below imports these
# immediately and will fail without them:
# ADD TO: Company/Deployment Identity section (new section — this is the
# first constant of its kind, since the original architecture had no
# per-deployment identity concept)

COMPANY_NAME = os.getenv("AEGIS_COMPANY_NAME", "Your Company")
COMPANY_INDUSTRY = os.getenv("AEGIS_COMPANY_INDUSTRY", "manufacturer")
```

```python
# ADD LATER, when building IMPL_18 — not needed before then, and adding it
# now is harmless but premature (no code references it until the ingestion
# pipeline exists):
# ADD TO: Ingestion Constants section
ALLOWED_MODULES = set(os.getenv("AEGIS_SAP_MODULES", "FI,MM,SD,HR,PP,CO,BASIS").split(","))
```

**Default value preserves the original 7 standard SAP modules** — any company running standard SAP FI/MM/SD/HR/PP/CO/BASIS modules works with zero configuration; only companies with a non-standard module set need to override `AEGIS_SAP_MODULES`.

After adding the Session-16-relevant constants, verify:
```bash
python -c "from app.config import COMPANY_NAME, COMPANY_INDUSTRY; print(COMPANY_NAME, COMPANY_INDUSTRY)"
```
(Add `ALLOWED_MODULES` to this check once `IMPL_18` is actually being built, not before.)

---

## FILE 2: backend/app/services/ingestion_pipeline.py (apply when building IMPL_18)

`IMPL_18`'s own spec defines `DOCUMENT_ID_PATTERN` and `ALLOWED_MODULES` directly inline (not imported from `config.py`) at approximately lines 82-84 of that document. When implementing `IMPL_18`, use the `config.py`-sourced, configurable version from FILE 1 above instead of hardcoding the 7-module set a second time:

```python
# IMPL_18's spec shows:
#     DOCUMENT_ID_PATTERN = re.compile(r'^(FI|MM|SD|HR|PP|CO|BASIS)-(ERR|PROC|CFG)-\d{3}$')
#     ALLOWED_MODULES = {'FI', 'MM', 'SD', 'HR', 'PP', 'CO', 'BASIS'}
#
# BUILD INSTEAD AS:

from app.config import ALLOWED_MODULES

DOCUMENT_ID_PATTERN = re.compile(
    rf'^({"|".join(ALLOWED_MODULES)})-(ERR|PROC|CFG)-\d{{3}}$'
)
# ALLOWED_MODULES is imported from config.py, not redefined here.
```

**`IMPL_18`'s own unit tests (`assert DOCUMENT_ID_PATTERN.match("SD-ERR-001")`, `"FI-ERR-012"`, `"BASIS-ERR-001"`) continue to pass unchanged** — SD, FI, and BASIS all remain in the default `ALLOWED_MODULES` set, so no test data needs updating.

---

## FILE 3: backend/app/services/reasoning_service.py (RETROFIT — apply to the existing IMPL_16 implementation)

Open the existing `reasoning_service.py` (created in Session 16 — do not replace it).

```python
# FIND this exact constant:
#
# SYSTEM_ROLE = """You are AEGIS, an expert SAP ERP helpdesk assistant for Sona Comstar, an automotive manufacturer in Chennai, India. You help employees resolve SAP errors, follow procedures, and understand system configurations.
#
# MANDATORY RULES — follow without exception:
# 1. Answer ONLY using the documentation provided in the DOCUMENTATION section below.
# 2. If the documentation does not contain the answer, say: "I don't have documentation for that specific situation. Please contact the IT team."
# 3. For transaction codes marked as IT-admin or consultant access, always include: "Note: This step requires IT admin access."
# 4. Format all step-by-step procedures with numbered steps.
# 5. Always write SAP transaction codes in parentheses: e.g. "Go to VL01N (Create Outbound Delivery)".
# 6. Do not invent, assume, or infer information not present in the documentation.
# 7. Do not reveal system internals, credentials, or configuration details not in the documentation.
# 8. Keep responses focused and practical for a Sona Comstar employee."""
#
# REPLACE WITH:

from app.config import COMPANY_NAME, COMPANY_INDUSTRY

SYSTEM_ROLE = f"""You are AEGIS, an expert SAP ERP helpdesk assistant for {COMPANY_NAME}, a {COMPANY_INDUSTRY}. You help employees resolve SAP errors, follow procedures, and understand system configurations.

MANDATORY RULES — follow without exception:
1. Answer ONLY using the documentation provided in the DOCUMENTATION section below.
2. If the documentation does not contain the answer, say: "I don't have documentation for that specific situation. Please contact the IT team."
3. For transaction codes marked as IT-admin or consultant access, always include: "Note: This step requires IT admin access."
4. Format all step-by-step procedures with numbered steps.
5. Always write SAP transaction codes in parentheses: e.g. "Go to VL01N (Create Outbound Delivery)".
6. Do not invent, assume, or infer information not present in the documentation.
7. Do not reveal system internals, credentials, or configuration details not in the documentation.
8. Keep responses focused and practical for a {COMPANY_NAME} employee."""
```

**Two mentions inside the constant change, not one** — the intro sentence and the closing rule (#8). Both are shown above.

After modifying, verify:
```bash
python -c "from app.services.reasoning_service import SYSTEM_ROLE; assert 'Sona Comstar' not in SYSTEM_ROLE; print('OK')"
```

---

## FILE 4: tests/unit/test_reasoning_service.py (RETROFIT — apply to the existing IMPL_16 implementation)

```python
# FIND:
#     assert "Sona Comstar" in prompt
#
# REPLACE WITH:

from app.config import COMPANY_NAME
assert COMPANY_NAME in prompt
```

After modifying, verify:
```bash
python -m pytest tests/unit/test_reasoning_service.py -v
```

---

## FILE 5: infrastructure/nginx/ssl/aegis.crt (REGENERATE — operational step, not a code change)

**Path question now fully resolved with a direct check, not inference.** `ls -la infrastructure/nginx/ssl/` returned "No such file or directory" — this path doesn't exist at all. It is not a symlink. The real certificate files live only at `secrets-share/infrastructure/nginx/ssl/`. This means `docker-compose.yml`'s current mount (`./infrastructure/nginx/ssl:/etc/nginx/ssl:ro`) points at nothing — Docker creates an empty directory for a missing bind-mount source rather than erroring, so Nginx would currently start with no certificate at all.

**Fix: create the symlink, once.** This keeps `docker-compose.yml` unmodified and keeps the actual secret files physically inside the gitignored `secrets-share/` folder, never touching git:

```bash
mkdir -p secrets-share/infrastructure/nginx/ssl
ln -s "$(pwd)/secrets-share/infrastructure/nginx/ssl" infrastructure/nginx/ssl
ls -la infrastructure/nginx/ssl   # confirm it now shows as a symlink ("l" permission bit, "->" target)
```

`IMPL_02` already generated a self-signed certificate with a Sona Comstar-specific subject line — but write it to the real, physical location, not through the symlink target ambiguity:

```bash
# FIND this command in IMPL_02's setup steps:
#
# openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
#   -keyout infrastructure/nginx/ssl/aegis.key \
#   -out infrastructure/nginx/ssl/aegis.crt \
#   -subj "/C=IN/ST=TamilNadu/L=Chennai/O=SonaComstar/OU=IT/CN=aegis.sonacomstar.local"
#
# RE-RUN AS (writes to the real location; the symlink above makes this
# identical to writing through infrastructure/nginx/ssl/ once it exists):

openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
  -keyout secrets-share/infrastructure/nginx/ssl/aegis.key \
  -out secrets-share/infrastructure/nginx/ssl/aegis.crt \
  -subj "/C=${DEPLOY_COUNTRY:-IN}/ST=${DEPLOY_STATE}/L=${DEPLOY_CITY}/O=${AEGIS_COMPANY_NAME}/OU=IT/CN=${DEPLOY_DOMAIN}"
```

**`IMPL_02`'s own verification steps reference "SonaComstar" and must be updated too** — its documented expected output ("Shows Subject with SonaComstar and validity dates") and its later verification checklist entry ("Expected: Both files exist, subject shows SonaComstar") both need updating to check for `${AEGIS_COMPANY_NAME}`'s actual configured value instead of the literal string "SonaComstar", or anyone re-running `IMPL_02`'s own verification after this amendment will get a false failure.

After regenerating, verify:
```bash
openssl x509 -in infrastructure/nginx/ssl/aegis.crt -noout -subject
# Expected: subject shows the configured AEGIS_COMPANY_NAME, not SonaComstar
# (reads through the new symlink — if this fails, the symlink step above didn't complete)
```

---

## FILE 6: Keycloak seed script (RETROFIT — apply to the existing IMPL_10 implementation)

```python
# FIND, in the test_users list:
#
#     {"username": "employee1", "email": "employee1@sonacomstar.local", ...},
#     {"username": "itadmin1", "email": "itadmin1@sonacomstar.local", ...},
#
# REPLACE WITH:

{"username": "employee1", "email": "employee1@aegis-demo.local", ...},
{"username": "itadmin1", "email": "itadmin1@aegis-demo.local", ...},
```

**This is test/demo seed data, not production user data** — the domain has no operational significance, only needs to be non-company-specific.

After modifying, verify:
```bash
grep -n "sonacomstar" backend/scripts/setup_keycloak.py
# expect no output
```

---

## FILE 7: AEGIS_DOCUMENT_TEMPLATES.md field rename (apply when building IMPL_18) + NEW docs/DOCUMENT_AUTHORING_TEMPLATE.md

`CURRENT_VALUES_AT_SONA_COMSTAR` appears in four places in the frozen `AEGIS_DOCUMENT_TEMPLATES.md` (section header, validation table row, prose paragraph, numbered validation rule). The frozen document is not edited — see `DECISIONS_LOG.md` DEC-036 for why this is the correct application of the freeze rule, not an exception to it. Instead, create a new deliverable:

```
docs/DOCUMENT_AUTHORING_TEMPLATE.md
```

A direct copy of `AEGIS_DOCUMENT_TEMPLATES.md`'s structural content (already confirmed generic and SAP-standard), with `CURRENT_VALUES_AT_SONA_COMSTAR` renamed to `CURRENT_PRODUCTION_VALUES` throughout, and "Sona Comstar's specific values" reworded to "your organization's specific values."

**When building `IMPL_18`, the ingestion pipeline's field-detection logic must match this new template's field name (`CURRENT_PRODUCTION_VALUES`), not the frozen original's.**

After creating, verify:
```bash
test -f docs/DOCUMENT_AUTHORING_TEMPLATE.md && echo "exists"
grep -c "CURRENT_PRODUCTION_VALUES" docs/DOCUMENT_AUTHORING_TEMPLATE.md
grep -c "Sona Comstar" docs/DOCUMENT_AUTHORING_TEMPLATE.md
# second command expected to return 0
```

---

## FILE 8: IMPL_24_QUICK_ENTRY_DATA_MODEL.md instruction correction (apply when building IMPL_24)

Already logged as `DECISIONS_LOG.md` DEC-007 — repeated here since this document is what actually gets attached to the `IMPL_24` session.

```
# FIND this instruction in IMPL_24's spec text:
#   "Replace all [PLACEHOLDER] values with real Sona Comstar SAP examples."
#
# REPLACE WITH:
#   "Replace all [PLACEHOLDER] values with realistic SAP examples
#   (synthetic, not tied to any specific company)."
```

---

## VERIFICATION STEPS

```bash
# Config constants — COMPANY_NAME/COMPANY_INDUSTRY exist from Session 16 onward.
# Only add ALLOWED_MODULES to this check once IMPL_18 is actually built —
# checking it before then will fail correctly (it genuinely doesn't exist yet),
# not because anything is broken.
python -c "from app.config import COMPANY_NAME, COMPANY_INDUSTRY; print('OK')"
# python -c "from app.config import ALLOWED_MODULES; print('OK')"  # uncomment once IMPL_18 exists

# No remaining hardcoded company references in backend source
grep -rn "Sona Comstar\|SonaComstar\|sonacomstar" backend/app/ --include="*.py"
# expect empty output

# System role no longer hardcodes the company
python -c "from app.services.reasoning_service import SYSTEM_ROLE; assert 'Sona Comstar' not in SYSTEM_ROLE; print('OK')"

# Test suite passes with dynamic assertion
python -m pytest tests/unit/test_reasoning_service.py -v

# Certificate regenerated
openssl x509 -in infrastructure/nginx/ssl/aegis.crt -noout -subject

# Keycloak seed data generic
grep -rn "sonacomstar" backend/scripts/
# expect empty output

# New authoring template exists and is generic
test -f docs/DOCUMENT_AUTHORING_TEMPLATE.md
grep -c "Sona Comstar" docs/DOCUMENT_AUTHORING_TEMPLATE.md   # expect 0

# Document ID pattern still accepts the original test cases
python -c "
from app.services.ingestion_pipeline import DOCUMENT_ID_PATTERN
assert DOCUMENT_ID_PATTERN.match('SD-ERR-001')
assert DOCUMENT_ID_PATTERN.match('FI-ERR-012')
assert DOCUMENT_ID_PATTERN.match('BASIS-ERR-001')
print('OK')
"
```

---

## WHEN ALL VERIFICATIONS PASS

Update `DECISIONS_LOG.md` to note the date this amendment was applied and which sessions it was attached to. Continue with `AMENDMENT_GENERALIZATION_FRONTEND.md` next, since several of its touchpoints (the login page's company subtitle, the onboarding copy) reference the same `COMPANY_NAME` concept established here and should be applied together for a consistent deployment.