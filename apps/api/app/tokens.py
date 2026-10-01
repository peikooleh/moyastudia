from cryptography.fernet import Fernet, InvalidToken

from .settings import settings


class TokenEncryptionError(RuntimeError):
    pass


def _fernet() -> Fernet:
    key = settings.token_encryption_key
    if not key:
        raise TokenEncryptionError("TOKEN_ENCRYPTION_KEY is not configured")
    try:
        return Fernet(key.encode("ascii"))
    except (UnicodeError, ValueError) as exc:
        raise TokenEncryptionError("TOKEN_ENCRYPTION_KEY is invalid") from exc


def validate_encryption_key() -> None:
    _fernet()


def encrypt_refresh_token(value: str) -> str:
    return _fernet().encrypt(value.encode("utf-8")).decode("ascii")


def decrypt_refresh_token(value: str) -> str:
    try:
        return _fernet().decrypt(value.encode("ascii")).decode("utf-8")
    except (InvalidToken, UnicodeError) as exc:
        raise TokenEncryptionError("stored refresh token cannot be decrypted") from exc