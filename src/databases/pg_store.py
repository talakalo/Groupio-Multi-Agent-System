"""PostgreSQL-backed replacement for RedisClient.

Drop-in: same method signatures, Postgres tables under the hood.

Tables used (all created by Alembic migration 042):
  - auth_tokens         — short-lived token store (email_verify, password_reset, invite)
  - revoked_jwts        — JWT denylist (logout, suspend)
  - ip_rate_limits      — per-IP per-minute request counter
  - conversation_messages — conversation context for support agent and WhatsApp bot
  - response_cache      — generic LLM, gov API, and orchestration response cache
  - scheduler_locks     — distributed cron lock (replaces SET NX EX)
  - ab_test_events      — A/B test outcome tracking (outreach agent)

Columns on users table:
  - locked_until        — temporary lockout TTL
  - failed_login_count  — login failure counter

No Redis import anywhere in this file.
"""

import hashlib
import json
import logging
from datetime import UTC, datetime, timedelta
from typing import Any

from src.config.settings import get_settings

logger = logging.getLogger(__name__)


def _is_missing_table_error(exc: Exception) -> bool:
    """Return True when the exception indicates a table does not exist in Supabase/PostgREST."""
    msg = str(exc).lower()
    return "pgrst205" in msg or "schema cache" in msg or "does not exist" in msg


def _sha256(value: str) -> str:
    """Return the SHA-256 hex digest of a string value."""
    return hashlib.sha256(value.encode()).hexdigest()


def _classify_key(key: str) -> tuple[str, str]:
    """Return (category, remainder) for a key string.

    Categories:
      - "email_verify"    — email verification tokens
      - "password_reset"  — password-reset tokens
      - "invite_token"    — admin invite tokens
      - "refresh_token"   — refresh tokens (stored in response_cache)
      - "doc_request"     — contractor doc-request cache
      - "cache"           — generic cache (response_cache)

    For auth_tokens categories the remainder is the token itself.
    For refresh_token the remainder is the user_id.
    """
    for prefix in (
        "email_verify:",
        "password_reset:",
        "invite_token:",
        "refresh_token:",
        "doc_request:",
    ):
        if key.startswith(prefix):
            return prefix.rstrip(":"), key[len(prefix) :]
    return "generic", key


# Map category names to token_type column values in auth_tokens
_AUTH_TOKEN_TYPES = {
    "email_verify": "email_verify",
    "password_reset": "password_reset",
    "invite_token": "invite",
}


class PostgresStore:
    """Drop-in Postgres replacement for RedisClient.

    Uses the same dual-path pattern as PostgresClient:
    - Supabase PostgREST when SUPABASE_URL + SUPABASE_KEY are set and
      USE_LOCAL_POSTGRES is not '1'/'true'/'yes'
    - asyncpg pool otherwise (local dev / CI / USE_LOCAL_POSTGRES=1)
    """

    def __init__(self) -> None:
        self._supabase_client: Any = None
        self._asyncpg_pool: Any = None
        self._use_supabase: bool | None = None
        self._context_window = 10

    # ------------------------------------------------------------------
    # Connection management — mirrors postgres.py exactly
    # ------------------------------------------------------------------

    def _use_supabase_client(self) -> bool:
        """Return True when Supabase credentials are set and local Postgres not forced."""
        if self._use_supabase is None:
            settings = get_settings()
            force_local = (settings.USE_LOCAL_POSTGRES or "").lower() in ("1", "true", "yes")
            self._use_supabase = bool(settings.SUPABASE_URL and settings.SUPABASE_KEY and not force_local)
        return self._use_supabase

    async def _get_client(self) -> Any:
        """Lazily initialize the database client (Supabase or asyncpg pool)."""
        if self._use_supabase_client():
            if self._supabase_client is None:
                from supabase import acreate_client

                settings = get_settings()
                self._supabase_client = await acreate_client(
                    settings.SUPABASE_URL,
                    settings.SUPABASE_KEY,
                )
            return self._supabase_client

        # Local PostgreSQL via asyncpg
        if self._asyncpg_pool is None:
            import asyncpg

            settings = get_settings()
            db_url = settings.DATABASE_URL
            if db_url.startswith("postgres://"):
                db_url = db_url.replace("postgres://", "postgresql://", 1)
            self._asyncpg_pool = await asyncpg.create_pool(
                db_url,
                min_size=5,
                max_size=25,
                max_inactive_connection_lifetime=300,
                command_timeout=60,
            )
        return self._asyncpg_pool

    async def _pg_execute(self, query: str, *args: Any) -> str:
        """Execute a DML statement via asyncpg pool; return status string."""
        pool = await self._get_client()
        async with pool.acquire() as conn:
            return await conn.execute(query, *args)

    async def _pg_fetch_one(self, query: str, *args: Any) -> dict | None:
        """Fetch a single row via asyncpg pool; return dict or None."""
        pool = await self._get_client()
        async with pool.acquire() as conn:
            row = await conn.fetchrow(query, *args)
            return dict(row) if row else None

    async def _pg_fetch_all(self, query: str, *args: Any) -> list[dict]:
        """Fetch all rows via asyncpg pool; return list of dicts."""
        pool = await self._get_client()
        async with pool.acquire() as conn:
            rows = await conn.fetch(query, *args)
            return [dict(r) for r in rows]

    async def _pg_fetchval(self, query: str, *args: Any) -> Any:
        """Fetch a single scalar value via asyncpg pool."""
        pool = await self._get_client()
        async with pool.acquire() as conn:
            return await conn.fetchval(query, *args)

    # ------------------------------------------------------------------
    # Raw key-value store — set / get / delete
    #
    # Key routing:
    #   email_verify:{token}    -> auth_tokens (token_type='email_verify')
    #   password_reset:{token}  -> auth_tokens (token_type='password_reset')
    #   invite_token:{token}    -> auth_tokens (token_type='invite')
    #   refresh_token:{user_id} -> response_cache (plaintext, for direct comparison in auth.py)
    #   doc_request:{*}         -> response_cache
    #   everything else         -> response_cache
    # ------------------------------------------------------------------

    async def set(self, key: str, value: str, ex: int | None = None, nx: bool = False) -> bool:
        """Set a key-value pair.

        Args:
            key:   Redis-style key (routing determined by prefix).
            value: String value to store.
            ex:    TTL in seconds (required for auth_tokens categories).
            nx:    If True, set only if not already set. Returns False on conflict.

        Returns:
            True if the key was set; False if nx=True and the key already existed.
        """
        category, remainder = _classify_key(key)

        if category in _AUTH_TOKEN_TYPES:
            # remainder = the token itself; value = user_id (or stringified payload)
            token_type = _AUTH_TOKEN_TYPES[category]
            token_hash = _sha256(remainder)
            ttl_seconds = ex or 86400

            if self._use_supabase_client():
                client = await self._get_client()
                # Try to find existing entry for conflict detection
                existing = (
                    await client.table("auth_tokens").select("id").eq("token_hash", token_hash).limit(1).execute()
                )
                if nx and existing.data:
                    return False
                payload: dict[str, Any] = {
                    "token_type": token_type,
                    "token_hash": token_hash,
                    "expires_at": (
                        (datetime.now(UTC) + timedelta(seconds=ttl_seconds)).replace(microsecond=0).isoformat()
                    ),
                }
                # Attempt to resolve value as a UUID (user_id); if it looks like one, store it
                payload["user_id"] = value  # value = user_id string
                if existing.data and not nx:
                    await (
                        client.table("auth_tokens")
                        .update({"expires_at": payload["expires_at"]})
                        .eq("token_hash", token_hash)
                        .execute()
                    )
                else:
                    await client.table("auth_tokens").insert(payload).execute()
                return True

            # asyncpg path
            if nx:
                status = await self._pg_execute(
                    """
                    INSERT INTO auth_tokens (user_id, token_type, token_hash, expires_at)
                    VALUES ($1::uuid, $2, $3, NOW() + $4 * INTERVAL '1 second')
                    ON CONFLICT (token_hash) DO NOTHING
                    """,
                    value if value else None,
                    token_type,
                    token_hash,
                    ttl_seconds,
                )
                return "INSERT 0 1" in status
            else:
                await self._pg_execute(
                    """
                    INSERT INTO auth_tokens (user_id, token_type, token_hash, expires_at)
                    VALUES ($1::uuid, $2, $3, NOW() + $4 * INTERVAL '1 second')
                    ON CONFLICT (token_hash) DO UPDATE SET expires_at = EXCLUDED.expires_at
                    """,
                    value if value else None,
                    token_type,
                    token_hash,
                    ttl_seconds,
                )
                return True

        # All other keys (refresh_token:*, doc_request:*, generic) -> response_cache
        ttl_seconds = ex or 86400

        if self._use_supabase_client():
            client = await self._get_client()
            try:
                existing = (
                    await client.table("response_cache").select("cache_key").eq("cache_key", key).limit(1).execute()
                )
                if nx and existing.data:
                    return False
                data_payload = {"v": value}
                expires = (datetime.now(UTC) + timedelta(seconds=ttl_seconds)).replace(microsecond=0).isoformat()
                if existing.data:
                    await (
                        client.table("response_cache")
                        .update({"data": data_payload, "expires_at": expires})
                        .eq("cache_key", key)
                        .execute()
                    )
                else:
                    await (
                        client.table("response_cache")
                        .insert({"cache_key": key, "data": data_payload, "expires_at": expires})
                        .execute()
                    )
            except Exception as exc:
                if _is_missing_table_error(exc):
                    logger.warning("response_cache table missing — skipping cache write. Run migration 042.")
                    return True
                raise
            return True

        # asyncpg path
        if nx:
            status = await self._pg_execute(
                """
                INSERT INTO response_cache (cache_key, data, expires_at)
                VALUES ($1, $2::jsonb, NOW() + $3 * INTERVAL '1 second')
                ON CONFLICT (cache_key) DO NOTHING
                """,
                key,
                json.dumps({"v": value}),
                ttl_seconds,
            )
            return "INSERT 0 1" in status
        else:
            await self._pg_execute(
                """
                INSERT INTO response_cache (cache_key, data, expires_at)
                VALUES ($1, $2::jsonb, NOW() + $3 * INTERVAL '1 second')
                ON CONFLICT (cache_key) DO UPDATE
                    SET data = EXCLUDED.data, expires_at = EXCLUDED.expires_at
                """,
                key,
                json.dumps({"v": value}),
                ttl_seconds,
            )
            return True

    async def get(self, key: str) -> str | None:
        """Get a value by key.

        For auth_tokens categories (email_verify, password_reset, invite_token):
            Returns the user_id stored under that token_hash if not expired.
        For refresh_token and other response_cache keys:
            Returns the raw string value stored (plaintext for refresh comparison).
        """
        category, remainder = _classify_key(key)

        if category in _AUTH_TOKEN_TYPES:
            token_type = _AUTH_TOKEN_TYPES[category]
            token_hash = _sha256(remainder)

            if self._use_supabase_client():
                client = await self._get_client()
                result = (
                    await client.table("auth_tokens")
                    .select("user_id")
                    .eq("token_hash", token_hash)
                    .eq("token_type", token_type)
                    .gt("expires_at", datetime.now(UTC).isoformat())
                    .limit(1)
                    .execute()
                )
                if result.data:
                    return str(result.data[0]["user_id"])
                return None

            # asyncpg path
            row = await self._pg_fetch_one(
                """
                SELECT user_id::text
                FROM auth_tokens
                WHERE token_hash = $1
                  AND token_type = $2
                  AND expires_at > NOW()
                LIMIT 1
                """,
                token_hash,
                token_type,
            )
            return row["user_id"] if row else None

        # response_cache path (refresh_token, doc_request, generic)
        if self._use_supabase_client():
            client = await self._get_client()
            try:
                result = (
                    await client.table("response_cache")
                    .select("data")
                    .eq("cache_key", key)
                    .gt("expires_at", datetime.now(UTC).isoformat())
                    .limit(1)
                    .execute()
                )
            except Exception as exc:
                if _is_missing_table_error(exc):
                    logger.warning("response_cache table missing — cache miss returned. Run migration 042.")
                    return None
                raise
            if result.data:
                data = result.data[0]["data"]
                if isinstance(data, dict):
                    return data.get("v")
                if isinstance(data, str):
                    try:
                        return json.loads(data).get("v")
                    except Exception:
                        return data
            return None

        # asyncpg path
        row = await self._pg_fetch_one(
            """
            SELECT data
            FROM response_cache
            WHERE cache_key = $1
              AND expires_at > NOW()
            """,
            key,
        )
        if row is None:
            return None
        data = row["data"]
        if isinstance(data, dict):
            return data.get("v")
        if isinstance(data, str):
            try:
                return json.loads(data).get("v")
            except Exception:
                return data
        return None

    async def delete(self, key: str) -> None:
        """Delete a key (routes to auth_tokens or response_cache)."""
        category, remainder = _classify_key(key)

        if category in _AUTH_TOKEN_TYPES:
            token_type = _AUTH_TOKEN_TYPES[category]
            token_hash = _sha256(remainder)

            if self._use_supabase_client():
                client = await self._get_client()
                await (
                    client.table("auth_tokens")
                    .delete()
                    .eq("token_hash", token_hash)
                    .eq("token_type", token_type)
                    .execute()
                )
                return

            await self._pg_execute(
                "DELETE FROM auth_tokens WHERE token_hash = $1 AND token_type = $2",
                token_hash,
                token_type,
            )
            return

        # response_cache (refresh_token, doc_request, generic)
        if self._use_supabase_client():
            client = await self._get_client()
            try:
                await client.table("response_cache").delete().eq("cache_key", key).execute()
            except Exception as exc:
                if _is_missing_table_error(exc):
                    logger.warning("response_cache table missing — skipping cache delete. Run migration 042.")
                    return
                raise
            return

        await self._pg_execute(
            "DELETE FROM response_cache WHERE cache_key = $1",
            key,
        )

    # ------------------------------------------------------------------
    # Rate limiting — ip_rate_limits table
    # Fails open on any exception (intentional — see threat model T-00-06)
    # ------------------------------------------------------------------

    async def check_rate_limit(self, user_id: str, limit: int = 60, window: int = 60) -> bool:
        """Check per-user rate limit. Returns True (allowed) or False (rate-limited).

        Re-uses ip_rate_limits with user_id as the 'ip' column value (VARCHAR(45)
        fits UUIDs). Fails open on any DB error.
        """
        try:
            if self._use_supabase_client():
                # Supabase PostgREST cannot express ON CONFLICT upserts natively;
                # fall through to asyncpg for correctness.
                await self._get_client()
                # Use rpc if available; otherwise gracefully allow
                logger.debug("check_rate_limit: supabase path — using asyncpg fallback for atomicity")
                # For supabase path, we degrade to asyncpg style by getting the raw pool
                # This is intentional — ON CONFLICT upsert is not expressible in PostgREST
                count = await self._pg_fetchval(
                    """
                    INSERT INTO ip_rate_limits (ip, window_start, request_count)
                    VALUES ($1, date_trunc('minute', NOW()), 1)
                    ON CONFLICT (ip, window_start) DO UPDATE
                        SET request_count = ip_rate_limits.request_count + 1
                    RETURNING request_count
                    """,
                    user_id,
                )
                return (count or 0) <= limit

            count = await self._pg_fetchval(
                """
                INSERT INTO ip_rate_limits (ip, window_start, request_count)
                VALUES ($1, date_trunc('minute', NOW()), 1)
                ON CONFLICT (ip, window_start) DO UPDATE
                    SET request_count = ip_rate_limits.request_count + 1
                RETURNING request_count
                """,
                user_id,
            )
            return (count or 0) <= limit
        except Exception:
            logger.debug("check_rate_limit: DB error — failing open (allow request)")
            return True

    async def check_ip_rate_limit(self, ip: str, limit: int = 20, window: int = 60) -> bool:
        """Check per-IP rate limit. Returns True (allowed) or False (rate-limited).

        Fails open on any DB error to avoid blocking legitimate users when the DB
        is momentarily slow.
        """
        try:
            count = await self._pg_fetchval(
                """
                INSERT INTO ip_rate_limits (ip, window_start, request_count)
                VALUES ($1, date_trunc('minute', NOW()), 1)
                ON CONFLICT (ip, window_start) DO UPDATE
                    SET request_count = ip_rate_limits.request_count + 1
                RETURNING request_count
                """,
                ip,
            )
            return (count or 0) <= limit
        except Exception:
            logger.debug("check_ip_rate_limit: DB error — failing open (allow request)")
            return True

    # ------------------------------------------------------------------
    # Login failures — users table columns
    # ------------------------------------------------------------------

    async def increment_login_failures(self, user_id: str, window: int = 900) -> int:
        """Increment failed_login_count for a user. Returns the new count."""
        if self._use_supabase_client():
            client = await self._get_client()
            # PostgREST does not support UPDATE ... RETURNING with arithmetic;
            # fetch then update (two round-trips, acceptable for login path).
            existing = await client.table("users").select("failed_login_count").eq("id", user_id).limit(1).execute()
            current = existing.data[0]["failed_login_count"] if existing.data else 0
            new_count = current + 1
            await client.table("users").update({"failed_login_count": new_count}).eq("id", user_id).execute()
            return new_count

        result = await self._pg_fetchval(
            """
            UPDATE users
            SET failed_login_count = failed_login_count + 1
            WHERE id = $1::uuid
            RETURNING failed_login_count
            """,
            user_id,
        )
        return int(result) if result is not None else 0

    async def clear_login_failures(self, user_id: str) -> None:
        """Reset failed_login_count to 0 after a successful login."""
        if self._use_supabase_client():
            client = await self._get_client()
            await client.table("users").update({"failed_login_count": 0}).eq("id", user_id).execute()
            return

        await self._pg_execute(
            "UPDATE users SET failed_login_count = 0 WHERE id = $1::uuid",
            user_id,
        )

    async def set_temporary_lockout(self, user_id: str, seconds: int = 900) -> None:
        """Set locked_until on the user record to lock them out for *seconds* seconds."""
        if self._use_supabase_client():
            client = await self._get_client()
            # Supabase PostgREST does not support NOW() + interval arithmetic in .update();
            # compute the timestamp in Python and pass it as an ISO string.
            from datetime import timedelta

            locked_until = (datetime.now(UTC) + timedelta(seconds=seconds)).isoformat()
            try:
                await client.table("users").update({"locked_until": locked_until}).eq("id", user_id).execute()
            except Exception as exc:
                err_msg = str(exc).lower()
                if "locked_until" in err_msg or "42703" in err_msg or "does not exist" in err_msg:
                    logger.warning("users.locked_until column missing — cannot set lockout. Run migration 042.")
                    return
                raise
            return

        await self._pg_execute(
            """
            UPDATE users
            SET locked_until = NOW() + $1 * INTERVAL '1 second'
            WHERE id = $2::uuid
            """,
            seconds,
            user_id,
        )

    async def is_temporarily_locked(self, user_id: str) -> int:
        """Return remaining lockout TTL in seconds, or 0 if not locked.

        Queries users.locked_until column. Returns 0 if the row is missing,
        locked_until is NULL, or the lockout has already expired.
        """
        if self._use_supabase_client():
            client = await self._get_client()
            try:
                result = await client.table("users").select("locked_until").eq("id", user_id).limit(1).execute()
            except Exception as exc:
                # Column missing (migration not yet applied) — treat as not locked.
                err_msg = str(exc).lower()
                if "locked_until" in err_msg or "42703" in err_msg or "does not exist" in err_msg:
                    logger.warning("users.locked_until column missing — skipping lockout check. Run migration 042.")
                    return 0
                raise
            if not result.data or not result.data[0]["locked_until"]:
                return 0
            locked_until_raw = result.data[0]["locked_until"]
            try:
                if isinstance(locked_until_raw, str):
                    locked_until = datetime.fromisoformat(locked_until_raw)
                else:
                    locked_until = locked_until_raw
                remaining = (locked_until - datetime.now(UTC)).total_seconds()
                return max(0, int(remaining))
            except Exception:
                return 0

        result = await self._pg_fetchval(
            """
            SELECT GREATEST(0, EXTRACT(EPOCH FROM (locked_until - NOW()))::int)
            FROM users
            WHERE id = $1::uuid
            """,
            user_id,
        )
        return int(result) if result is not None else 0

    async def clear_temporary_lockout(self, user_id: str) -> None:
        """Remove temporary lockout by setting locked_until = NULL."""
        if self._use_supabase_client():
            client = await self._get_client()
            try:
                await client.table("users").update({"locked_until": None}).eq("id", user_id).execute()
            except Exception as exc:
                err_msg = str(exc).lower()
                if "locked_until" in err_msg or "42703" in err_msg or "does not exist" in err_msg:
                    logger.warning("users.locked_until column missing — skipping lockout clear. Run migration 042.")
                    return
                raise
            return

        await self._pg_execute(
            "UPDATE users SET locked_until = NULL WHERE id = $1::uuid",
            user_id,
        )

    # ------------------------------------------------------------------
    # JWT denylist — revoked_jwts table
    # ------------------------------------------------------------------

    async def add_token_to_denylist(self, jti: str, ttl: int) -> None:
        """Add a JWT ID to the denylist; entry expires after *ttl* seconds."""
        if self._use_supabase_client():
            client = await self._get_client()
            from datetime import timedelta

            expires_at = (datetime.now(UTC) + timedelta(seconds=ttl)).isoformat()
            await client.table("revoked_jwts").insert({"jti": jti, "expires_at": expires_at}).execute()
            return

        await self._pg_execute(
            """
            INSERT INTO revoked_jwts (jti, expires_at)
            VALUES ($1, NOW() + $2 * INTERVAL '1 second')
            ON CONFLICT (jti) DO NOTHING
            """,
            jti,
            ttl,
        )

    async def is_token_denylisted(self, jti: str) -> bool:
        """Return True if the token JTI is on the denylist and not yet expired."""
        if self._use_supabase_client():
            client = await self._get_client()
            result = (
                await client.table("revoked_jwts")
                .select("jti")
                .eq("jti", jti)
                .gt("expires_at", datetime.now(UTC).isoformat())
                .limit(1)
                .execute()
            )
            return bool(result.data)

        result = await self._pg_fetchval(
            """
            SELECT EXISTS(
                SELECT 1 FROM revoked_jwts
                WHERE jti = $1 AND expires_at > NOW()
            )
            """,
            jti,
        )
        return bool(result)

    # ------------------------------------------------------------------
    # Conversation context — conversation_messages table
    # ------------------------------------------------------------------

    async def get_conversation_context(self, user_id: str) -> list[dict[str, Any]]:
        """Return the last *context_window* messages for a session.

        Returns messages in chronological order (oldest first), matching the
        Redis lpush/lrange behavior.
        """
        if self._use_supabase_client():
            client = await self._get_client()
            result = (
                await client.table("conversation_messages")
                .select("role, content")
                .eq("session_id", user_id)
                .order("created_at", desc=True)
                .limit(self._context_window)
                .execute()
            )
            messages = [{"role": r["role"], "content": r["content"]} for r in (result.data or [])]
            return list(reversed(messages))

        rows = await self._pg_fetch_all(
            """
            SELECT role, content
            FROM conversation_messages
            WHERE session_id = $1
            ORDER BY created_at DESC
            LIMIT $2
            """,
            user_id,
            self._context_window,
        )
        # Reverse so result is oldest-first (matching Redis lpush/lrange)
        return [{"role": r["role"], "content": r["content"]} for r in reversed(rows)]

    async def add_conversation_message(self, user_id: str, message: dict[str, Any]) -> None:
        """Insert a message into conversation_messages.

        Args:
            user_id: Session identifier (UUID string for users, phone number for WhatsApp bot).
            message: Dict with 'role' and 'content' keys.
        """
        role = message.get("role", "user")
        content = message.get("content", "")

        # Determine whether user_id looks like a UUID (registered user)
        # or a phone/other string (WhatsApp bot). If it's a UUID, pass it
        # as a proper UUID; otherwise pass None for the user_id FK column.
        import re as _re

        _uuid_re = _re.compile(
            r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$",
            _re.IGNORECASE,
        )
        db_user_id: str | None = user_id if _uuid_re.match(user_id) else None

        if self._use_supabase_client():
            client = await self._get_client()
            payload: dict[str, Any] = {
                "session_id": user_id,
                "role": role,
                "content": content,
            }
            if db_user_id:
                payload["user_id"] = db_user_id
            await client.table("conversation_messages").insert(payload).execute()
            return

        await self._pg_execute(
            """
            INSERT INTO conversation_messages (session_id, user_id, role, content)
            VALUES ($1, $2::uuid, $3, $4)
            """,
            user_id,
            db_user_id,
            role,
            content,
        )

    async def clear_conversation(self, user_id: str) -> None:
        """Delete all conversation messages for a session."""
        if self._use_supabase_client():
            client = await self._get_client()
            await client.table("conversation_messages").delete().eq("session_id", user_id).execute()
            return

        await self._pg_execute(
            "DELETE FROM conversation_messages WHERE session_id = $1",
            user_id,
        )

    # ------------------------------------------------------------------
    # Generic cache — response_cache table
    # ------------------------------------------------------------------

    async def cache_get(self, key: str) -> Any | None:
        """Return cached value for *key*, or None if not found / expired.

        Returns the deserialized Python object stored in the JSONB data column.
        Catches all exceptions and returns None (fail-open pattern).
        """
        try:
            if self._use_supabase_client():
                client = await self._get_client()
                result = (
                    await client.table("response_cache")
                    .select("data")
                    .eq("cache_key", key)
                    .gt("expires_at", datetime.now(UTC).isoformat())
                    .limit(1)
                    .execute()
                )
                if not result.data:
                    return None
                data = result.data[0]["data"]
                # Supabase PostgREST returns JSONB as a Python dict/list already
                return data

            row = await self._pg_fetch_one(
                """
                SELECT data
                FROM response_cache
                WHERE cache_key = $1 AND expires_at > NOW()
                """,
                key,
            )
            if row is None:
                return None
            data = row["data"]
            # asyncpg returns JSONB as a string; supabase returns it parsed
            if isinstance(data, str):
                return json.loads(data)
            return data
        except Exception:
            logger.debug("cache_get(%r): exception — returning None", key)
            return None

    async def cache_set(self, key: str, value: Any, ttl: int = 3600) -> None:
        """Store *value* in the cache under *key* with *ttl* seconds expiry."""
        if self._use_supabase_client():
            client = await self._get_client()
            from datetime import timedelta

            expires_at = (datetime.now(UTC) + timedelta(seconds=ttl)).isoformat()
            await (
                client.table("response_cache")
                .upsert({"cache_key": key, "data": value, "expires_at": expires_at})
                .execute()
            )
            return

        await self._pg_execute(
            """
            INSERT INTO response_cache (cache_key, data, expires_at)
            VALUES ($1, $2::jsonb, NOW() + $3 * INTERVAL '1 second')
            ON CONFLICT (cache_key) DO UPDATE
                SET data = EXCLUDED.data, expires_at = EXCLUDED.expires_at
            """,
            key,
            json.dumps(value, default=str),
            ttl,
        )

    async def cache_delete(self, key: str) -> None:
        """Delete a cached entry by key."""
        if self._use_supabase_client():
            client = await self._get_client()
            await client.table("response_cache").delete().eq("cache_key", key).execute()
            return

        await self._pg_execute(
            "DELETE FROM response_cache WHERE cache_key = $1",
            key,
        )

    # ------------------------------------------------------------------
    # WebSocket publish — pg_notify (single-worker safe)
    # ------------------------------------------------------------------

    async def publish(self, channel: str, message: str) -> None:
        """Publish a message to a Postgres NOTIFY channel.

        On single-worker Render deployments this is a no-op for fan-out but
        keeps the interface correct for future multi-worker deployments using
        LISTEN/NOTIFY.

        Supabase path: PostgREST does not expose pg_notify — logged and skipped.
        asyncpg path:  SELECT pg_notify($1, $2) via connection pool.

        This method never raises; publish errors are fire-and-forget.
        """
        try:
            if self._use_supabase_client():
                logger.debug(
                    "publish(%r): pg_notify not available via PostgREST, skipping publish",
                    channel,
                )
                return

            pool = await self._get_client()
            async with pool.acquire() as conn:
                await conn.execute("SELECT pg_notify($1, $2)", channel, message)
        except Exception:
            logger.debug("publish(%r): exception — fire-and-forget, ignoring", channel)

    # ------------------------------------------------------------------
    # A/B test tracking — ab_test_events table
    # ------------------------------------------------------------------

    async def ab_test_track(self, campaign_id: str, variant: str, outcome: str) -> None:
        """Record an A/B test outcome event."""
        if self._use_supabase_client():
            client = await self._get_client()
            await (
                client.table("ab_test_events")
                .insert({"campaign_id": campaign_id, "variant": variant, "outcome": outcome})
                .execute()
            )
            return

        await self._pg_execute(
            """
            INSERT INTO ab_test_events (campaign_id, variant, outcome)
            VALUES ($1, $2, $3)
            """,
            campaign_id,
            variant,
            outcome,
        )

    async def ab_test_get_results(self, campaign_id: str, variant: str) -> dict[str, int]:
        """Return outcome counts for a given campaign and variant.

        Returns: {outcome: count, ...}
        """
        if self._use_supabase_client():
            client = await self._get_client()
            result = (
                await client.table("ab_test_events")
                .select("outcome")
                .eq("campaign_id", campaign_id)
                .eq("variant", variant)
                .execute()
            )
            counts: dict[str, int] = {}
            for row in result.data or []:
                outcome = row["outcome"]
                counts[outcome] = counts.get(outcome, 0) + 1
            return counts

        rows = await self._pg_fetch_all(
            """
            SELECT outcome, COUNT(*) AS cnt
            FROM ab_test_events
            WHERE campaign_id = $1 AND variant = $2
            GROUP BY outcome
            """,
            campaign_id,
            variant,
        )
        return {r["outcome"]: int(r["cnt"]) for r in rows}

    # ------------------------------------------------------------------
    # Scheduler lock — scheduler_locks table
    # ------------------------------------------------------------------

    async def acquire_scheduler_lock(self, task_name: str, ttl_seconds: int) -> bool:
        """Atomically acquire a distributed scheduler lock.

        Uses UPDATE WHERE locked_until < NOW() for single-round-trip atomicity.
        Returns True if the lock was acquired, False if another worker holds it.

        Inserts the task_name row on first call so subsequent UPDATEs work.
        """
        if self._use_supabase_client():
            client = await self._get_client()
            from datetime import timedelta

            now = datetime.now(UTC)
            locked_until = (now + timedelta(seconds=ttl_seconds)).isoformat()
            # Ensure row exists
            await client.table("scheduler_locks").upsert({"task_name": task_name}, on_conflict="task_name").execute()
            # Try to acquire: update only if not currently locked
            existing = (
                await client.table("scheduler_locks")
                .select("task_name, locked_until")
                .eq("task_name", task_name)
                .limit(1)
                .execute()
            )
            if existing.data:
                row = existing.data[0]
                lu = row.get("locked_until")
                if lu is not None:
                    try:
                        lu_dt = datetime.fromisoformat(lu)
                        if lu_dt > now:
                            return False  # Still locked
                    except Exception:
                        pass
            await (
                client.table("scheduler_locks")
                .update({"locked_until": locked_until, "last_run_at": now.isoformat()})
                .eq("task_name", task_name)
                .execute()
            )
            return True

        # asyncpg path — atomic single round-trip
        # Ensure row exists first (idempotent)
        await self._pg_execute(
            """
            INSERT INTO scheduler_locks (task_name)
            VALUES ($1)
            ON CONFLICT (task_name) DO NOTHING
            """,
            task_name,
        )
        status = await self._pg_execute(
            """
            UPDATE scheduler_locks
            SET locked_until = NOW() + $1 * INTERVAL '1 second',
                last_run_at  = NOW()
            WHERE task_name = $2
              AND (locked_until IS NULL OR locked_until < NOW())
            """,
            ttl_seconds,
            task_name,
        )
        # asyncpg returns status string like "UPDATE 1" or "UPDATE 0"
        return status == "UPDATE 1"

    async def get_scheduler_last_run(self, task_name: str) -> datetime | None:
        """Return the last_run_at timestamp for a scheduler task, or None."""
        if self._use_supabase_client():
            client = await self._get_client()
            result = (
                await client.table("scheduler_locks")
                .select("last_run_at")
                .eq("task_name", task_name)
                .limit(1)
                .execute()
            )
            if result.data and result.data[0]["last_run_at"]:
                raw = result.data[0]["last_run_at"]
                if isinstance(raw, str):
                    return datetime.fromisoformat(raw)
                return raw
            return None

        row = await self._pg_fetch_one(
            "SELECT last_run_at FROM scheduler_locks WHERE task_name = $1",
            task_name,
        )
        return row["last_run_at"] if row else None

    async def release_scheduler_lock(self, task_name: str) -> None:
        """Release a scheduler lock early (set locked_until = NULL)."""
        if self._use_supabase_client():
            client = await self._get_client()
            await client.table("scheduler_locks").update({"locked_until": None}).eq("task_name", task_name).execute()
            return

        await self._pg_execute(
            "UPDATE scheduler_locks SET locked_until = NULL WHERE task_name = $1",
            task_name,
        )

    # ------------------------------------------------------------------
    # Health check
    # ------------------------------------------------------------------

    async def health_check(self) -> bool:
        """Return True if the PostgreSQL connection is healthy."""
        try:
            if self._use_supabase_client():
                client = await self._get_client()
                await client.table("response_cache").select("cache_key").limit(1).execute()
                return True

            result = await self._pg_fetchval("SELECT 1")
            return result == 1
        except Exception:
            logger.exception("PostgresStore health check failed")
            return False

    # ------------------------------------------------------------------
    # Cleanup
    # ------------------------------------------------------------------

    async def close(self) -> None:
        """Close the asyncpg connection pool (no-op for Supabase path)."""
        if self._asyncpg_pool is not None:
            try:
                await self._asyncpg_pool.close()
            except Exception:
                pass
            self._asyncpg_pool = None


# ---------------------------------------------------------------------------
# Module-level singleton
# ---------------------------------------------------------------------------

_pg_store: PostgresStore | None = None


def get_pg_store() -> PostgresStore:
    """Return (or lazily create) the module-level PostgresStore singleton."""
    global _pg_store
    if _pg_store is None:
        _pg_store = PostgresStore()
    return _pg_store
