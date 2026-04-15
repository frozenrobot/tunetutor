import sqlite3

updates = [
    (1, "RADWIMPS"),
    (2, "RADWIMPS"),
    (3, "RADWIMPS"),
    (4, "RADWIMPS"),
    (5, "RADWIMPS"),
    (6, "RADWIMPS"),
    (7, "Masaki Suda"),
    (8, "Lia"),
    (9, "Kenshi Yonezu"),
    (10, "TK from Ling Tosite Sigure"),
    (11, "FLOW"),
    (12, "LiSA"),
    (13, "Nightmare"),
    (14, "RADWIMPS"),
    (15, "RADWIMPS"),
    (16, "Chata"),
    (17, "Masaki Suda"),
    (18, "RADWIMPS"),
    (19, "Fujii Kaze"),
    (20, "RADWIMPS"),
    (21, "RADWIMPS"),
    (22, "RADWIMPS"),
    (23, "RADWIMPS"),
    (24, "Masayoshi Yamazaki"),
    (25, "LiSA"),
    (26, "Motohiro Hata"),
    (27, "wacci"),
    (28, "Goose house"),
    (29, "Coalamode"),
    (30, "LiSA"),
    (31, "SPYAIR"),
    (32, "Teshima Aoi"),
    (33, "milet"),
    (34, "YOASOBI"),
    (35, "milet"),
    (36, "RADWIMPS"),
    (37, "Yumi Kimura"),
    (38, "7!!"),
    (39, "Aoi Tada"),
    (40, "KANA-BOON"),
    (41, "Masaki Suda"),
    (42, "RADWIMPS"),
    (43, "RADWIMPS"),
    (44, "RADWIMPS"),
    (45, "RADWIMPS"),
    (46, "RADWIMPS"),
    (47, "Motohiro Hata"),
    (48, "Uchikubi Gokumon Doukoukai"),
    (49, "RADWIMPS"),
    (50, "RADWIMPS"),
    (51, "Kenshi Yonezu & Masaki Suda"),
    (52, "Kenshi Yonezu & Masaki Suda"),
    (53, "Yorushika")
]

db_path = 'tunetutor.db'
conn = sqlite3.connect(db_path)
cursor = conn.cursor()

for s_id, artist in updates:
    cursor.execute("UPDATE songs SET artist = ? WHERE id = ?", (artist, s_id))

conn.commit()
conn.close()
print(f"Updated {len(updates)} songs with artist information.")
