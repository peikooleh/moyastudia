"""Run deployment configuration checks without printing secrets.

From apps/api: APP_ENV=production python -m app.preflight
"""

from .settings import settings


def main() -> None:
    if not settings.is_production:
        raise SystemExit("Deployment preflight requires APP_ENV=production")
    settings.validate_runtime_security()
    print("API deployment configuration preflight passed (network/OAuth not yet verified).")


if __name__ == "__main__":
    main()
