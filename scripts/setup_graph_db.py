"""Initialize Neo4j schema and seed sample data."""

import asyncio
import logging
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from src.databases.graph_store import GraphStore

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


async def create_schema(graph: GraphStore) -> None:
    """Create Neo4j constraints and indexes."""
    await graph.create_schema()
    logger.info("Schema created successfully")


async def seed_sample_data(graph: GraphStore) -> None:
    """Load sample data for testing and development."""

    # -- Buildings --
    buildings = [
        {
            "id": "bld_001",
            "address": "Rothschild 15",
            "city": "Tel Aviv",
            "region": "center",
            "units": 24,
            "age": 2,
            "type": "new_residential",
        },
        {
            "id": "bld_002",
            "address": "Herzl 42",
            "city": "Haifa",
            "region": "haifa",
            "units": 16,
            "age": 5,
            "type": "residential",
        },
        {
            "id": "bld_003",
            "address": "Ben Gurion 8",
            "city": "Ramat Gan",
            "region": "center",
            "units": 32,
            "age": 1,
            "type": "new_residential",
        },
    ]

    for b in buildings:
        await graph.execute(
            """
            MERGE (b:Building {id: $id})
            SET b.address = $address,
                b.city = $city,
                b.region = $region,
                b.units = $units,
                b.age = $age,
                b.type = $type
            """,
            b,
        )
    logger.info("Created %d buildings", len(buildings))

    # -- Contractors --
    contractors = [
        {
            "id": "con_001",
            "business_name": "Cool Air Ltd",
            "license_number": "AC-12345",
            "verified": True,
            "rating": 4.8,
            "categories": ["ac_installation", "ac_maintenance"],
            "regions": ["center", "tel_aviv"],
        },
        {
            "id": "con_002",
            "business_name": "Kitchen Masters",
            "license_number": "KIT-67890",
            "verified": True,
            "rating": 4.6,
            "categories": ["kitchen", "renovations"],
            "regions": ["center", "haifa"],
        },
        {
            "id": "con_003",
            "business_name": "ElectroPro",
            "license_number": "ELC-11111",
            "verified": True,
            "rating": 4.9,
            "categories": ["electrical"],
            "regions": ["center", "tel_aviv", "haifa"],
        },
        {
            "id": "con_004",
            "business_name": "PlumbRight",
            "license_number": "PLB-22222",
            "verified": False,
            "rating": 3.5,
            "categories": ["plumbing"],
            "regions": ["center"],
        },
    ]

    for c in contractors:
        await graph.execute(
            """
            MERGE (c:Contractor {id: $id})
            SET c.business_name = $business_name,
                c.license_number = $license_number,
                c.verified = $verified,
                c.rating = $rating,
                c.categories = $categories,
                c.regions = $regions
            """,
            c,
        )
    logger.info("Created %d contractors", len(contractors))

    # -- Residents --
    residents = [
        {"id": "res_001", "name": "Yael Cohen", "building_id": "bld_001"},
        {"id": "res_002", "name": "David Levi", "building_id": "bld_001"},
        {"id": "res_003", "name": "Sarah Mizrahi", "building_id": "bld_002"},
        {"id": "res_004", "name": "Avi Goldstein", "building_id": "bld_003"},
    ]

    for r in residents:
        await graph.execute(
            """
            MERGE (r:Resident {id: $id})
            SET r.name = $name
            WITH r
            MATCH (b:Building {id: $building_id})
            MERGE (r)-[:LIVES_IN]->(b)
            """,
            r,
        )
    logger.info("Created %d residents", len(residents))

    # -- Completed Projects --
    completions = [
        {
            "contractor_id": "con_001",
            "building_id": "bld_001",
            "success_rate": 0.95,
            "completion_date": "2024-06-15",
            "final_price": 12000,
        },
        {
            "contractor_id": "con_001",
            "building_id": "bld_003",
            "success_rate": 0.92,
            "completion_date": "2024-08-20",
            "final_price": 15000,
        },
        {
            "contractor_id": "con_002",
            "building_id": "bld_002",
            "success_rate": 0.88,
            "completion_date": "2024-07-10",
            "final_price": 45000,
        },
        {
            "contractor_id": "con_003",
            "building_id": "bld_001",
            "success_rate": 0.98,
            "completion_date": "2024-09-01",
            "final_price": 8000,
        },
    ]

    for comp in completions:
        await graph.execute(
            """
            MATCH (c:Contractor {id: $contractor_id})
            MATCH (b:Building {id: $building_id})
            MERGE (c)-[r:COMPLETED]->(b)
            SET r.success_rate = $success_rate,
                r.completion_date = date($completion_date),
                r.final_price = $final_price
            """,
            comp,
        )
    logger.info("Created %d completion relationships", len(completions))

    # -- Reviews --
    reviews = [
        {
            "resident_id": "res_001",
            "contractor_id": "con_001",
            "rating": 5,
            "text": "עבודה מצוינת! מקצועי ואדיב",
        },
        {
            "resident_id": "res_002",
            "contractor_id": "con_001",
            "rating": 4,
            "text": "Good work, slightly delayed but quality was great",
        },
        {
            "resident_id": "res_003",
            "contractor_id": "con_002",
            "rating": 5,
            "text": "המטבח יצא מושלם, ממליצה בחום",
        },
    ]

    for rev in reviews:
        await graph.execute(
            """
            MATCH (r:Resident {id: $resident_id})
            MATCH (c:Contractor {id: $contractor_id})
            MERGE (r)-[rv:REVIEWED]->(c)
            SET rv.rating = $rating,
                rv.text = $text,
                rv.verified = true
            """,
            rev,
        )
    logger.info("Created %d reviews", len(reviews))

    # -- Categories --
    categories = [
        {"id": "cat_ac", "name": "AC Installation", "name_he": "התקנת מזגנים"},
        {"id": "cat_kitchen", "name": "Kitchen", "name_he": "מטבחים"},
        {"id": "cat_electrical", "name": "Electrical", "name_he": "חשמל"},
        {"id": "cat_plumbing", "name": "Plumbing", "name_he": "אינסטלציה"},
        {"id": "cat_renovations", "name": "Renovations", "name_he": "שיפוצים"},
    ]

    for cat in categories:
        await graph.execute(
            """
            MERGE (c:Category {id: $id})
            SET c.name = $name, c.name_he = $name_he
            """,
            cat,
        )
    logger.info("Created %d categories", len(categories))


async def main() -> None:
    """Run the full graph DB setup."""
    logger.info("Starting graph DB setup...")
    graph = GraphStore()

    try:
        await create_schema(graph)
        await seed_sample_data(graph)
        logger.info("Graph DB setup complete")
    finally:
        await graph.close()


if __name__ == "__main__":
    asyncio.run(main())
