import fugashi
from typing import List, Dict
from sqlalchemy.orm import Session
from .models import Vocabulary, Kanji

# Instantiating the tagger once
try:
    tagger = fugashi.Tagger()
except Exception as e:
    print(f"Warning: Could not initialize fugashi tagger: {e}")
    tagger = None

def parse_lyrics(text: str, db: Session) -> List[Dict]:
    """
    Parses a block of Japanese text (e.g. song lyrics) into parsed dictionary words.
    Looks up meanings directly from the pre-ingested SQLite table.
    """
    if not tagger:
        return []
        
    lines = text.split("\n")
    parsed_lines = []
    
    # We load a small cache of vocabs to prevent 1000 SQL queries for a song
    # This queries the dictionary form.
    
    for line in lines:
        if not line.strip():
            parsed_lines.append([])
            continue
            
        words = tagger(line)
        line_tokens = []
        for word in words:
            surface = word.surface
            feature = word.feature
            dict_form = feature.lemma if feature.lemma else surface
            
            # Simple offline cache / fast query could be built here.
            # We query DB for the meaning.
            vocab = db.query(Vocabulary).filter(Vocabulary.dictionary_form == dict_form).first()
            
            # Identifying Kanji used in the surface string
            kanji_used = [char for char in surface if '\u4e00' <= char <= '\u9faf']
            kanji_info = []
            for k in kanji_used:
                k_row = db.query(Kanji).filter(Kanji.character == k).first()
                if k_row:
                    kanji_info.append({
                        "character": k_row.character,
                        "meaning": k_row.meaning,
                        "radicals": k_row.radicals
                    })
            
            # Robustly try to find reading/kana from feature
            # feature attributes are namedtuple-like; usually feature.kana or feature.reading
            kana = getattr(feature, 'kana', None) or getattr(feature, 'reading', None)
            
            # If still None, check if it's a list/tuple and grab common indices
            if kana is None and hasattr(feature, '__getitem__'):
                try: 
                    # For unipdic/ipadic, reading is often at index 7 or 8
                    if len(feature) > 7: kana = feature[7]
                except: pass

            line_tokens.append({
                "surface": surface,
                "dict_form": dict_form,
                "pos": getattr(feature, 'pos1', None),
                "kana": kana or (vocab.reading if vocab else ""),
                "meaning": vocab.meaning if vocab else None,
                "vocab_id": vocab.id if vocab else None,
                "kanji_list": kanji_info
            })
            
        parsed_lines.append(line_tokens)
        
    return parsed_lines
