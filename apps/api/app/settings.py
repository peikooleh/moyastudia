from pydantic_settings import BaseSettings, SettingsConfigDict
from pydantic import Field
from urllib.parse import parse_qs, urlparse
from typing import Literal

from cryptography.fernet import Fernet


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
    session_cookie_samesite: Literal["lax", "strict", "none"] = "lax"
    deployment_access_mode: Literal["private_test", "public"] = "private_test"
    allowed_login_emails: str = ""
    session_ttl_seconds: int = 604800
    oauth_state_ttl_seconds: int = 600
    provider_timeout_seconds: float = Field(default=15.0, gt=0, validation_alias="PROVIDER_TIMEOUT_SECONDS")
    provider_read_retries: int = Field(default=2, ge=0, le=5, validation_alias="PROVIDER_READ_RETRIES")

    @property
    def is_production(self) -> bool:
        return self.app_environment.lower() == "production"

    @property
    def allowed_login_email_set(self) -> set[str]:
        return {email.strip().casefold() for email in self.allowed_login_emails.split(",") if email.strip()}

    def validate_runtime_security(self) -> None:
        if not self.is_production:
            return
        errors = []

        frontend = urlparse(self.frontend_origin)
        if (
            frontend.scheme != "https"
            or not frontend.hostname
            or frontend.hostname in {"localhost", "127.0.0.1"}
            or frontend.username is not None
            or frontend.password is not None
            or frontend.path not in {"", "/"}
            or frontend.params or frontend.query or frontend.fragment
        ):
            errors.append("FRONTEND_ORIGIN must be a public HTTPS origin without a path or query")

        callback_origins = []
        for name, value, expected_path in (
            ("GOOGLE_IDENTITY_REDIRECT_URI", self.google_identity_redirect_uri, "/auth/google/callback"),
            ("GOOGLE_YOUTUBE_REDIRECT_URI", self.google_youtube_redirect_uri, "/auth/youtube/callback"),
        ):
            parsed = urlparse(value)
            if (
                parsed.scheme != "https"
                or not parsed.hostname
                or parsed.hostname in {"localhost", "127.0.0.1"}
                or parsed.username is not None
                or parsed.password is not None
                or parsed.path != expected_path
                or parsed.params or parsed.query or parsed.fragment
            ):
                errors.append(f"{name} must be a public HTTPS URL with path {expected_path}")
            else:
                callback_origins.append((parsed.scheme, parsed.netloc))
        if len(callback_origins) == 2 and callback_origins[0] != callback_origins[1]:
            errors.append("Google OAuth callbacks must use the same API origin")

        database = urlparse(self.database_url)
        ssl_modes = parse_qs(database.query).get("sslmode", [])
        if (
            database.scheme not in {"postgresql", "postgresql+psycopg"}
            or not database.hostname
            or database.hostname in {"localhost", "127.0.0.1"}
        ):
            errors.append("DATABASE_URL must point to a remote PostgreSQL server")
        if len(ssl_modes) != 1 or ssl_modes[0] not in {"require", "verify-ca", "verify-full"}:
            errors.append("DATABASE_URL must enforce PostgreSQL TLS (sslmode=require or stronger)")

        if not self.google_client_id or not self.google_client_secret:
            errors.append("Google OAuth credentials must be configured for production")
        if self.deployment_access_mode == "private_test" and not self.allowed_login_email_set:
            errors.append("ALLOWED_LOGIN_EMAILS is required in private_test mode")
        try:
            Fernet(self.token_encryption_key.encode("ascii"))
        except (ValueError, UnicodeError):
            errors.append("TOKEN_ENCRYPTION_KEY must be a valid Fernet key")
        if errors:
            raise RuntimeError("Unsafe production configuration: " + "; ".join(errors))


settings = Settings()
