import os
from backend.database import Database
from backend.migrations import run_all_migrations

def main():
    BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    DB_PATH = os.environ.get("DB_PATH", os.path.join(BASE_DIR, "pedal.db"))
    
    print(f"Running migrations on {DB_PATH}...")
    db = Database(DB_PATH)
    run_all_migrations(db)
    print("Migrations complete.")

if __name__ == "__main__":
    main()
