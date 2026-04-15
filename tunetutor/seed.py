import csv
import urllib.request
import urllib.parse
import re
import os
import time

from sqlalchemy.orm import Session
from .database import engine, get_db, Base
from .models import Song

# Create tables
Base.metadata.create_all(bind=engine)

def search_youtube(query: str) -> str:
    """Very rudimentary youtube search scraper"""
    search_query = urllib.parse.quote(query)
    url = f"https://www.youtube.com/results?search_query={search_query}"
    try:
        req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
        html = urllib.request.urlopen(req).read().decode('utf-8')
        video_ids = re.findall(r"watch\?v=(\S{11})", html)
        if video_ids:
            return f"https://www.youtube.com/watch?v={video_ids[0]}"
    except Exception as e:
        print(f"Failed to fetch youtube url for {query}: {e}")
    return ""

def seed_db():
    csv_path = "/Users/khanakgulati/.gemini/antigravity/brain/f9cece7d-2037-4e35-bb6e-b375fc85c165/.system_generated/steps/34/content.md"
    if not os.path.exists(csv_path):
        print(f"CSV not found at {csv_path}")
        return

    # To avoid parsing the frontmatter in the file, we skip until the CSV header
    with open(csv_path, "r", encoding="utf-8") as f:
        lines = f.readlines()
    
    start_idx = 0
    for i, line in enumerate(lines):
        if line.startswith("Date,Song name"):
            start_idx = i
            break
            
    csv_lines = lines[start_idx:]
    reader = csv.reader(csv_lines)
    next(reader) # skip header

    db = next(get_db())
    
    inserted = 0
    for row in reader:
        if len(row) < 4:
            continue
        date, song_name, spotify_link, lyrics = row[0], row[1], row[2], row[3]
        
        # Check if exists
        exists = db.query(Song).filter(Song.title == song_name).first()
        if not exists:
            print(f"Adding {song_name}...")
            yt_url = search_youtube(f"{song_name} Japanese Song")
            song = Song(
                title=song_name,
                artist="Unknown Artist", # We could improve this by scraping Spotify link
                youtube_url=yt_url,
                raw_lyrics=lyrics
            )
            db.add(song)
            db.commit()
            inserted += 1
            time.sleep(1) # avoid rate limit a bit
            
    print(f"Seeded {inserted} songs successfully.")

if __name__ == "__main__":
    seed_db()
