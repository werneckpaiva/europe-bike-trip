import os
import sqlite3
import json

class Database:
    def __init__(self, db_path):
        self.db_path = db_path
        self._init_db()

    def _get_connection(self):
        return sqlite3.connect(self.db_path)

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
            conn.commit()

    def get_config(self):
        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute('SELECT cities, selected_cities FROM config WHERE id = 1')
            row = cursor.fetchone()
            
            if row:
                cities = json.loads(row[0]) if row[0] else []
                selected_cities = json.loads(row[1]) if row[1] else []
                return {"cities": cities, "selected_cities": selected_cities}
            return None

    def save_config(self, cities_list, selected_cities_list):
        cities_json = json.dumps(cities_list)
        selected_cities_json = json.dumps(selected_cities_list)
        
        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute('SELECT id FROM config WHERE id = 1')
            if cursor.fetchone():
                cursor.execute('''
                    UPDATE config SET cities = ?, selected_cities = ? WHERE id = 1
                ''', (cities_json, selected_cities_json))
            else:
                cursor.execute('''
                    INSERT INTO config (id, cities, selected_cities) VALUES (1, ?, ?)
                ''', (cities_json, selected_cities_json))
            conn.commit()
