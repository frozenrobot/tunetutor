import urllib.request
import gzip
import os
from lxml import etree
from .database import engine, get_db, Base
from .models import Vocabulary, Kanji

JMDICT_URL = "http://ftp.edrdg.org/pub/Nihongo/JMdict_e.gz"
KANJIDIC_URL = "http://www.edrdg.org/kanjidic/kanjidic2.xml.gz"

def download_and_extract(url, target_path):
    if not os.path.exists(target_path):
        print(f"Downloading {url}...")
        req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
        with urllib.request.urlopen(req) as response:
            with open(target_path + ".gz", "wb") as out_file:
                out_file.write(response.read())
        print(f"Extracting to {target_path}...")
        with gzip.open(target_path + ".gz", 'rb') as f_in:
            with open(target_path, 'wb') as f_out:
                f_out.write(f_in.read())
        os.remove(target_path + ".gz")

def ingest_kanjidic():
    db = next(get_db())
    if db.query(Kanji).first():
        print("Kanji table already populated. Skipping.")
        return
        
    kanji_path = "kanjidic2.xml"
    download_and_extract(KANJIDIC_URL, kanji_path)
    
    print("Ingesting KANJIDIC2...")
    context = etree.iterparse(kanji_path, events=('end',), tag='character')
    
    kanji_batch = []
    
    for event, elem in context:
        literal = elem.findtext('literal')
        meanings = []
        for rmgroup in elem.findall('.//rmgroup'):
            for meaning in rmgroup.findall('meaning'):
                if not meaning.get('m_lang'): # English meaning
                    meanings.append(meaning.text)
        
        radicals = []
        for radical in elem.findall('.//radical/rad_value'):
            if radical.get('rad_type') == 'classical':
                radicals.append(radical.text)

        if literal:
            kanji_batch.append(Kanji(
                character=literal,
                meaning=", ".join(meanings),
                radicals=", ".join(radicals)
            ))
            
        elem.clear() # free memory
        while elem.getprevious() is not None:
            del elem.getparent()[0]
            
        if len(kanji_batch) >= 2000:
            db.add_all(kanji_batch)
            db.commit()
            kanji_batch = []
            
    if kanji_batch:
        db.add_all(kanji_batch)
        db.commit()
    print("Finished ingesting KANJIDIC2.")

def ingest_jmdict():
    db = next(get_db())
    if db.query(Vocabulary).first():
        print("Vocabulary table already populated. Skipping.")
        return
        
    jmdict_path = "JMdict_e.xml"
    download_and_extract(JMDICT_URL, jmdict_path)
    
    print("Ingesting JMdict (this may take a minute)...")
    context = etree.iterparse(jmdict_path, events=('end',), tag='entry')
    batch = []
    i = 0
    for event, elem in context:
        keb = elem.findtext('.//keb')
        reb = elem.findtext('.//reb')
        glosses = [g.text for g in elem.findall('.//gloss') if g.text]
        pos = [p.text for p in elem.findall('.//pos') if p.text]
        
        dict_form = keb if keb else reb
        if dict_form:
            batch.append(Vocabulary(
                dictionary_form=dict_form,
                reading=reb if reb else "",
                meaning=", ".join(glosses[:5]), # first 5 meanings
                pos=", ".join(pos[:3]) if pos else ""
            ))
            i+=1
            
        elem.clear()
        while elem.getprevious() is not None:
            del elem.getparent()[0]
            
        if len(batch) >= 5000:
            db.add_all(batch)
            db.commit()
            batch = []
            print(f"Inserted {i} words...")
            
    if batch:
        db.add_all(batch)
        db.commit()
    print("Finished ingesting JMdict.")

if __name__ == "__main__":
    Base.metadata.create_all(bind=engine)
    ingest_kanjidic()
    ingest_jmdict()
