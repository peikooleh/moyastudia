from sqlalchemy import create_engine, text
from app.settings import settings

url = settings.database_url
print("url_set:", bool(url))
print("url_starts:", (url or "")[:12])

if url.startswith("postgresql://"):
    url = "postgresql+psycopg://" + url[len("postgresql://"):]

try:
    engine = create_engine(url, pool_pre_ping=True)
    with engine.connect() as conn:
        conn.execute(text("SELECT 1"))
    print("db: ok")
except Exception as e:
    print("db: fail")
    print(type(e).__name__)
    print(str(e)[:300])