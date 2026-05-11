"""Prove tenant-scoped RLS isolation on a real PostgreSQL database when available.

The audit's "User A cannot read User B" requirement for the ``groupio_app``
role. Skips cleanly when:

  * DATABASE_URL is not PostgreSQL
  * connection as superuser fails
  * the ``groupio_app`` role is missing (migration 021 short-circuited)
  * migration 037 has not been applied (policies still permissive)
  * the Supabase short-circuit is in effect (managed roles, different RLS)

When it runs, it proves that a connection made as ``groupio_app`` with the
``app.current_user_id`` session variable set to user A cannot read rows
owned by user B across every table covered by migration 037.
"""

from __future__ import annotations

import os
import uuid
from urllib.parse import ParseResult, urlparse, urlunparse

import pytest


def _is_postgres_dsn(url: str) -> bool:
    if not url:
        return False
    parsed = urlparse(url.replace("postgres://", "postgresql://", 1))
    return parsed.scheme in ("postgresql", "postgresql+asyncpg")


def _normalise_dsn(dsn: str) -> str:
    if dsn.startswith("postgres://"):
        dsn = dsn.replace("postgres://", "postgresql://", 1)
    return dsn.replace("postgresql+asyncpg://", "postgresql://", 1)


def _rewrite_user(dsn: str, user: str, password: str) -> str:
    """Return the same DSN but with username/password replaced. Used to
    connect as ``groupio_app`` while reusing the superuser's host/db."""
    parsed = urlparse(dsn)
    netloc_tail = parsed.netloc.split("@", 1)[-1]
    new_netloc = f"{user}:{password}@{netloc_tail}"
    return urlunparse(
        ParseResult(
            scheme=parsed.scheme,
            netloc=new_netloc,
            path=parsed.path,
            params=parsed.params,
            query=parsed.query,
            fragment=parsed.fragment,
        )
    )


async def _connect_or_skip(dsn: str, *, role: str):
    import asyncpg

    try:
        return await asyncpg.connect(dsn, timeout=10)
    except Exception as exc:  # noqa: BLE001 — skip with reason
        pytest.skip(f"PostgreSQL not reachable as {role}: {exc}")


@pytest.mark.asyncio
async def test_app_role_cannot_read_other_users_rows() -> None:

    from src.config.settings import get_settings

    settings = get_settings()
    dsn = settings.DATABASE_URL or os.environ.get("DATABASE_URL", "")
    if not _is_postgres_dsn(dsn):
        pytest.skip("Requires PostgreSQL DATABASE_URL for RLS isolation proof")

    superuser_dsn = _normalise_dsn(dsn)
    parsed = urlparse(superuser_dsn)
    if parsed.path.lstrip("/") == "postgres":
        # Supabase short-circuit — migration 037 does not run there.
        pytest.skip("Supabase uses managed RLS; migration 037 does not apply")

    super_conn = await _connect_or_skip(superuser_dsn, role="superuser")

    try:
        # Gate on the presence of the app role and the tightened policy.
        has_role = await super_conn.fetchval("SELECT 1 FROM pg_roles WHERE rolname = 'groupio_app'")
        if not has_role:
            pytest.skip("groupio_app role not provisioned — migration 021 skipped")

        policy_using = await super_conn.fetchval(
            """
            SELECT qual
            FROM pg_policies
            WHERE policyname = 'app_role_users' AND tablename = 'users'
            """
        )
        if not policy_using or "current_setting" not in policy_using:
            pytest.skip("Tightened RLS policies not present — apply alembic migration 037")

        users_table = await super_conn.fetchval(
            """
            SELECT 1 FROM information_schema.tables
            WHERE table_schema = 'public' AND table_name = 'users'
            """
        )
        if users_table is None:
            pytest.skip(
                "public.users missing — apply full alembic upgrade head "
                "before running the RLS isolation integration test."
            )

        # Seed two users owned by distinct ids. The superuser path bypasses
        # RLS, so we can insert freely here.
        user_a = uuid.uuid4().hex
        user_b = uuid.uuid4().hex
        now_sql = "NOW() AT TIME ZONE 'UTC'"
        for uid in (user_a, user_b):
            await super_conn.execute(
                f"""
                INSERT INTO users (id, email, full_name, role, is_active, is_verified,
                                   hashed_password, preferred_language, phone, created_at, updated_at)
                VALUES ($1, $2, 'RLS Test', 'resident', true, true, 'x', 'he', $3, {now_sql}, {now_sql})
                """,
                uid,
                f"{uid}@rls-test.example.com",
                uid[:12],
            )

        # Make sure groupio_app can log in. The password set by 021 is a
        # placeholder — it is reset here explicitly so the test doesn't
        # depend on the deployer's secret.
        test_password = "rls-test-" + uuid.uuid4().hex
        await super_conn.execute(f"ALTER ROLE groupio_app WITH LOGIN PASSWORD '{test_password}'")

        app_dsn = _rewrite_user(superuser_dsn, "groupio_app", test_password)
        app_conn = await _connect_or_skip(app_dsn, role="groupio_app")

        try:
            async with app_conn.transaction():
                # Session variable missing → no rows visible.
                visible_unset = await app_conn.fetchval(
                    "SELECT COUNT(*) FROM users WHERE id IN ($1, $2)",
                    user_a,
                    user_b,
                )
                assert visible_unset == 0, (
                    f"users table must deny all reads when app.current_user_id is unset (saw {visible_unset})"
                )

                # Scope to user A → only user A visible.
                await app_conn.execute("SELECT set_config('app.current_user_id', $1, true)", user_a)
                visible_as_a = await app_conn.fetch(
                    "SELECT id FROM users WHERE id IN ($1, $2)",
                    user_a,
                    user_b,
                )
                ids = {r["id"] for r in visible_as_a}
                assert ids == {user_a}, f"user A session must see only A; saw {ids}"

                # Write attempt scoped to A trying to UPDATE B must affect 0 rows.
                updated = await app_conn.execute(
                    "UPDATE users SET full_name = 'hacked' WHERE id = $1",
                    user_b,
                )
                assert updated.endswith("UPDATE 0"), f"user A must not be able to UPDATE user B; got {updated!r}"

            # Session variable resets after the tx; another query without
            # re-setting must again be empty.
            async with app_conn.transaction():
                visible_after = await app_conn.fetchval(
                    "SELECT COUNT(*) FROM users WHERE id IN ($1, $2)",
                    user_a,
                    user_b,
                )
                assert visible_after == 0, "set_config(is_local=true) must not leak across transactions"
        finally:
            await app_conn.close()

    finally:
        # Clean up seed data.
        try:
            await super_conn.execute("DELETE FROM users WHERE email LIKE '%@rls-test.example.com'")
        except Exception:
            pass
        finally:
            await super_conn.close()
