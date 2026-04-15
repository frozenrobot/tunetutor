import sqlite3
import json
import os

db_path = 'tunetutor.db'
if os.path.exists(db_path):
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    try:
        cursor.execute("ALTER TABLE user_song_progress ADD COLUMN seen_lines TEXT DEFAULT '[]'")
        print("Added seen_lines column successfully.")
    except sqlite3.OperationalError as e:
        if "duplicate column name" in str(e).lower():
            print("Column seen_lines already exists.")
        else:
            print(f"Error: {e}")
    conn.commit()
    conn.close()
else:
    print("Database file not found.")
