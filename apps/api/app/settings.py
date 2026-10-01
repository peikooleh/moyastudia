from pydantic_settings import BaseSettings, SettingsConfigDict
from pydantic import Field


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str = ""
    google_client_id: str = ""
    google_client_secret: str = ""
    google_identity_redirect_uri: str = "http://localhost:8000/auth/google/callback"
    google_youtube_redirect_uri: str = "http://localhost:8000/auth/youtube/callback"
    token_encryption_key: str = ""
    app_environment: str = Field(default="development", validation_alias="APP_ENV")
    frontend_origin: str = "http://localhost:3000"
    session_cookie_name: str = "moyastudia_session"
    session_ttl_seconds: int = 604800
    oauth_state_ttl_seconds: int = 600

    @property
    def is_production(self) -> bool:
        return self.app_environment.lower() == "production"


settings = Settings()
