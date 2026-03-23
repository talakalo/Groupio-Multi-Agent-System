#!/usr/bin/env python3
"""
Seed script to populate the database with test data for development.

Usage (from repo root, venv active, DATABASE_URL set):

    python scripts/seed_test_data.py

    # Custom password for all seeded *user* accounts (contractors use the same):
    SEED_TEST_PASSWORD='YourPass123!' python scripts/seed_test_data.py

Docker (same DB as API):

    docker compose -f docker/docker-compose.yml run --rm api python scripts/seed_test_data.py

Creates (skips users/contractors whose email already exists):
- Staff users: 1 ``admin``, 1 ``buildings_manager``, then mostly ``resident`` accounts
- Buildings (with ``region``, ``admin_user_id``, ``floors``) + ``building_residents`` rows
- Contractors via ``PostgresClient.create_contractor`` (creates linked user rows)
- Offers (``created_by``, ``matched_contractor_id``, valid statuses)
- Support escalations (schema-aligned: ``conversation_id``, ``source_agent``, ``summary``, …)

For login-only accounts (real emails), use ``scripts/seed_user_accounts.py`` first or instead.
"""

from __future__ import annotations

import argparse
import asyncio
import os
import random
import sys
import uuid
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any

# Repo root on path
_ROOT = Path(__file__).resolve().parent.parent
if str(_ROOT) not in sys.path:
    sys.path.insert(0, str(_ROOT))

FIRST_NAMES = ["יוסי", "דני", "מיכל", "רחל", "אבי", "שרה", "דוד", "חנה", "משה", "לאה"]
LAST_NAMES = ["כהן", "לוי", "מזרחי", "פרץ", "ביטון", "אברהם", "חדד", "גבאי", "דהן", "אזולאי"]

STREET_NAMES = [
    "דיזנגוף",
    "רוטשילד",
    "הרצל",
    "ויצמן",
    "בן יהודה",
    "אלנבי",
    "קינג ג'ורג'",
    "יפו",
    "בלפור",
    "שינקין",
]

CITIES = ["תל אביב", "ירושלים", "חיפה", "באר שבע", "רמת גן", "פתח תקווה", "ראשון לציון"]

# Maps Hebrew city labels from CITIES to ``Region`` codes (``src.models.contractor.Region``).
CITY_TO_REGION: dict[str, str] = {
    "תל אביב": "tel_aviv",
    "ירושלים": "jerusalem",
    "חיפה": "haifa",
    "באר שבע": "south",
    "רמת גן": "tel_aviv",
    "פתח תקווה": "center",
    "ראשון לציון": "center",
}

REGIONS_POOL = ["tel_aviv", "center", "jerusalem", "haifa", "north", "south", "sharon", "shfela"]

SERVICE_CATEGORIES = [
    "ac_installation",
    "elevator_maintenance",
    "security_systems",
    "cleaning",
    "painting",
    "plumbing",
    "electrical",
    "landscaping",
]

COMPANY_SUFFIXES = ['בע"מ', "שירותים", "טכנולוגיות", "מערכות", "פתרונות"]

# ``ContractorBase`` requires description length ≥ 50.
CONTRACTOR_DESCRIPTION_HE = (
    "חברה מובילה בתחום השירותים לבניינים משותפים. צוות מקצועי, ביטוח ורישוי מלאים, "
    "שירות אמין לדיירים ולוועדי בתים. נתוני seed לסביבת פיתוח בלבד."
)

# DB / API offer statuses (avoid legacy names like ``matching``).
OFFER_STATUSES = ["draft", "pending", "active", "completed", "cancelled"]
OFFER_STATUSES_WITH_CONTRACTOR = ["active", "completed", "pending"]

ESCALATION_REASONS = ["manual_review", "payment_failure", "user_complaint", "quality_issue", "deadline_risk"]
ESCALATION_AGENTS = ["orchestrator", "support", "payment", "matching", "pricing"]

DEFAULT_SEED_PASSWORD = "TestSeed123!"


def _seed_password() -> str:
    return os.environ.get("SEED_TEST_PASSWORD", DEFAULT_SEED_PASSWORD)


def generate_phone() -> str:
    """Israeli mobile: 05 + 8 digits (matches ``^0\\d{8,9}$``)."""
    return f"05{random.randint(0, 9)}{random.randint(1000000, 9999999)}"


def generate_seed_email(prefix: str) -> str:
    return f"groupio.seed.{prefix}.{uuid.uuid4().hex[:10]}@test.local"


def generate_address() -> dict[str, Any]:
    return {
        "street": random.choice(STREET_NAMES),
        "number": random.randint(1, 200),
        "city": random.choice(CITIES),
        "zip_code": f"{random.randint(10000, 99999)}",
    }


def _offer_title(category: str) -> str:
    titles = {
        "ac_installation": "התקנת מזגנים לכל הבניין",
        "elevator_maintenance": "חוזה תחזוקת מעלית שנתי",
        "security_systems": "מערכת אבטחה ואינטרקום חדשה",
        "cleaning": "שירותי ניקיון קבועים לבניין",
        "painting": "צביעת חדר מדרגות וחזית",
        "plumbing": "שיפוץ צנרת ושירותי אינסטלציה",
        "electrical": "חידוש מערכת חשמל וחיווט",
        "landscaping": "גינון ותחזוקת שטחים ירוקים",
    }
    return titles.get(category, "הצעה קבוצתית")


def _offer_description(category: str) -> str:
    return (
        f"הצעה קבוצתית משתלמת ל{_offer_title(category).lower()}. "
        "מחיר מוזל לדיירים המשתתפים. נוצר אוטומטית על ידי seed_test_data."
    )


def _empty_pricing_tiers() -> list[dict[str, Any]]:
    return []


class TestDataSeeder:
    """Builds in-memory plans and persists via ``PostgresClient``."""

    def __init__(self) -> None:
        self.users: list[dict[str, Any]] = []
        self.buildings: list[dict[str, Any]] = []
        self.contractor_specs: list[dict[str, Any]] = []
        self.offers: list[dict[str, Any]] = []
        self.escalations: list[dict[str, Any]] = []

    def create_users(self, count: int) -> None:
        """Staff (admin, buildings_manager) + residents. No standalone contractor users."""
        count = max(count, 4)
        print(f"Planning {count} users (admin + buildings_manager + residents)...")

        self.users = [
            {
                "id": str(uuid.uuid4()),
                "email": generate_seed_email("admin"),
                "full_name": "Seed Admin",
                "phone": generate_phone(),
                "role": "admin",
                "preferred_language": "he",
                "is_verified": True,
            },
            {
                "id": str(uuid.uuid4()),
                "email": generate_seed_email("bm"),
                "full_name": "Seed Buildings Manager",
                "phone": generate_phone(),
                "role": "buildings_manager",
                "preferred_language": "he",
                "is_verified": True,
            },
        ]

        for _ in range(count - 2):
            first_name = random.choice(FIRST_NAMES)
            last_name = random.choice(LAST_NAMES)
            full_name = f"{first_name} {last_name}"
            self.users.append(
                {
                    "id": str(uuid.uuid4()),
                    "email": generate_seed_email("resident"),
                    "full_name": full_name,
                    "phone": generate_phone(),
                    "role": "resident",
                    "preferred_language": random.choice(["he", "en"]),
                    "is_verified": random.random() > 0.1,
                }
            )

        print(f"  Planned {len(self.users)} users")

    def create_buildings(self, count: int) -> None:
        print(f"Planning {count} buildings...")
        staff_ids = [u["id"] for u in self.users if u["role"] in ("admin", "buildings_manager")]
        resident_ids = [u["id"] for u in self.users if u["role"] == "resident"]
        if not staff_ids or not resident_ids:
            print("  ⚠️  Missing staff or residents — skip buildings")
            return

        pool = list(resident_ids)
        random.shuffle(pool)

        for _ in range(count):
            addr = generate_address()
            city = addr["city"]
            region = CITY_TO_REGION.get(city, "center")
            num_res = min(random.randint(3, 12), len(pool)) if pool else 0
            assigned: list[str] = [pool.pop() for _ in range(num_res)] if num_res else []

            self.buildings.append(
                {
                    "id": str(uuid.uuid4()),
                    "name": f"בניין {addr['street']} {addr['number']}",
                    "address": f"{addr['street']} {addr['number']}, {city}",
                    "city": city,
                    "region": region,
                    "total_units": random.randint(8, 50),
                    "floors": random.randint(1, 12),
                    "year_built": random.randint(1970, 2023),
                    "admin_user_id": random.choice(staff_ids),
                    "resident_ids": assigned,
                }
            )

        print(f"  Planned {len(self.buildings)} buildings")

    def create_contractor_specs(self, count: int) -> None:
        print(f"Planning {count} contractor profiles...")
        for _ in range(count):
            category = random.choice(SERVICE_CATEGORIES)
            cats = [category] + random.sample(
                [c for c in SERVICE_CATEGORIES if c != category],
                k=min(2, len(SERVICE_CATEGORIES) - 1),
            )
            business = f"{random.choice(LAST_NAMES)} {random.choice(COMPANY_SUFFIXES)}"
            self.contractor_specs.append(
                {
                    "business_name": business,
                    "contact_name": f"{random.choice(FIRST_NAMES)} {random.choice(LAST_NAMES)}",
                    "email": generate_seed_email("contractor"),
                    "phone": generate_phone(),
                    "description": CONTRACTOR_DESCRIPTION_HE,
                    "categories": cats,
                    "regions": random.sample(REGIONS_POOL, k=random.randint(1, min(4, len(REGIONS_POOL)))),
                    "years_experience": random.randint(1, 25),
                    "employee_count": random.randint(1, 80),
                    "verification_status": random.choice(["pending", "verified", "verified"]),
                    "trust_score": round(random.uniform(3.5, 5.0), 1),
                    "license_number": f"LIC{random.randint(100000, 999999)}",
                }
            )
        print(f"  Planned {len(self.contractor_specs)} contractors")

    def create_offers(self, count: int) -> None:
        if not self.buildings:
            print("  ⚠️  No buildings — skip offers")
            return

        print(f"Planning {count} offers...")
        residents = [u["id"] for u in self.users if u["role"] == "resident"]

        for _ in range(count):
            building = random.choice(self.buildings)
            b_res = building.get("resident_ids") or []
            creator = random.choice(b_res) if b_res else random.choice(residents)

            category = random.choice(SERVICE_CATEGORIES)
            status = random.choices(
                OFFER_STATUSES,
                weights=[0.1, 0.15, 0.35, 0.3, 0.1],
                k=1,
            )[0]

            base_price = float(random.randint(1000, 50000))
            min_p = random.randint(3, 10)
            max_p = min_p + random.randint(5, 25)
            cur_p = random.randint(0, max_p) if status != "draft" else 0

            offer: dict[str, Any] = {
                "id": str(uuid.uuid4()),
                "title": _offer_title(category),
                "description": _offer_description(category),
                "category": category,
                "base_price": base_price,
                "min_participants": min_p,
                "max_participants": max_p,
                "deadline": datetime.now() + timedelta(days=random.randint(-10, 60)),
                "building_id": building["id"],
                "created_by": creator,
                "status": status,
                "current_participants": cur_p,
                "pricing_tiers": _empty_pricing_tiers(),
                "matched_contractor_spec_idx": None,
            }

            if status in OFFER_STATUSES_WITH_CONTRACTOR and self.contractor_specs:
                verified_idx = [
                    i for i, s in enumerate(self.contractor_specs) if s["verification_status"] == "verified"
                ]
                pool_idx = verified_idx or list(range(len(self.contractor_specs)))
                offer["matched_contractor_spec_idx"] = random.choice(pool_idx)

            self.offers.append(offer)

        print(f"  Planned {len(self.offers)} offers")

    def create_escalations(self, count: int) -> None:
        residents = [u["id"] for u in self.users if u["role"] == "resident"]
        if not residents:
            print("  ⚠️  No residents — skip escalations")
            return

        print(f"Planning {count} escalations...")
        for _ in range(count):
            st = random.choice(["open", "in_progress", "resolved"])
            self.escalations.append(
                {
                    "id": str(uuid.uuid4()),
                    "user_id": random.choice(residents),
                    "conversation_id": str(uuid.uuid4()),
                    "source_agent": random.choice(ESCALATION_AGENTS),
                    "reason": random.choice(ESCALATION_REASONS),
                    "priority": random.choice(["low", "medium", "high"]),
                    "summary": "פניית תמיכה לדוגמה שנוצרה על ידי seed_test_data לבדיקת לוח הניהול.",
                    "status": st,
                    "assigned_to": None,
                    "context": {"seed": True},
                    "agent_reasoning": None,
                    "resolution_notes": "סגור בדמו" if st == "resolved" else None,
                    "resolved_at": datetime.now(tz=UTC) if st == "resolved" else None,
                }
            )
        print(f"  Planned {len(self.escalations)} escalations")

    async def _write_to_db(self, password: str) -> dict[str, int]:
        from src.api.middleware.auth import hash_password
        from src.config.settings import get_settings
        from src.databases.postgres import get_postgres_client

        get_settings()
        db = get_postgres_client()

        if not await db.health_check():
            raise RuntimeError("Database health check failed — check DATABASE_URL / Postgres.")

        hashed = hash_password(password)
        stats = {
            "users_created": 0,
            "users_skipped": 0,
            "buildings": 0,
            "residents_linked": 0,
            "contractors": 0,
            "offers": 0,
            "escalations": 0,
        }

        print("\n💾 Writing to database...\n")

        for u in self.users:
            try:
                existing = await db.get_user_by_email(u["email"])
                if existing:
                    stats["users_skipped"] += 1
                    continue
                await db.create_user(
                    {
                        "id": u["id"],
                        "email": u["email"],
                        "hashed_password": hashed,
                        "full_name": u["full_name"],
                        "phone": u["phone"],
                        "role": u["role"],
                        "preferred_language": u.get("preferred_language", "he"),
                        "is_active": True,
                        "is_verified": u.get("is_verified", True),
                    }
                )
                stats["users_created"] += 1
            except Exception as exc:
                print(f"  ⚠️  User skipped {u.get('email')}: {exc}")
                stats["users_skipped"] += 1

        for b in self.buildings:
            try:
                resident_ids: list[str] = list(b.get("resident_ids", []))
                await db.create_building(
                    {
                        "id": b["id"],
                        "name": b["name"],
                        "address": b["address"],
                        "city": b["city"],
                        "region": b["region"],
                        "total_units": b.get("total_units", 0),
                        "floors": b.get("floors", 1),
                        "year_built": b.get("year_built"),
                        "admin_user_id": b["admin_user_id"],
                        "resident_count": len(resident_ids),
                        "active_offers": 0,
                        "completed_offers": 0,
                        "total_savings": 0,
                    }
                )
                stats["buildings"] += 1
                bid = b["id"]
                for uid in resident_ids:
                    try:
                        await db.add_resident_to_building(
                            uid,
                            bid,
                            unit_number=str(random.randint(1, 32)),
                            floor=random.randint(0, max(1, b.get("floors", 1) - 1)),
                            is_owner=random.choice([True, False]),
                        )
                        stats["residents_linked"] += 1
                    except Exception as exc:
                        print(f"  ⚠️  building_residents skip user={uid[:8]}…: {exc}")
            except Exception as exc:
                print(f"  ⚠️  Building skipped {b.get('name')}: {exc}")

        spec_index_to_contractor_id: dict[int, str] = {}
        for spec_i, spec in enumerate(self.contractor_specs):
            try:
                existing = await db.get_user_by_email(spec["email"])
                if existing:
                    print(f"  ⚠️  Contractor email exists, skip: {spec['email']}")
                    continue
                row = await db.create_contractor(spec, password)
                spec_index_to_contractor_id[spec_i] = str(row["id"])
                stats["contractors"] += 1
            except Exception as exc:
                print(f"  ⚠️  Contractor skipped {spec.get('business_name')}: {exc}")

        for raw in self.offers:
            try:
                offer = dict(raw)
                idx = offer.pop("matched_contractor_spec_idx", None)
                matched: str | None = None
                if idx is not None and isinstance(idx, int):
                    matched = spec_index_to_contractor_id.get(idx)
                await db.create_offer(
                    {
                        "id": offer["id"],
                        "title": offer["title"],
                        "description": offer["description"],
                        "category": offer["category"],
                        "base_price": offer["base_price"],
                        "min_participants": offer["min_participants"],
                        "max_participants": offer["max_participants"],
                        "deadline": offer.get("deadline"),
                        "building_id": offer["building_id"],
                        "created_by": offer["created_by"],
                        "status": offer["status"],
                        "current_participants": offer["current_participants"],
                        "matched_contractor_id": matched,
                        "pricing_tiers": offer.get("pricing_tiers") or [],
                    }
                )
                stats["offers"] += 1
            except Exception as exc:
                print(f"  ⚠️  Offer skipped {raw.get('id')}: {exc}")

        for esc in self.escalations:
            try:
                payload = dict(esc)
                if payload.get("resolved_at") is not None:
                    pass
                await db.create_escalation(payload)
                stats["escalations"] += 1
            except Exception as exc:
                print(f"  ⚠️  Escalation skipped {esc.get('id')}: {exc}")

        return stats

    async def seed_all(
        self,
        *,
        users: int = 40,
        buildings: int = 8,
        contractors: int = 15,
        offers: int = 25,
        escalations: int = 12,
        write_db: bool = True,
    ) -> dict[str, Any]:
        print("\n🌱 Test data seed — planning\n")
        pwd = _seed_password()

        self.create_users(users)
        self.create_buildings(buildings)
        self.create_contractor_specs(contractors)
        self.create_offers(offers)
        self.create_escalations(escalations)

        print("\n📊 Plan summary:")
        print(f"  Users: {len(self.users)}  Buildings: {len(self.buildings)}")
        print(f"  Contractor specs: {len(self.contractor_specs)}  Offers: {len(self.offers)}")
        print(f"  Escalations: {len(self.escalations)}")

        stats: dict[str, int] | None = None
        if write_db:
            stats = await self._write_to_db(pwd)
            print(
                "\n✅ DB write — "
                f"users_created={stats['users_created']} users_skipped={stats['users_skipped']} "
                f"buildings={stats['buildings']} residents_linked={stats['residents_linked']} "
                f"contractors={stats['contractors']} offers={stats['offers']} "
                f"escalations={stats['escalations']}"
            )
            print(f"\n🔑 Seed password for new user accounts (incl. contractor logins): {pwd!r}\n")
        else:
            print("\n(Dry run — no database write)\n")

        return {
            "users": self.users,
            "buildings": self.buildings,
            "contractor_specs": self.contractor_specs,
            "offers": self.offers,
            "escalations": self.escalations,
            "stats": stats,
        }


def _parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description="Seed PostgreSQL with Groupio test data.")
    p.add_argument("--users", type=int, default=40, help="Total users (includes admin + BM)")
    p.add_argument("--buildings", type=int, default=8)
    p.add_argument("--contractors", type=int, default=15)
    p.add_argument("--offers", type=int, default=25)
    p.add_argument("--escalations", type=int, default=12)
    p.add_argument("--dry-run", action="store_true", help="Plan only, do not write DB")
    return p.parse_args()


def main() -> None:
    args = _parse_args()
    from src.config.settings import get_settings

    get_settings()
    seeder = TestDataSeeder()
    asyncio.run(
        seeder.seed_all(
            users=args.users,
            buildings=args.buildings,
            contractors=args.contractors,
            offers=args.offers,
            escalations=args.escalations,
            write_db=not args.dry_run,
        )
    )


if __name__ == "__main__":
    main()
