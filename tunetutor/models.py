from sqlalchemy import Boolean, Column, ForeignKey, Integer, String, DateTime, Float, Enum, Table
from sqlalchemy.orm import relationship
import enum
import datetime
from .database import Base

class WordStatus(str, enum.Enum):
    SEEN = "SEEN"
    LEARNED = "LEARNED"

class SongStatus(str, enum.Enum):
    IN_PROGRESS = "IN_PROGRESS"
    COMPLETED = "COMPLETED"

song_vocabulary = Table(
    "song_vocabulary",
    Base.metadata,
    Column("song_id", ForeignKey("songs.id"), primary_key=True),
    Column("vocabulary_id", ForeignKey("vocabulary.id"), primary_key=True),
    Column("surface", String), # The form seen in this specific song
)

class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String, unique=True, index=True)
    email = Column(String, unique=True, index=True)
    hashed_password = Column(String)
    
    # Auth Enhancement Fields
    is_verified = Column(Boolean, default=False)
    verification_token = Column(String, nullable=True)
    pending_email = Column(String, nullable=True) # For email update verification
    reset_token = Column(String, nullable=True)
    reset_token_expires = Column(DateTime, nullable=True)
    
    word_states = relationship("UserWordState", back_populates="user")
    kanji_states = relationship("UserKanjiState", back_populates="user")
    song_progress = relationship("UserSongProgress", back_populates="user")
    saved_chats = relationship("SavedChat", back_populates="user")

class Song(Base):
    __tablename__ = "songs"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String, index=True)
    artist = Column(String, index=True)
    youtube_url = Column(String, nullable=True)
    raw_lyrics = Column(String)
    english_lyrics = Column(String, nullable=True)
    parsed_lyrics_cache = Column(String, nullable=True) # JSON blob
    lyrics_metadata = Column(String, nullable=True) # JSON blob for timestamps

    progress = relationship("UserSongProgress", back_populates="song")
    vocabulary = relationship("Vocabulary", secondary=song_vocabulary, back_populates="songs")
    saved_chats = relationship("SavedChat", back_populates="song")

class Vocabulary(Base):
    __tablename__ = "vocabulary"

    id = Column(Integer, primary_key=True, index=True)
    dictionary_form = Column(String, index=True)
    reading = Column(String)
    meaning = Column(String)
    pos = Column(String) # Part of speech

    user_states = relationship("UserWordState", back_populates="word")
    songs = relationship("Song", secondary=song_vocabulary, back_populates="vocabulary")

class Kanji(Base):
    __tablename__ = "kanji"

    id = Column(Integer, primary_key=True, index=True)
    character = Column(String, unique=True, index=True)
    meaning = Column(String)
    radicals = Column(String, nullable=True)

    user_states = relationship("UserKanjiState", back_populates="kanji")

class UserWordState(Base):
    __tablename__ = "user_word_states"

    user_id = Column(Integer, ForeignKey("users.id"), primary_key=True)
    word_id = Column(Integer, ForeignKey("vocabulary.id"), primary_key=True)
    status = Column(Enum(WordStatus), default=WordStatus.SEEN)
    
    # Spaced Repetition fields
    last_reviewed = Column(DateTime, default=datetime.datetime.utcnow)
    next_review = Column(DateTime, default=datetime.datetime.utcnow)
    interval = Column(Float, default=0.0) # In days
    ease_factor = Column(Float, default=2.5)
    
    user = relationship("User", back_populates="word_states")
    word = relationship("Vocabulary", back_populates="user_states")

class UserKanjiState(Base):
    __tablename__ = "user_kanji_states"

    user_id = Column(Integer, ForeignKey("users.id"), primary_key=True)
    kanji_id = Column(Integer, ForeignKey("kanji.id"), primary_key=True)
    status = Column(Enum(WordStatus), default=WordStatus.SEEN)

    user = relationship("User", back_populates="kanji_states")
    kanji = relationship("Kanji", back_populates="user_states")

class UserSongProgress(Base):
    __tablename__ = "user_song_progress"

    user_id = Column(Integer, ForeignKey("users.id"), primary_key=True)
    song_id = Column(Integer, ForeignKey("songs.id"), primary_key=True)
    status = Column(Enum(SongStatus), default=SongStatus.IN_PROGRESS)
    seen_lines = Column(String, default="[]") # JSON list of line indices

    user = relationship("User", back_populates="song_progress")
    song = relationship("Song", back_populates="progress")

class SavedChat(Base):
    __tablename__ = "saved_chats"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"))
    song_id = Column(Integer, ForeignKey("songs.id"), nullable=True)
    song_title = Column(String, nullable=True) # Cache the title in case song is removed
    line_text = Column(String)
    chat_history = Column(String) # JSON blob representing the interaction history
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    user = relationship("User", back_populates="saved_chats")
    song = relationship("Song", back_populates="saved_chats")
