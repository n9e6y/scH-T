FROM python:3.12-slim
WORKDIR /srv
RUN pip install --no-cache-dir "fastapi>=0.115" "uvicorn[standard]>=0.30" "pydantic>=2.8" "pydantic-settings>=2.4" \
    "httpx>=0.27" "openai>=1.40" "numpy>=1.26" "boto3>=1.34"
COPY app ./app
# catalog.db is baked into the image (read-only, rebuildable); app.db lives on the Liara disk mounted at /data.
# The vector index doesn't fit Liara's 128 MB source limit: with EMBEDDINGS_PROVIDER=api and S3_* set, the API
# downloads it from the private bucket into /data/vectors on first boot (app/embeddings.py).
COPY data/catalog.db ./data/catalog.db
ENV CATALOG_DB_PATH=/srv/data/catalog.db APP_DB_PATH=/data/app.db VECTORS_DIR=/data/vectors PORT=8000
EXPOSE 8000
CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT} --workers 1 --proxy-headers"]
