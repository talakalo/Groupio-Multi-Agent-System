"""Schema contract tests (Task 1.1).

Validates that the named column lists in postgres.py match the columns
that exist in the DB migrations. These tests run against the column
definitions in the Alembic migration files — no live DB connection needed.

If these tests fail, it means _PAYMENT_COLS (or similar) references a
column that was never created by any migration, which would cause
'column does not exist' errors at runtime.
"""

import ast
import re
from pathlib import Path

REPO_ROOT = Path(__file__).parent.parent.parent
POSTGRES_PY = REPO_ROOT / "src" / "databases" / "postgres.py"
MIGRATIONS_DIR = REPO_ROOT / "alembic" / "versions"


def _read_payment_cols() -> set[str]:
    """Extract column names from _PAYMENT_COLS in postgres.py."""
    src = POSTGRES_PY.read_text()
    match = re.search(r'_PAYMENT_COLS\s*=\s*\((.*?)\)', src, re.DOTALL)
    assert match, "_PAYMENT_COLS not found in postgres.py"
    raw = match.group(1).replace('"', "").replace("'", "").replace("\n", "").replace("\\", "")
    return {c.strip() for c in raw.split(",") if c.strip()}


def _all_migration_text() -> str:
    texts = []
    for path in sorted(MIGRATIONS_DIR.glob("*.py")):
        if path.name.startswith("__"):
            continue
        texts.append(path.read_text())
    return "\n".join(texts)


def _extract_balanced(text: str, start: int) -> str:
    """Return the substring from start up to and including the matching close paren."""
    depth = 0
    for i in range(start, len(text)):
        if text[i] == "(":
            depth += 1
        elif text[i] == ")":
            depth -= 1
            if depth == 0:
                return text[start : i + 1]
    return text[start:]


def _columns_added_to_table(table: str, migration_text: str) -> set[str]:
    """
    Extract column names from:
      - sa.Column("col_name", ...) inside op.create_table(table, ...)
      - op.add_column(table, sa.Column("col_name", ...))
    """
    cols: set[str] = set()
    col_re = re.compile(r'sa\.Column\s*\(\s*["\'](\w+)["\']')

    # Columns from op.add_column("table", sa.Column("name", ...))
    add_col_re = re.compile(
        r'op\.add_column\s*\(\s*["\']' + re.escape(table) + r'["\'].*?sa\.Column\s*\(\s*["\'](\w+)["\']',
        re.DOTALL,
    )
    cols.update(m.group(1) for m in add_col_re.finditer(migration_text))

    # Columns from op.create_table("table", ...) — use balanced-paren extraction
    # so deeply-nested sa.Column(...) args don't truncate the block.
    header_re = re.compile(
        r'op\.create_table\s*\(\s*["\']' + re.escape(table) + r'["\']'
    )
    for hm in header_re.finditer(migration_text):
        block = _extract_balanced(migration_text, hm.start())
        cols.update(m.group(1) for m in col_re.finditer(block))

    return cols


def test_payment_cols_all_exist_in_migrations() -> None:
    """Every column in _PAYMENT_COLS must appear in at least one migration for 'payments'."""
    payment_cols = _read_payment_cols()
    migration_text = _all_migration_text()
    db_cols = _columns_added_to_table("payments", migration_text)

    # Standard columns always present (PK + timestamps added implicitly)
    always_present = {"id", "created_at", "updated_at"}
    db_cols.update(always_present)

    missing = payment_cols - db_cols
    assert not missing, (
        f"_PAYMENT_COLS references columns not found in any migration: {sorted(missing)}\n"
        "Add an Alembic migration to create the missing columns."
    )


def test_create_payment_asyncpg_uses_only_known_columns() -> None:
    """The asyncpg INSERT in create_payment must not reference phantom columns."""
    src = POSTGRES_PY.read_text()
    match = re.search(
        r'sql_pay\s*=\s*"""INSERT INTO payments\s*\((.*?)\)',
        src,
        re.DOTALL,
    )
    assert match, "create_payment asyncpg INSERT not found"

    raw_cols = match.group(1).replace("\n", "").replace(" ", "")
    insert_cols = {c.strip() for c in raw_cols.split(",") if c.strip()}

    migration_text = _all_migration_text()
    db_cols = _columns_added_to_table("payments", migration_text)
    db_cols.update({"id", "created_at", "updated_at"})

    missing = insert_cols - db_cols
    assert not missing, (
        f"create_payment INSERT uses columns not in any migration: {sorted(missing)}"
    )


def test_create_invoice_asyncpg_uses_only_known_columns() -> None:
    """The asyncpg INSERT in create_invoice must not reference phantom columns."""
    src = POSTGRES_PY.read_text()
    match = re.search(
        r'sql\s*=\s*"""INSERT INTO invoices\s*\((.*?)\)',
        src,
        re.DOTALL,
    )
    assert match, "create_invoice asyncpg INSERT not found"

    raw_cols = match.group(1).replace("\n", "").replace(" ", "")
    insert_cols = {c.strip() for c in raw_cols.split(",") if c.strip()}

    migration_text = _all_migration_text()
    db_cols = _columns_added_to_table("invoices", migration_text)
    db_cols.update({"id", "created_at", "updated_at"})

    missing = insert_cols - db_cols
    assert not missing, (
        f"create_invoice INSERT uses columns not in any migration: {sorted(missing)}"
    )


def test_create_payment_split_asyncpg_uses_only_known_columns() -> None:
    """The asyncpg INSERT in create_payment_split must not reference phantom columns."""
    src = POSTGRES_PY.read_text()
    match = re.search(
        r'INSERT INTO payment_splits\s*\((.*?)\)',
        src,
        re.DOTALL,
    )
    assert match, "create_payment_split INSERT not found"

    raw_cols = match.group(1).replace("\n", "").replace(" ", "")
    insert_cols = {c.strip() for c in raw_cols.split(",") if c.strip()}

    migration_text = _all_migration_text()
    db_cols = _columns_added_to_table("payment_splits", migration_text)
    db_cols.update({"id", "created_at"})

    missing = insert_cols - db_cols
    assert not missing, (
        f"create_payment_split INSERT uses columns not in any migration: {sorted(missing)}"
    )
