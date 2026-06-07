import json
import base64
import redis.asyncio as redis
from typing import Any, Optional, Union
from app.core.config import settings

# -----------------------------
# REDIS CLIENT (SINGLETON)
# -----------------------------
_redis_client: Optional[redis.Redis] = None
_redis_raw_client: Optional[redis.Redis] = None  # For binary data


async def get_redis(raw: bool = False) -> redis.Redis:
    global _redis_client, _redis_raw_client
    
    if raw:
        if _redis_raw_client is None:
            try:
                _redis_raw_client = redis.from_url(  # no await
                    settings.REDIS_URL,
                    decode_responses=False,
                    socket_connect_timeout=5,
                    socket_timeout=5,
                    retry_on_timeout=True,
                    health_check_interval=30,
                )
            except Exception as e:
                print(f"[REDIS RAW INIT ERROR] {e}")
                return None
        return _redis_raw_client
    
    if _redis_client is None:
        try:
            _redis_client = redis.from_url(  # no await
                settings.REDIS_URL,
                encoding="utf-8",
                decode_responses=True,
                socket_connect_timeout=5,
                socket_timeout=5,
                retry_on_timeout=True,
                health_check_interval=30,
            )
        except Exception as e:
            print(f"[REDIS INIT ERROR] {e}")
            return None
    return _redis_client


async def close_redis():
    """Close Redis connections"""
    global _redis_client, _redis_raw_client
    if _redis_client:
        try:
            await _redis_client.close()
        except Exception as e:
            print(f"[REDIS CLOSE ERROR] {e}")
        finally:
            _redis_client = None
    if _redis_raw_client:
        try:
            await _redis_raw_client.close()
        except Exception as e:
            print(f"[REDIS RAW CLOSE ERROR] {e}")
        finally:
            _redis_raw_client = None


# -----------------------------
# CACHE HELPERS (REDIS-BACKED)
# -----------------------------
async def get_from_cache(key: str, raw: bool = False) -> Optional[Union[Any, bytes]]:
    global _redis_client, _redis_raw_client
    try:
        client = await get_redis(raw=raw)
        if client is None:
            return None
        value = await client.get(key)
        if value:
            if raw:
                return value
            return json.loads(value)
        return None
    except Exception as e:
        print(f"[REDIS GET ERROR] {key}: {e}")
        # Force reconnect on next call
        _redis_client = None
        _redis_raw_client = None
        return None


async def set_in_cache(key: str, value: Union[Any, bytes], ttl: int = None, raw: bool = False):
    global _redis_client, _redis_raw_client
    try:
        client = await get_redis(raw=raw)
        if client is None:
            return
        if raw:
            data = value
        else:
            data = json.dumps(value)
        if ttl is None:
            ttl = settings.CACHE_TTL_NEWS
        await client.setex(key, ttl, data)
    except Exception as e:
        print(f"[REDIS SET ERROR] {key}: {e}")
        # Force reconnect on next call
        _redis_client = None
        _redis_raw_client = None


async def delete_from_cache(key: str):
    global _redis_client, _redis_raw_client
    try:
        client = await get_redis()
        if client is None:
            return
        await client.delete(key)
    except Exception as e:
        print(f"[REDIS DELETE ERROR] {key}: {e}")
        _redis_client = None
        _redis_raw_client = None


async def clear_pattern(pattern: str):
    """Delete all keys matching a pattern"""
    try:
        client = await get_redis()
        if client is None:
            return
        keys = await client.keys(pattern)
        if keys:
            await client.delete(*keys)
    except Exception as e:
        print(f"[REDIS CLEAR ERROR] {pattern}: {e}")


def gnews_cache_key(category: str) -> str:
    """Return the standard cache key for a GNews category."""
    return f"gnews:{category}"


def user_bookmarks_cache_key(user_id: str) -> str:
    """Redis key for cached bookmark list per user."""
    return f"user:{user_id}:bookmarks:list"


def user_read_later_cache_key(user_id: str) -> str:
    """Redis key for cached read-later list per user."""
    return f"user:{user_id}:read_later:list"


def user_news_action_status_cache_key(user_id: str) -> str:
    """Redis key for cached sentiment/report status payload per user."""
    return f"user:{user_id}:news:action_status"


async def invalidate_user_action_cache(user_id: str, *segments: str):
    """
    Invalidate one or more user action cache segments.

    Supported segments:
    - "bookmarks"
    - "read_later"
    - "news_action_status"
    """
    key_builders = {
        "bookmarks": user_bookmarks_cache_key,
        "read_later": user_read_later_cache_key,
        "news_action_status": user_news_action_status_cache_key,
    }

    for segment in segments:
        key_builder = key_builders.get(segment)
        if key_builder is None:
            continue
        await delete_from_cache(key_builder(user_id))

