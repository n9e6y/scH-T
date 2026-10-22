from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

KIT_ROOT = Path(__file__).resolve().parents[2]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=str(KIT_ROOT / ".env"), extra="ignore")

    llm_enabled: bool = True
    llm_base_url: str = ""
    llm_api_key: str = ""
    llm_model_assistant: str = ""
    llm_model_fast: str = ""
    llm_max_tokens_per_day: int = 300_000
    embeddings_provider: str = "off"
    embeddings_model: str = ""
    embeddings_dim: int = 256

    catalog_db_path: str = "api/data/catalog.db"
    app_db_path: str = "api/data/app.db"
    vectors_dir: str = "api/data/vectors"
    cors_origins: str = "http://localhost:3000"
    simulator_enabled: bool = True
    simulator_speed: float = 1.0
    no_answer_timeout_s: int = 90
    demo_director_enabled: bool = True

    def path(self, p: str) -> Path:
        """Paths in env are relative to the kit root unless absolute."""
        pp = Path(p)
        return pp if pp.is_absolute() else KIT_ROOT / pp

    @property
    def llm_configured(self) -> bool:
        return self.llm_enabled and bool(self.llm_base_url and self.llm_api_key)


@lru_cache
def get_settings() -> Settings:
    return Settings()
