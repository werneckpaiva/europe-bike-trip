import time
import json
import logging

logger = logging.getLogger(__name__)

def migrate_v1_flat_cities_to_days(db):
    """
    Migration Version 1:
    Converts the flat list of cities (where sleep markers are identified by `is_sleep=true`)
    into a hierarchical 'days' structure, where each day contains a list of cities and a night_type.
    """
    config = db.get_config()
    if not config or not config.get('cities'):
        logger.info("No config found or empty cities. Skipping migration.")
        return

    cities = config['cities']
    
    # Idempotency check: if the first element has 'cities' list, it is already migrated.
    if len(cities) > 0 and 'cities' in cities[0]:
        logger.info("Data already in hierarchical 'days' format. Skipping migration.")
        return
        
    logger.info("Migrating flat cities list to days hierarchy...")
    new_days = []
    current_cities = []
    day_index = 1
    
    for item in cities:
        if item.get('is_sleep'):
            new_days.append({
                'id': f'day_{int(time.time() * 1000)}_{day_index}',
                'collapsed': False,
                'cities': current_cities,
                'night_type': item.get('night_type', 'warmshowers')
            })
            day_index += 1
            current_cities = []
        else:
            current_cities.append({
                'name': item.get('name'),
                'transport': item.get('transport', 'bike')
            })
            
    if current_cities:
        new_days.append({
            'id': f'day_{int(time.time() * 1000)}_{day_index}',
            'collapsed': False,
            'cities': current_cities,
            'night_type': 'warmshowers'
        })
        
    db.save_config(new_days, config.get('selected_cities', []))
    logger.info("Migration v1 'flat_cities_to_days' applied successfully.")

# List of migrations to run in order.
# Each migration should be entirely idempotent and safe to run multiple times,
# but tracking allows skipping and standardizing upgrades.
MIGRATIONS_LIST = [
    {
        "version": 1,
        "name": "flat_cities_to_days",
        "func": migrate_v1_flat_cities_to_days
    }
]

def run_all_migrations(db):
    logger.info("Checking database migrations...")
    
    with db._get_connection() as conn:
        cursor = conn.cursor()
        
        # Ensure migrations table exists
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS migrations (
                version INTEGER PRIMARY KEY,
                name TEXT NOT NULL,
                applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        ''')
        
        # Get current version
        cursor.execute('SELECT MAX(version) FROM migrations')
        row = cursor.fetchone()
        current_version = row[0] if row and row[0] is not None else 0
        
        for migration in MIGRATIONS_LIST:
            v = migration['version']
            if current_version < v:
                logger.info(f"Applying migration v{v}: {migration['name']}")
                try:
                    migration['func'](db)
                    cursor.execute('''
                        INSERT INTO migrations (version, name) VALUES (?, ?)
                    ''', (v, migration['name']))
                    conn.commit()
                    logger.info(f"Successfully applied migration v{v}")
                except Exception as e:
                    logger.error(f"Migration v{v} failed: {e}")
                    raise
            else:
                logger.debug(f"Migration v{v} already applied.")

