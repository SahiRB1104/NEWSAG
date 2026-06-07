from fastapi import APIRouter, Depends, HTTPException
from app.core.database import get_db
from app.models.bookmark import BookmarkModel
from bson import ObjectId
from app.core.auth import get_user_id, require_auth
from app.services.training_data_service import TrainingDataService
from app.core.cache import (
    get_from_cache,
    set_in_cache,
    user_bookmarks_cache_key,
    invalidate_user_action_cache,
)
import logging

router = APIRouter()
logger = logging.getLogger(__name__)


# --------------------------------------------------
# ADD BOOKMARK
# --------------------------------------------------
@router.post("/")
async def add_bookmark(
    bookmark: BookmarkModel,
    user=Depends(require_auth),
    db=Depends(get_db),
):
    user_id = get_user_id(user)

    existing = await db.bookmarks.find_one({
        "user_id": user_id,
        "article_id": bookmark.article_id
    })

    if existing:
        return {
            "message": "Already bookmarked",
            "bookmark_id": str(existing.get("_id")),
        }

    data = bookmark.dict()
    data["user_id"] = user_id

    try:
        result = await db.bookmarks.insert_one(data)
    except DuplicateKeyError:
        existing = await db.bookmarks.find_one({
            "user_id": user_id,
            "article_id": bookmark.article_id
        })
        return {
            "message": "Already bookmarked",
            "bookmark_id": str(existing["_id"]),
        }
    await invalidate_user_action_cache(user_id, "bookmarks")
    
    # ✅ Collect implicit sentiment feedback (bookmark = positive signal)
    # User bookmarking indicates they found the article valuable with its current sentiment
    try:
        # Combine title and description for training text
        text = bookmark.title
        if bookmark.description:
            text += " " + bookmark.description
        
        # Get sentiment from article if available in cache, otherwise use neutral
        from app.core.cache import get_from_cache
        cache_key = f"gnews:{bookmark.category}" if bookmark.category else None
        
        ai_label = "Neutral"
        ai_confidence = 0.5
        
        if cache_key:
            cached_articles = await get_from_cache(cache_key)
            if cached_articles:
                for article in cached_articles:
                    if article.get("id") == bookmark.article_id or article.get("url") == bookmark.url:
                        sentiment = article.get("sentiment", {})
                        ai_label = sentiment.get("label", "Neutral")
                        ai_confidence = sentiment.get("confidence", 0.5)
                        break
        
        await TrainingDataService.add_sentiment_feedback(
            db=db,
            article_id=bookmark.article_id,
            text=text,
            ai_label=ai_label,
            ai_confidence=ai_confidence,
            user_id=user_id,
            source="implicit_bookmark",
            user_label=None,  # Implicit - no explicit correction
            article_url=bookmark.url,
        )
        logger.info(f"[IMPLICIT] Bookmark feedback collected for article={bookmark.article_id}")
    except Exception as e:
        # Don't fail the bookmark if feedback collection fails
        logger.warning(f"[IMPLICIT] Failed to collect bookmark feedback: {str(e)}")

    return {
        "message": "Bookmark added",
        "bookmark_id": str(result.inserted_id)
    }



# --------------------------------------------------
# GET USER BOOKMARKS
# --------------------------------------------------
@router.get("/")
async def get_bookmarks(
    user=Depends(require_auth),
    db=Depends(get_db),
):
    user_id = get_user_id(user)
    cache_key = user_bookmarks_cache_key(user_id)

    cached = await get_from_cache(cache_key)
    if cached:
        logger.info("[BOOKMARKS CACHE HIT] user_id=%s count=%s", user_id, len(cached))
        return {
            "count": len(cached),
            "bookmarks": cached,
        }

    bookmarks = []
    cursor = db.bookmarks.find(
        {"user_id": user_id}
    ).sort("created_at", -1)

    async for item in cursor:
        item["_id"] = str(item["_id"])
        bookmark = BookmarkModel(**item)
        bookmarks.append(bookmark.model_dump(mode="json"))

    logger.info("[BOOKMARKS] user_id=%s count=%s", user_id, len(bookmarks))

    await set_in_cache(cache_key, bookmarks, ttl=60 * 30)

    return {
        "count": len(bookmarks),
        "bookmarks": bookmarks
    }


# --------------------------------------------------
# REMOVE BOOKMARK BY ARTICLE ID
# --------------------------------------------------
@router.delete("/")
async def delete_bookmark_by_article_id(
    article_id: str,
    user=Depends(require_auth),
    db=Depends(get_db),
):
    user_id = get_user_id(user)

    result = await db.bookmarks.delete_one({
        "user_id": user_id,
        "$or": [
            {"article_id": article_id},
            {"url": article_id},
        ],
    })

    if result.deleted_count == 0:
        raise HTTPException(
            status_code=404,
            detail="Bookmark not found or not authorized"
        )

    await invalidate_user_action_cache(user_id, "bookmarks")

    return {"message": "Bookmark removed"}



# --------------------------------------------------
# REMOVE BOOKMARK
# --------------------------------------------------
@router.delete("/{bookmark_id}")
async def delete_bookmark(
    bookmark_id: str,
    user=Depends(require_auth),
    db=Depends(get_db),
):
    user_id = get_user_id(user)

    result = await db.bookmarks.delete_one({
        "_id": ObjectId(bookmark_id),
        "user_id": user_id
    })

    if result.deleted_count == 0:
        raise HTTPException(
            status_code=404,
            detail="Bookmark not found or not authorized"
        )

    await invalidate_user_action_cache(user_id, "bookmarks")

    return {"message": "Bookmark removed"}

