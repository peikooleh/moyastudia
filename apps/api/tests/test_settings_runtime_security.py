from cryptography.fernet import Fernet

from app.settings import Settings


def production_settings(**overrides):
    values = {
        "DATABASE_URL": "postgresql://user:pass@example.com/neondb?sslmode=require",
        "GOOGLE_CLIENT_ID": "client-id",
        "GOOGLE_CLIENT_SECRET": "client-secret",
        "GOOGLE_IDENTITY_REDIRECT_URI": "https://moyastudia.vercel.app/api/auth/google/callback",
        "GOOGLE_YOUTUBE_REDIRECT_URI": "https://moyastudia.vercel.app/api/auth/youtube/callback",
        "TOKEN_ENCRYPTION_KEY": Fernet.generate_key().decode("ascii"),
        "APP_ENV": "production",
        "FRONTEND_ORIGIN": "https://moyastudia.vercel.app",
        "DEPLOYMENT_ACCESS_MODE": "private_test",
        "ALLOWED_LOGIN_EMAILS": "owner@example.com",
    }
    values.update(overrides)
    return Settings.model_validate(values)


def test_production_security_accepts_api_prefixed_oauth_callbacks():
    production_settings().validate_runtime_security()


def test_production_security_still_accepts_direct_api_callbacks():
    settings = production_settings(
        GOOGLE_IDENTITY_REDIRECT_URI="https://api.example.com/auth/google/callback",
        GOOGLE_YOUTUBE_REDIRECT_URI="https://api.example.com/auth/youtube/callback",
    )
    settings.validate_runtime_security()
