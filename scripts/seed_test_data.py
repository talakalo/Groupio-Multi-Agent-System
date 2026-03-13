#!/usr/bin/env python3
"""
Seed script to populate the database with test data for development.

Usage:
    python scripts/seed_test_data.py

This script creates:
- Test users (residents, contractors, admins)
- Buildings with residents
- Active and historical offers
- Contractor profiles with reviews
- Sample escalations
"""

import asyncio
import random
import uuid
from datetime import datetime, timedelta
from typing import List

# You'll need to import your database connection and models
# from src.database import get_db_session
# from src.models import User, Building, Offer, Contractor, Escalation

# Sample Hebrew data
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

COMPANY_SUFFIXES = ["בע\"מ", "שירותים", "טכנולוגיות", "מערכות", "פתרונות"]


def generate_phone() -> str:
    """Generate a random Israeli phone number."""
    return f"05{random.randint(0, 9)}{random.randint(1000000, 9999999)}"


def generate_email(name: str) -> str:
    """Generate an email from a name."""
    clean_name = name.replace(" ", ".").lower()
    domains = ["gmail.com", "walla.co.il", "yahoo.com", "hotmail.com"]
    return f"{clean_name}{random.randint(1, 999)}@{random.choice(domains)}"


def generate_address() -> dict:
    """Generate a random Israeli address."""
    return {
        "street": random.choice(STREET_NAMES),
        "number": random.randint(1, 200),
        "city": random.choice(CITIES),
        "zip_code": f"{random.randint(10000, 99999)}",
    }


class TestDataSeeder:
    """Handles seeding of test data."""

    def __init__(self):
        self.users: List[dict] = []
        self.buildings: List[dict] = []
        self.contractors: List[dict] = []
        self.offers: List[dict] = []
        self.escalations: List[dict] = []

    def create_users(self, count: int = 50) -> List[dict]:
        """Create test user records."""
        print(f"Creating {count} test users...")

        for i in range(count):
            first_name = random.choice(FIRST_NAMES)
            last_name = random.choice(LAST_NAMES)
            full_name = f"{first_name} {last_name}"

            # Assign roles: mostly residents, some contractors, few admins
            role_weights = [("resident", 0.7), ("contractor", 0.25), ("admin", 0.05)]
            role = random.choices(
                [r[0] for r in role_weights], weights=[r[1] for r in role_weights]
            )[0]

            user = {
                "id": str(uuid.uuid4()),
                "email": generate_email(full_name),
                "full_name": full_name,
                "phone": generate_phone(),
                "role": role,
                "preferred_language": random.choice(["he", "en"]),
                "is_verified": random.random() > 0.1,  # 90% verified
                "created_at": datetime.now() - timedelta(days=random.randint(1, 365)),
            }
            self.users.append(user)

        print(f"  Created {len(self.users)} users")
        return self.users

    def create_buildings(self, count: int = 10) -> List[dict]:
        """Create test building records."""
        print(f"Creating {count} test buildings...")

        resident_users = [u for u in self.users if u["role"] == "resident"]

        for i in range(count):
            address = generate_address()
            building = {
                "id": str(uuid.uuid4()),
                "name": f"בניין {address['street']} {address['number']}",
                "address": f"{address['street']} {address['number']}, {address['city']}",
                "city": address["city"],
                "total_units": random.randint(8, 50),
                "year_built": random.randint(1970, 2023),
                "has_elevator": random.random() > 0.3,
                "parking_spaces": random.randint(0, 30),
                "created_at": datetime.now() - timedelta(days=random.randint(30, 365)),
            }

            # Assign some residents to this building
            num_residents = min(random.randint(3, 15), len(resident_users))
            assigned_residents = random.sample(resident_users, num_residents)
            building["residents"] = [r["id"] for r in assigned_residents]

            # Remove assigned residents from pool
            for r in assigned_residents:
                resident_users.remove(r)

            self.buildings.append(building)

        print(f"  Created {len(self.buildings)} buildings")
        return self.buildings

    def create_contractors(self, count: int = 20) -> List[dict]:
        """Create test contractor records."""
        print(f"Creating {count} test contractors...")

        contractor_users = [u for u in self.users if u["role"] == "contractor"]

        for i in range(min(count, len(contractor_users))):
            user = contractor_users[i]
            category = random.choice(SERVICE_CATEGORIES)

            contractor = {
                "id": str(uuid.uuid4()),
                "user_id": user["id"],
                "company_name": f"{random.choice(LAST_NAMES)} {random.choice(COMPANY_SUFFIXES)}",
                "business_license": f"BL{random.randint(100000, 999999)}",
                "categories": [category] + random.sample(SERVICE_CATEGORIES, random.randint(0, 2)),
                "regions": random.sample(CITIES, random.randint(1, 3)),
                "years_experience": random.randint(1, 30),
                "verification_status": random.choice(["pending", "verified", "verified"]),
                "trust_score": round(random.uniform(3.5, 5.0), 1),
                "total_jobs": random.randint(0, 200),
                "total_reviews": random.randint(0, 50),
                "created_at": datetime.now() - timedelta(days=random.randint(30, 365)),
            }
            self.contractors.append(contractor)

        print(f"  Created {len(self.contractors)} contractors")
        return self.contractors

    def create_offers(self, count: int = 30) -> List[dict]:
        """Create test offer records."""
        print(f"Creating {count} test offers...")

        for i in range(count):
            building = random.choice(self.buildings)
            category = random.choice(SERVICE_CATEGORIES)

            # Status distribution
            status = random.choices(
                ["draft", "pending", "active", "matching", "completed", "cancelled"],
                weights=[0.05, 0.1, 0.35, 0.15, 0.3, 0.05],
            )[0]

            base_price = random.randint(1000, 50000)
            min_participants = random.randint(3, 10)
            max_participants = min_participants + random.randint(5, 30)
            current_participants = (
                random.randint(0, max_participants) if status != "draft" else 0
            )

            offer = {
                "id": str(uuid.uuid4()),
                "building_id": building["id"],
                "title": self._get_offer_title(category),
                "description": self._get_offer_description(category),
                "category": category,
                "base_price": base_price,
                "min_participants": min_participants,
                "max_participants": max_participants,
                "current_participants": current_participants,
                "status": status,
                "discount_percentage": random.randint(10, 40) if current_participants >= min_participants else 0,
                "deadline": datetime.now() + timedelta(days=random.randint(-30, 60)),
                "created_at": datetime.now() - timedelta(days=random.randint(1, 90)),
            }

            # Assign contractor if matched or completed
            if status in ["matching", "completed"]:
                verified_contractors = [
                    c for c in self.contractors if c["verification_status"] == "verified"
                ]
                if verified_contractors:
                    offer["contractor_id"] = random.choice(verified_contractors)["id"]

            self.offers.append(offer)

        print(f"  Created {len(self.offers)} offers")
        return self.offers

    def create_escalations(self, count: int = 15) -> List[dict]:
        """Create test escalation records."""
        print(f"Creating {count} test escalations...")

        for i in range(count):
            offer = random.choice(self.offers)
            user = random.choice(self.users)

            status = random.choices(
                ["new", "in_progress", "resolved", "closed"],
                weights=[0.2, 0.3, 0.35, 0.15],
            )[0]

            escalation = {
                "id": str(uuid.uuid4()),
                "offer_id": offer["id"],
                "reporter_id": user["id"],
                "type": random.choice([
                    "payment_issue",
                    "service_quality",
                    "communication",
                    "contractor_dispute",
                    "deadline_missed",
                ]),
                "priority": random.choice(["low", "medium", "high", "critical"]),
                "status": status,
                "description": "בעיה לדוגמה שנוצרה לצורכי בדיקה",
                "created_at": datetime.now() - timedelta(days=random.randint(1, 30)),
                "resolved_at": datetime.now() if status in ["resolved", "closed"] else None,
            }
            self.escalations.append(escalation)

        print(f"  Created {len(self.escalations)} escalations")
        return self.escalations

    def _get_offer_title(self, category: str) -> str:
        """Get a title for an offer based on category."""
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

    def _get_offer_description(self, category: str) -> str:
        """Get a description for an offer based on category."""
        return f"הצעה קבוצתית משתלמת ל{self._get_offer_title(category).lower()}. מחיר מוזל לכל הדיירים המשתתפים!"

    async def _write_to_db(self) -> None:
        """Write all generated seed data to the database via PostgresClient."""
        import sys
        import os

        # Allow running from repo root or scripts/ directory
        repo_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        if repo_root not in sys.path:
            sys.path.insert(0, repo_root)

        try:
            from src.databases.postgres import get_postgres_client  # noqa: PLC0415

            db = get_postgres_client()

            print("\n💾 Writing seed data to database...")

            written = {"users": 0, "buildings": 0, "contractors": 0, "offers": 0}

            for user in self.users:
                try:
                    existing = await db.get_user_by_email(user["email"])
                    if not existing:
                        await db.create_user(user)
                        written["users"] += 1
                except Exception as exc:
                    print(f"  ⚠️  Skipped user {user.get('email')}: {exc}")

            for building in self.buildings:
                try:
                    await db.create_building(building)
                    written["buildings"] += 1
                except Exception as exc:
                    print(f"  ⚠️  Skipped building {building.get('address')}: {exc}")

            for contractor in self.contractors:
                try:
                    await db.create_contractor(contractor)
                    written["contractors"] += 1
                except Exception as exc:
                    print(f"  ⚠️  Skipped contractor {contractor.get('business_name')}: {exc}")

            for offer in self.offers:
                try:
                    await db.create_offer(offer)
                    written["offers"] += 1
                except Exception as exc:
                    print(f"  ⚠️  Skipped offer {offer.get('id')}: {exc}")

            print(
                f"  ✅ Inserted — users:{written['users']} buildings:{written['buildings']} "
                f"contractors:{written['contractors']} offers:{written['offers']}"
            )
        except ImportError as exc:
            print(f"  ⚠️  Could not import PostgresClient — database write skipped ({exc})")
            print("     Run from the repository root with the Python virtualenv activated.")

    async def seed_all(self):
        """Run all seeding operations."""
        print("\n🌱 Starting test data seeding...\n")

        self.create_users(50)
        self.create_buildings(10)
        self.create_contractors(20)
        self.create_offers(30)
        self.create_escalations(15)

        print("\n📊 Seeding Summary:")
        print(f"  - Users: {len(self.users)}")
        print(f"  - Buildings: {len(self.buildings)}")
        print(f"  - Contractors: {len(self.contractors)}")
        print(f"  - Offers: {len(self.offers)}")
        print(f"  - Escalations: {len(self.escalations)}")

        # Persist to database via PostgresClient
        await self._write_to_db()

        print("\n✅ Test data seeding completed!")

        return {
            "users": self.users,
            "buildings": self.buildings,
            "contractors": self.contractors,
            "offers": self.offers,
            "escalations": self.escalations,
        }


def main():
    """Main entry point."""
    seeder = TestDataSeeder()
    asyncio.run(seeder.seed_all())


if __name__ == "__main__":
    main()
