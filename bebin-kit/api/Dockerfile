FROM python:3.12-slim
RUN useradd -m app
WORKDIR /srv
COPY pyproject.toml ./
RUN pip install --no-cache-dir "fastapi>=0.115" "uvicorn[standard]>=0.30" "pydantic>=2.8" "pydantic-settings>=2.4" \
    "httpx>=0.27" "openai>=1.40"
COPY app ./app
# catalog.db is baked in (see ARCHITECTURE §15); app.db lives on the Liara disk at /data.
COPY data/catalog.db ./data/catalog.db
ENV CATALOG_DB_PATH=/srv/data/catalog.db APP_DB_PATH=/data/app.db PORT=8000
USER app
CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT} --workers 1"]
