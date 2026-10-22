# ببین (Bebin) — run from the kit root.
PY := api/.venv/bin/python
UV := cd api && uv

.PHONY: setup data data-sample demo-candidates profile embeddings api web test types check-llm smoke bench eval

setup:
	$(UV) sync
	cd web && npm install

data:
	$(PY) data/build_catalog.py
	$(PY) data/build_catalog.py --sample
	$(PY) data/demo_candidates.py

data-sample:
	$(PY) data/build_catalog.py --sample

demo-candidates:
	$(PY) data/demo_candidates.py

profile:
	$(PY) data/profile.py

embeddings:
	@echo "EMBEDDINGS_PROVIDER=off until scripts/check_llm.py confirms support (docs/LLM_CAPABILITIES.md)"

api:
	$(UV) run uvicorn app.main:app --reload --port 8000

web:
	cd web && npm run dev

test:
	$(UV) run pytest -q
	cd web && npm run test --silent

types:
	$(UV) run python -c "import json; from app.main import app; print(json.dumps(app.openapi()))" > ../web/lib/openapi.json
	cd web && npx openapi-typescript lib/openapi.json -o lib/api-types.ts && rm lib/openapi.json

check-llm:
	$(PY) scripts/check_llm.py

bench:
	$(PY) scripts/bench.py

smoke:
	scripts/smoke.sh $(API_URL) $(WEB_URL)

eval:
	@echo "M5: api/tests/eval/ not built yet"
