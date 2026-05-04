import os
import sqlite3
import json

class Database:
    def __init__(self, db_path):
        self.db_path = db_path
        self._init_db()

    def _get_connection(self):
        conn = sqlite3.connect(self.db_path)
        conn.execute("PRAGMA foreign_keys = ON")
        return conn

    def _init_db(self):
        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute('''
                CREATE TABLE IF NOT EXISTS config (
                    id INTEGER PRIMARY KEY,
                    cities TEXT,
                    selected_cities TEXT
                )
            ''')
            cursor.execute('''
                CREATE TABLE IF NOT EXISTS projects (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    name TEXT NOT NULL,
                    description TEXT DEFAULT '',
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            ''')
            conn.commit()

    # ── Project methods ──────────────────────────────────────────

    def get_projects(self):
        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute('''
                SELECT id, name, description, created_at, updated_at
                FROM projects ORDER BY updated_at DESC
            ''')
            rows = cursor.fetchall()
            return [
                {
                    "id": r[0],
                    "name": r[1],
                    "description": r[2],
                    "created_at": r[3],
                    "updated_at": r[4]
                }
                for r in rows
            ]

    def create_project(self, name, description=''):
        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute('''
                INSERT INTO projects (name, description) VALUES (?, ?)
            ''', (name, description))
            conn.commit()
            project_id = cursor.lastrowid
            # Create initial empty config for project with one Day
            import time
            initial_days = [{
                "id": f"day_{int(time.time() * 1000)}",
                "collapsed": False,
                "cities": [],
                "night_type": "warmshowers"
            }]
            cursor.execute('''
                INSERT INTO config (id, cities, selected_cities)
                VALUES (?, ?, ?)
            ''', (project_id, json.dumps(initial_days), json.dumps([])))
            conn.commit()
            return project_id

    def update_project(self, project_id, name=None, description=None):
        with self._get_connection() as conn:
            cursor = conn.cursor()
            if name is not None:
                cursor.execute('''
                    UPDATE projects SET name = ?, updated_at = CURRENT_TIMESTAMP
                    WHERE id = ?
                ''', (name, project_id))
            if description is not None:
                cursor.execute('''
                    UPDATE projects SET description = ?, updated_at = CURRENT_TIMESTAMP
                    WHERE id = ?
                ''', (description, project_id))
            conn.commit()

    def delete_project(self, project_id):
        with self._get_connection() as conn:
            cursor = conn.cursor()
            # Delete config row for this project
            cursor.execute('DELETE FROM config WHERE id = ?', (project_id,))
            cursor.execute('DELETE FROM projects WHERE id = ?', (project_id,))
            conn.commit()

    def touch_project(self, project_id):
        """Update the updated_at timestamp for a project."""
        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute('''
                UPDATE projects SET updated_at = CURRENT_TIMESTAMP WHERE id = ?
            ''', (project_id,))
            conn.commit()

    # ── Config methods (project-scoped) ──────────────────────────

    def get_config(self, project_id=1):
        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute('SELECT cities, selected_cities FROM config WHERE id = ?', (project_id,))
            row = cursor.fetchone()
            
            if row:
                cities = json.loads(row[0]) if row[0] else []
                selected_cities = json.loads(row[1]) if row[1] else []
                return {"cities": cities, "selected_cities": selected_cities}
            return None

    def save_config(self, cities_list, selected_cities_list, project_id=1):
        cities_json = json.dumps(cities_list)
        selected_cities_json = json.dumps(selected_cities_list)
        
        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute('SELECT id FROM config WHERE id = ?', (project_id,))
            if cursor.fetchone():
                cursor.execute('''
                    UPDATE config SET cities = ?, selected_cities = ? WHERE id = ?
                ''', (cities_json, selected_cities_json, project_id))
            else:
                cursor.execute('''
                    INSERT INTO config (id, cities, selected_cities) VALUES (?, ?, ?)
                ''', (project_id, cities_json, selected_cities_json))
            conn.commit()
        
        # Update project timestamp
        self.touch_project(project_id)
