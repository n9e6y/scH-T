# ببین (Bebin) — run from the kit root.
PY := api/.venv/bin/python
UV := cd api && uv

.PHONY: setup data data-sample demo-candidates profile embeddings upload-vectors api web test types check-llm smoke bench eval

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

embeddings:  # ≈10M provider tokens for the full catalog; resumable (api/data/vectors/parts/)
	$(PY) data/build_embeddings.py

upload-vectors:  # api/data/vectors → s3://$S3_BUCKET/vectors/ (the deployed API downloads them on first boot)
	$(UV) run --with boto3 python -c "from app.config import get_settings; from app.embeddings import s3_client, FILES; \
	s = get_settings(); d = s.path(s.vectors_dir); c = s3_client(); \
	[(c.upload_file(str(d / f), s.s3_bucket, 'vectors/' + f), print('uploaded', f)) for f in FILES]"

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

eval:  # opt-in; add LIVE=1 to also run the assistant scenarios against the real LLM
	$(UV) run python eval/run_eval.py $(if $(LIVE),--live,)
