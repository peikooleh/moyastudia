from pydantic_settings import BaseSettings, SettingsConfigDict
from pydantic import Field
from urllib.parse import urlparse


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
    provider_timeout_seconds: float = Field(default=15.0, gt=0, validation_alias="PROVIDER_TIMEOUT_SECONDS")
    provider_read_retries: int = Field(default=2, ge=0, le=5, validation_alias="PROVIDER_READ_RETRIES")

    @property
    def is_production(self) -> bool:
        return self.app_environment.lower() == "production"

    def validate_runtime_security(self) -> None:
        if not self.is_production:
            return
        errors = []
        for name, value in (
            ("FRONTEND_ORIGIN", self.frontend_origin),
            ("GOOGLE_IDENTITY_REDIRECT_URI", self.google_identity_redirect_uri),
            ("GOOGLE_YOUTUBE_REDIRECT_URI", self.google_youtube_redirect_uri),
        ):
            parsed = urlparse(value)
            if parsed.scheme != "https" or not parsed.netloc or parsed.hostname in {"localhost", "127.0.0.1"}:
                errors.append(f"{name} must be a public HTTPS URL")
        if not self.database_url or "localhost" in self.database_url.lower():
            errors.append("DATABASE_URL must be configured for production")
        if not self.google_client_id or not self.google_client_secret:
            errors.append("Google OAuth credentials must be configured for production")
        if not self.token_encryption_key:
            errors.append("TOKEN_ENCRYPTION_KEY must be configured for production")
        if errors:
            raise RuntimeError("Unsafe production configuration: " + "; ".join(errors))


settings = Settings()
