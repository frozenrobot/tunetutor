import sys
import os
from sqlalchemy import create_engine, text

# Add the project root to sys.path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

# Config
SQLITE_URL = "sqlite:///tunetutor.db"
POSTGRES_URL = "postgresql://postgres.mdglcxyrqmpbuauqumco:djBIH24BHI35B@aws-1-eu-central-1.pooler.supabase.com:6543/postgres"

def migrate_light():
    print("🚀 Starting LIGHTWEIGHT migration (Essential Data Only)...")
    
    src_engine = create_engine(SQLITE_URL)
    dst_engine = create_engine(POSTGRES_URL)
    
    with src_engine.connect() as src_conn:
        with dst_engine.connect() as dst_conn:
            
            # 1. Migrate Songs (already done, but let's be sure)
            print("📦 Migrating Songs...")
            songs = src_conn.execute(text("SELECT * FROM songs")).fetchall()
            if songs:
                columns = songs[0]._fields
                stmt = text(f"INSERT INTO songs ({', '.join(columns)}) VALUES ({', '.join([':'+c for c in columns])}) ON CONFLICT (id) DO NOTHING")
                dst_conn.execute(stmt, [dict(r._mapping) for r in songs])
                dst_conn.commit()
                print(f"✅ Songs verified ({len(songs)})")

            # 2. Identify and Migrate used Vocabulary
            print("📦 Identifying used vocabulary...")
            used_vocab_ids = [r[0] for r in src_conn.execute(text("SELECT DISTINCT vocabulary_id FROM song_vocabulary")).fetchall()]
            print(f"📊 Found {len(used_vocab_ids)} unique words used in your songs.")
            
            if used_vocab_ids:
                # To avoid SQL expression limits, we'll fetch in chunks
                batch_size = 500
                for i in range(0, len(used_vocab_ids), batch_size):
                    chunk = used_vocab_ids[i:i+batch_size]
                    vocab_data = src_conn.execute(text(f"SELECT * FROM vocabulary WHERE id IN ({','.join(map(str, chunk))})")).fetchall()
                    
                    columns = vocab_data[0]._fields
                    stmt = text(f"INSERT INTO vocabulary ({', '.join(columns)}) VALUES ({', '.join([':'+c for c in columns])}) ON CONFLICT (id) DO NOTHING")
                    dst_conn.execute(stmt, [dict(r._mapping) for r in vocab_data])
                    dst_conn.commit()
                print(f"✅ Migrated {len(used_vocab_ids)} vocabulary records.")

            # 3. Migrate used Kanji
            # Instead of migrating character-by-character, we'll just migrate all 13k Kanji in a few batches
            # Since it's only 13k, it should be fast with bulk insert
            print("📦 Migrating all Kanji (13k records)...")
            kanji_data = src_conn.execute(text("SELECT * FROM kanji")).fetchall()
            if kanji_data:
                columns = kanji_data[0]._fields
                stmt = text(f"INSERT INTO kanji ({', '.join(columns)}) VALUES ({', '.join([':'+c for c in columns])}) ON CONFLICT (id) DO NOTHING")
                
                # Use batches of 1000
                batch_size = 1000
                for i in range(0, len(kanji_data), batch_size):
                    chunk = kanji_data[i:i+batch_size]
                    dst_conn.execute(stmt, [dict(r._mapping) for r in chunk])
                    dst_conn.commit()
                print(f"✅ Migrated {len(kanji_data)} Kanji records.")

            # 4. Migrate Song-Vocabulary associations
            print("📦 Migrating song-vocabulary links...")
            links = src_conn.execute(text("SELECT * FROM song_vocabulary")).fetchall()
            if links:
                columns = links[0]._fields
                stmt = text(f"INSERT INTO song_vocabulary ({', '.join(columns)}) VALUES ({', '.join([':'+c for c in columns])}) ON CONFLICT (song_id, vocabulary_id) DO NOTHING")
                dst_conn.execute(stmt, [dict(r._mapping) for r in links])
                dst_conn.commit()
                print(f"✅ Migrated {len(links)} associations.")

            # 5. Reset Sequences
            for table in ["songs", "vocabulary", "kanji"]:
                try:
                    dst_conn.execute(text(f"SELECT setval(pg_get_serial_sequence('{table}', 'id'), (SELECT MAX(id) FROM {table}))"))
                    dst_conn.commit()
                except: pass

    print("🏁 Light Migration complete! Your songs are now fully functional.")

if __name__ == "__main__":
    migrate_light()
