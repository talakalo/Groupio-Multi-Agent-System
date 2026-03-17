"""Security hardening: dedicated app role, RLS expansion, audit immutability.

Revision ID: 021
Revises: 020
Create Date: 2026-03-15

Addresses critical security audit findings:
- Application connects as PostgreSQL superuser (violates least-privilege)
- RLS not enabled on chat_messages, audit_logs, escalations
- audit_logs table allows UPDATE/DELETE (mutable audit trail)

Creates:
- groupio_app: application role with minimum required privileges
- groupio_readonly: read-only role for analytics/debugging
Enables RLS on additional sensitive tables and adds service-bypass policies
so the owner role (used by FastAPI's asyncpg pool) is not affected.
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "021"
down_revision: Union[str, None] = "020"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_SENSITIVE_TABLES = [
    "chat_messages",
    "audit_logs",
    "escalations",
    "escalation_messages",
]


def _role_exists(name: str) -> bool:
    conn = op.get_bind()
    return bool(
        conn.execute(
            sa.text("SELECT 1 FROM pg_roles WHERE rolname = :name"),
            {"name": name},
        ).scalar()
    )


def _is_supabase(conn) -> bool:
    """Supabase uses database 'postgres' and does not allow custom roles/GRANTs."""
    return (
        conn.execute(sa.text("SELECT current_database()")).scalar() == "postgres"
    )


def upgrade() -> None:
    conn = op.get_bind()
    if _is_supabase(conn):
        return  # Supabase: managed roles, skip custom groupio_app/groupio_readonly

    # ── 1. Create application role ─────────────────────────────────────────
    if not _role_exists("groupio_app"):
        op.execute(
            "CREATE ROLE groupio_app WITH LOGIN PASSWORD 'change-me-in-production' "
            "NOSUPERUSER NOCREATEDB NOCREATEROLE"
        )
    op.execute("GRANT CONNECT ON DATABASE groupio TO groupio_app")
    op.execute("GRANT USAGE ON SCHEMA public TO groupio_app")
    op.execute(
        "GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO groupio_app"
    )
    op.execute(
        "ALTER DEFAULT PRIVILEGES IN SCHEMA public "
        "GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO groupio_app"
    )
    op.execute("GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO groupio_app")
    op.execute("GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO groupio_app")

    # ── 2. Create read-only role ───────────────────────────────────────────
    if not _role_exists("groupio_readonly"):
        op.execute(
            "CREATE ROLE groupio_readonly WITH LOGIN PASSWORD 'change-me-readonly' "
            "NOSUPERUSER NOCREATEDB NOCREATEROLE"
        )
    op.execute("GRANT CONNECT ON DATABASE groupio TO groupio_readonly")
    op.execute("GRANT USAGE ON SCHEMA public TO groupio_readonly")
    op.execute("GRANT SELECT ON ALL TABLES IN SCHEMA public TO groupio_readonly")
    op.execute(
        "ALTER DEFAULT PRIVILEGES IN SCHEMA public "
        "GRANT SELECT ON TABLES TO groupio_readonly"
    )

    # ── 3. Make audit_logs append-only for app role ────────────────────────
    op.execute("REVOKE UPDATE, DELETE ON audit_logs FROM groupio_app")

    # ── 4. Enable RLS on additional sensitive tables ───────────────────────
    for table in _SENSITIVE_TABLES:
        op.execute(f"ALTER TABLE {table} ENABLE ROW LEVEL SECURITY")
        # Owner-bypass policy so the postgres/superuser connection is unaffected.
        # The FastAPI backend currently connects as owner, so these are permissive.
        policy = f"owner_bypass_{table}"
        op.execute(f"""
            CREATE POLICY {policy} ON {table}
            FOR ALL
            TO postgres
            USING (true)
            WITH CHECK (true)
        """)
        # App-role policy: allow all for now; tighten per-table as needed.
        app_policy = f"app_role_{table}"
        op.execute(f"""
            CREATE POLICY {app_policy} ON {table}
            FOR ALL
            TO groupio_app
            USING (true)
            WITH CHECK (true)
        """)
        # Read-only role can SELECT
        ro_policy = f"readonly_{table}"
        op.execute(f"""
            CREATE POLICY {ro_policy} ON {table}
            FOR SELECT
            TO groupio_readonly
            USING (true)
        """)

    # ── 5. Also add policies for tables already RLS-enabled by migration 009
    for table in ["users", "offer_participants", "payments"]:
        # Add app-role + readonly policies so these roles aren't locked out
        if not _policy_exists(conn, table, f"app_role_{table}"):
            op.execute(f"""
                CREATE POLICY app_role_{table} ON {table}
                FOR ALL TO groupio_app
                USING (true) WITH CHECK (true)
            """)
        if not _policy_exists(conn, table, f"readonly_{table}"):
            op.execute(f"""
                CREATE POLICY readonly_{table} ON {table}
                FOR SELECT TO groupio_readonly
                USING (true)
            """)


def _policy_exists(conn, table: str, policy: str) -> bool:
    return bool(
        conn.execute(
            sa.text(
                "SELECT 1 FROM pg_policies WHERE tablename = :tbl AND policyname = :pol"
            ),
            {"tbl": table, "pol": policy},
        ).scalar()
    )


def downgrade() -> None:
    conn = op.get_bind()
    if _is_supabase(conn):
        return

    # Remove policies
    for table in _SENSITIVE_TABLES:
        op.execute(f"DROP POLICY IF EXISTS owner_bypass_{table} ON {table}")
        op.execute(f"DROP POLICY IF EXISTS app_role_{table} ON {table}")
        op.execute(f"DROP POLICY IF EXISTS readonly_{table} ON {table}")
        op.execute(f"ALTER TABLE {table} DISABLE ROW LEVEL SECURITY")

    for table in ["users", "offer_participants", "payments"]:
        op.execute(f"DROP POLICY IF EXISTS app_role_{table} ON {table}")
        op.execute(f"DROP POLICY IF EXISTS readonly_{table} ON {table}")

    # Re-grant full privileges before dropping roles
    op.execute("REVOKE ALL ON ALL TABLES IN SCHEMA public FROM groupio_app")
    op.execute("REVOKE ALL ON ALL TABLES IN SCHEMA public FROM groupio_readonly")
    op.execute("REVOKE ALL ON SCHEMA public FROM groupio_app")
    op.execute("REVOKE ALL ON SCHEMA public FROM groupio_readonly")

    conn = op.get_bind()
    if _role_exists("groupio_readonly"):
        op.execute("DROP ROLE groupio_readonly")
    if _role_exists("groupio_app"):
        op.execute("DROP ROLE groupio_app")
