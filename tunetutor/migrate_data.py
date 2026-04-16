import sys
import os
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker

# Add the project root to sys.path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

# Config
SQLITE_URL = "sqlite:///tunetutor.db"
POSTGRES_URL = "postgresql://postgres.mdglcxyrqmpbuauqumco:djBIH24BHI35B@aws-1-eu-central-1.pooler.supabase.com:6543/postgres"

BATCH_SIZE = 1000 # Reduced batch size for better stability

def migrate():
    print("🚀 Starting OPTIMIZED migration from SQLite to Supabase...")
    
    src_engine = create_engine(SQLITE_URL)
    dst_engine = create_engine(POSTGRES_URL)
    
    tables = [
        "kanji",
        "vocabulary",
        "songs",
        "song_vocabulary"
    ]
    
    with src_engine.connect() as src_conn:
        with dst_engine.connect() as dst_conn:
            for table in tables:
                print(f"📦 Processing {table}...")
                
                # Fetch count
                total_count = src_conn.execute(text(f"SELECT count(*) FROM {table}")).scalar()
                print(f"📊 Found {total_count} records to migrate.")
                
                if total_count == 0:
                    continue
                
                # Fetch columns
                # We do a limit 1 to just get the headers
                sample = src_conn.execute(text(f"SELECT * FROM {table} LIMIT 1")).fetchone()
                columns = sample._fields
                cols_str = ", ".join(columns)
                placeholders = ", ".join([f":{col}" for col in columns])
                
                if table == "song_vocabulary":
                    upsert_clause = "ON CONFLICT (song_id, vocabulary_id) DO NOTHING"
                else:
                    upsert_clause = "ON CONFLICT (id) DO NOTHING"
                
                stmt = text(f"INSERT INTO {table} ({cols_str}) VALUES ({placeholders}) {upsert_clause}")
                
                # Migrate in batches
                offset = 0
                while offset < total_count:
                    # Fetch batch from source
                    batch_data = src_conn.execute(text(f"SELECT * FROM {table} LIMIT {BATCH_SIZE} OFFSET {offset}")).fetchall()
                    
                    # Convert to list of dicts
                    batch_dicts = [dict(row._mapping) for row in batch_data]
                    
                    # Bulk insert
                    dst_conn.execute(stmt, batch_dicts)
                    dst_conn.commit()
                    
                    offset += BATCH_SIZE
                    progress = min(offset, total_count)
                    print(f"✅ MIGRATED {progress:,} / {total_count:,} records from {table}")

                # Adjust sequence
                if table != "song_vocabulary":
                    try:
                        dst_conn.execute(text(f"SELECT setval(pg_get_serial_sequence('{table}', 'id'), (SELECT MAX(id) FROM {table}))"))
                        dst_conn.commit()
                    except Exception as e:
                        print(f"⚠️ Could not reset sequence for {table}: {e}")

    print("🏁 High-speed Migration complete!")

if __name__ == "__main__":
    migrate()
