import os
from dotenv import load_dotenv

load_dotenv()

class Settings:
    APP_NAME: str = "NewsAura Backend"
    APP_VERSION: str = "1.0.0"
    DEBUG: bool = True

    HOST: str = os.getenv("HOST", "127.0.0.1")
    PORT: int = int(os.getenv("PORT", 8000))
    
    CORS_ORIGINS: str = os.getenv("CORS_ORIGINS", "http://localhost:5173,http://localhost:5174,http://localhost:3000")

    # Mongo
    MONGO_URI: str = os.getenv("MONGO_URI", "")

    # -----------------------------
    # REDIS CONFIG
    # -----------------------------
    REDIS_URL: str = os.getenv("REDIS_URL", "redis://localhost:6379")
    

    # -----------------------------
    # AUTH CONFIG
    # -----------------------------
    # Comma-separated list of Clerk user IDs that have admin access
    # Example: ADMIN_USER_IDS=user_2abc123,user_3def456
    ADMIN_USER_IDS: str = os.getenv("ADMIN_USER_IDS", "")    
    # Clerk admin role/metadata keys for hybrid auth
    # If using Clerk metadata API, set this to the metadata key name
    CLERK_ADMIN_METADATA_KEY: str = os.getenv("CLERK_ADMIN_METADATA_KEY", "admin")
    
    # If using Clerk organizations with role-based access
    # Set this to comma-separated list of org roles that grant admin access
    # Example: admin,owner
    CLERK_ADMIN_ORG_ROLES: str = os.getenv("CLERK_ADMIN_ORG_ROLES", "admin,owner")
    # -----------------------------
    # GNEWS CONFIG (ONLY SOURCE)
    # -----------------------------
    GNEWS_API_KEY: str = os.getenv("GNEWS_API_KEY", "")
    GNEWS_BASE_URL: str = "https://gnews.io/api/v4"

    # -----------------------------
    # CACHE TTL (STRICT)
    # -----------------------------
    CACHE_TTL_NEWS: int = 60 * 15  # 15 minutes (DO NOT LOWER)
    CACHE_TTL_NEWS_TOPIC: int = int(os.getenv("CACHE_TTL_NEWS_TOPIC", str(60 * 60 * 24 * 5)))  # 5 days
    GNEWS_REFRESH_INTERVAL_SEC: int = int(os.getenv("GNEWS_REFRESH_INTERVAL_SEC", str(15 * 60)))

    # -----------------------------
    # LLM CONFIG (CHATBOT ONLY)
    # -----------------------------
    # NOTE: This LLM is ONLY for chatbot responses.
    # Summarization and sentiment use separate ML services.
    LLM_PROVIDER: str = os.getenv("LLM_PROVIDER", "ollama").strip().lower()

    # Ollama (local development)
    OLLAMA_BASE_URL: str = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434")
    OLLAMA_MODEL: str = os.getenv("OLLAMA_MODEL", "llama3.2:1b")
    OLLAMA_TIMEOUT: float = float(os.getenv("OLLAMA_TIMEOUT", "90"))  # seconds (allow headroom for larger context)

    # OpenRouter (production)
    OPENROUTER_API_KEY: str = os.getenv("OPENROUTER_API_KEY", "")
    OPENROUTER_BASE_URL: str = os.getenv("OPENROUTER_BASE_URL", "https://openrouter.ai/api/v1")
    OPENROUTER_MODEL: str = os.getenv("OPENROUTER_MODEL", "nvidia/nemotron-3-ultra-550b-a55b:free")
    OPENROUTER_TIMEOUT: float = float(os.getenv("OPENROUTER_TIMEOUT", "90"))

settings = Settings()
