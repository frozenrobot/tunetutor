from fastapi import FastAPI, Depends, HTTPException, status, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import List, Optional
import json
import secrets
from datetime import datetime, timedelta

from .database import engine, Base, get_db
from .models import User, Song, Vocabulary, Kanji, UserWordState, UserKanjiState, UserSongProgress, SongStatus, WordStatus, song_vocabulary, SavedChat
from .auth import verify_password, get_password_hash, create_access_token, get_current_user
from .nlp import parse_lyrics
from .ai import generate_chat_explanation, translate_lyrics_block
from .email_utils import send_verification_email, send_reset_password_email, send_email_change_verification

Base.metadata.create_all(bind=engine)

app = FastAPI(title="Lyvo API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- Pydantic Schemas ---
class Token(BaseModel):
    access_token: str
    token_type: str

class UserCreate(BaseModel):
    username: str
    email: str
    password: str

class UserResponse(BaseModel):
    id: int
    username: str
    email: str
    is_verified: bool
    class Config:
        from_attributes = True

class ForgotPasswordRequest(BaseModel):
    email: str

class ResetPasswordRequest(BaseModel):
    token: str
    new_password: str

class UserUpdate(BaseModel):
    username: Optional[str] = None
    email: Optional[str] = None

class PasswordChange(BaseModel):
    current_password: str
    new_password: str

@app.get("/")
def read_root():
    return {"message": "Backend API is running. Please access the Lyvo React UI at http://localhost:5173"}

# --- Auth Endpoints ---

@app.post("/api/auth/register", response_model=UserResponse)
def register(user: UserCreate, background_tasks: BackgroundTasks, db: Session = Depends(get_db)):
    db_user = db.query(User).filter((User.username == user.username) | (User.email == user.email)).first()
    if db_user:
        raise HTTPException(status_code=400, detail="Username or Email already registered")
    
    hashed_password = get_password_hash(user.password)
    verification_token = secrets.token_urlsafe(32)
    
    new_user = User(
        username=user.username, 
        email=user.email, 
        hashed_password=hashed_password,
        is_verified=False,
        verification_token=verification_token
    )
    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    
    # Send verification email in background
    background_tasks.add_task(send_verification_email, new_user.email, verification_token)
    
    return new_user

@app.get("/api/auth/verify")
def verify_email(verify_token: str, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.verification_token == verify_token, User.pending_email == None).first()
    if not user:
        raise HTTPException(status_code=400, detail="Invalid or expired verification token")
    
    user.is_verified = True
    user.verification_token = None
    db.commit()
    return {"message": "Email verified successfully"}

@app.get("/api/auth/verify-email-change")
def verify_email_change(verify_token: str, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.verification_token == verify_token, User.pending_email != None).first()
    if not user:
        raise HTTPException(status_code=400, detail="Invalid or expired verification token")
    
    # Check if someone else took the email in the meantime
    existing = db.query(User).filter(User.email == user.pending_email).first()
    if existing:
         user.pending_email = None
         user.verification_token = None
         db.commit()
         raise HTTPException(status_code=400, detail="Requested email is now taken by another account")

    user.email = user.pending_email
    user.pending_email = None
    user.verification_token = None
    db.commit()
    return {"message": "Email updated successfully"}

@app.post("/api/auth/login", response_model=Token)
def login(form_data: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    from sqlalchemy import or_
    user = db.query(User).filter(or_(User.username == form_data.username, User.email == form_data.username)).first()
    if not user or not verify_password(form_data.password, user.hashed_password):
        raise HTTPException(status_code=400, detail="Incorrect username or email or password")
    
    if not user.is_verified:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Please verify your email address before logging in.")
    
    access_token = create_access_token(data={"sub": user.username})
    return {"access_token": access_token, "token_type": "bearer"}

@app.post("/api/auth/forgot-password")
def forgot_password(request: ForgotPasswordRequest, background_tasks: BackgroundTasks, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == request.email).first()
    if not user:
        # Don't reveal account existência
        return {"message": "If an account exists with that email, a reset link has been sent."}
    
    reset_token = secrets.token_urlsafe(32)
    user.reset_token = reset_token
    user.reset_token_expires = datetime.utcnow() + timedelta(hours=1)
    db.commit()
    
    background_tasks.add_task(send_reset_password_email, user.email, reset_token)
    return {"message": "If an account exists with that email, a reset link has been sent."}

@app.post("/api/auth/reset-password")
def reset_password(request: ResetPasswordRequest, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.reset_token == request.token).first()
    if not user or not user.reset_token_expires or user.reset_token_expires < datetime.utcnow():
        raise HTTPException(status_code=400, detail="Invalid or expired reset token")
    
    user.hashed_password = get_password_hash(request.new_password)
    user.reset_token = None
    user.reset_token_expires = None
    db.commit()
    return {"message": "Password reset successfully"}

@app.get("/api/user/me", response_model=UserResponse)
def get_me(current_user: User = Depends(get_current_user)):
    return current_user

@app.put("/api/user/me", response_model=UserResponse)
def update_user(req: UserUpdate, background_tasks: BackgroundTasks, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    msg = "Profile updated successfully"
    if req.username:
        # Check if username taken
        existing = db.query(User).filter(User.username == req.username, User.id != current_user.id).first()
        if existing:
            raise HTTPException(status_code=400, detail="Username already taken")
        current_user.username = req.username
    
    if req.email and req.email != current_user.email:
        # Check if email taken
        existing = db.query(User).filter(User.email == req.email, User.id != current_user.id).first()
        if existing:
            raise HTTPException(status_code=400, detail="Email already taken")
        
        # Don't apply immediately. Send verification.
        token = secrets.token_urlsafe(32)
        current_user.verification_token = token
        current_user.pending_email = req.email
        background_tasks.add_task(send_email_change_verification, req.email, token)
        msg = "Profile updated. Please check your new email to verify the address change."
        
    db.commit()
    db.refresh(current_user)
    # Return a special header or detail if email is pending
    return current_user

@app.patch("/api/user/password")
def change_password(req: PasswordChange, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    if not verify_password(req.current_password, current_user.hashed_password):
        raise HTTPException(status_code=400, detail="Incorrect current password")
    
    current_user.hashed_password = get_password_hash(req.new_password)
    db.commit()
    return {"message": "Password updated successfully"}

@app.delete("/api/user/me")
def delete_account(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    # Manually delete dependent records to be safe before nuking user
    db.query(UserWordState).filter_by(user_id=current_user.id).delete()
    db.query(UserKanjiState).filter_by(user_id=current_user.id).delete()
    db.query(UserSongProgress).filter_by(user_id=current_user.id).delete()
    db.query(SavedChat).filter_by(user_id=current_user.id).delete()
    db.delete(current_user)
    db.commit()
    return {"message": "Account deleted successfully"}

# --- Song & Processing Endpoints ---

@app.get("/api/songs")
def get_songs(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    """
    Returns all songs in the system. For the current user, it includes 
    their progress (status) and engagement (seen lines vs total lines).
    """
    songs = db.query(Song).all()
    result = []
    for s in songs:
        prog = db.query(UserSongProgress).filter_by(user_id=current_user.id, song_id=s.id).first()
        
        status_val = None
        seen_count = 0
        total_lines = 0
        
        if prog:
            status_val = prog.status.value
            try:
                seen_list = json.loads(prog.seen_lines) if prog.seen_lines else []
                seen_count = len(seen_list)
            except:
                seen_count = 0
        
        # Calculate total lines from cache
        if s.parsed_lyrics_cache:
            try:
                parsed = json.loads(s.parsed_lyrics_cache)
                total_lines = len(parsed)
            except:
                total_lines = 0
                
        result.append({
            "id": s.id,
            "title": s.title,
            "artist": s.artist,
            "youtube_url": s.youtube_url,
            "status": status_val,
            "seen_count": seen_count,
            "total_lines": total_lines
        })
    return result

@app.get("/api/songs/{song_id}/process")
def process_song(song_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    """
    Parses song lyrics and registers 'SEEN' words implicitly if they are new.
    """
    song = db.query(Song).filter(Song.id == song_id).first()
    if not song:
        raise HTTPException(status_code=404, detail="Song not found")

    # Translate full lyrics via AI if not already cached
    if not song.english_lyrics:
        translated = translate_lyrics_block(song.raw_lyrics)
        if translated:
            song.english_lyrics = "\n".join(translated)
            db.commit()

    english_lines = song.english_lyrics.split("\n") if song.english_lyrics else []

    # Check cache first
    if song.parsed_lyrics_cache:
        line_tokens = json.loads(song.parsed_lyrics_cache)
    else:
        line_tokens = parse_lyrics(song.raw_lyrics, db)
        song.parsed_lyrics_cache = json.dumps(line_tokens)
        db.commit()

    # Mark song as IN_PROGRESS if not already tracked
    prog = db.query(UserSongProgress).filter_by(user_id=current_user.id, song_id=song_id).first()

    # Link vocabulary if this is a NEW song for this user (but don't mark as SEEN yet)
    if not prog:
        # Link vocabulary to this song for the browse/stats pages
        for line in line_tokens:
            for t in line:
                if t.get("vocab_id"):
                    db.execute(
                        song_vocabulary.insert().prefix_with("OR IGNORE").values(
                            song_id=song_id, 
                            vocabulary_id=t["vocab_id"],
                            surface=t["surface"]
                        )
                    )
        
        prog = UserSongProgress(user_id=current_user.id, song_id=song_id, status=SongStatus.IN_PROGRESS)
        db.add(prog)
        db.commit()
    
    return {
        "song_id": song.id,
        "title": song.title,
        "youtube_url": song.youtube_url,
        "parsed_lyrics": line_tokens,
        "english_lines": english_lines,
        "lyrics_metadata": json.loads(song.lyrics_metadata) if song.lyrics_metadata else [],
        "seen_lines": json.loads(prog.seen_lines) if prog.seen_lines else []
    }

@app.delete("/api/songs/{song_id}/library")
def remove_from_library(song_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    """
    Removes a song from the user's library and cleans up orphaned vocabulary progress.
    """
    # 1. Remove song progress
    prog = db.query(UserSongProgress).filter_by(user_id=current_user.id, song_id=song_id).first()
    if not prog:
        raise HTTPException(status_code=404, detail="Song not in library")

    # 2. Find words targeted for cleanup
    # Get all vocab in the song being removed
    target_vocab_ids = set(v.id for v in db.query(Vocabulary).join(song_vocabulary).filter(song_vocabulary.c.song_id == song_id).all())
    
    # Get all vocab in ALL OTHER library songs
    other_library_song_ids = [p.song_id for p in db.query(UserSongProgress).filter(
        UserSongProgress.user_id == current_user.id,
        UserSongProgress.song_id != song_id
    ).all()]
    
    preserved_vocab_ids = set()
    if other_library_song_ids:
        preserved_vocab_ids = set(v.id for v in db.query(Vocabulary).join(song_vocabulary).filter(
            song_vocabulary.c.song_id.in_(other_library_song_ids)
        ).all())
    
    orphaned_vocab_ids = target_vocab_ids - preserved_vocab_ids
    
    # 3. Clean up orphaned word states
    if orphaned_vocab_ids:
        # Delete word states
        db.query(UserWordState).filter(
            UserWordState.user_id == current_user.id,
            UserWordState.word_id.in_(list(orphaned_vocab_ids))
        ).delete(synchronize_session=False)
        
        # Clean up kanji - similar logic but harder since Kanji aren't directly in song_vocabulary
        # For simplicity, we mostly care about the word deck. 
        # But we can find kanji that are only in these orphaned words.
    
    # 4. Finalize removal
    db.delete(prog)
    db.commit()
    
    return {"status": "success", "removed_song_id": song_id, "cleaned_up_words": len(orphaned_vocab_ids)}

@app.post("/api/songs/{song_id}/acknowledge_line/{line_idx}")
def acknowledge_line(song_id: int, line_idx: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    """
    Marks a specific line as seen and registers the vocabulary within it as 'SEEN'.
    """
    prog = db.query(UserSongProgress).filter_by(user_id=current_user.id, song_id=song_id).first()
    if not prog:
        raise HTTPException(status_code=404, detail="Song progress not found. Process the song first.")

    seen_lines = json.loads(prog.seen_lines) if prog.seen_lines else []
    if line_idx not in seen_lines:
        seen_lines.append(line_idx)
        prog.seen_lines = json.dumps(seen_lines)
        
        # Now mark words in this line as SEEN
        song = db.query(Song).filter(Song.id == song_id).first()
        if song and song.parsed_lyrics_cache:
            parsed = json.loads(song.parsed_lyrics_cache)
            if line_idx < len(parsed):
                line_tokens = parsed[line_idx]
                for t in line_tokens:
                    # Mark Vocab
                    if t.get("vocab_id"):
                        v_id = t["vocab_id"]
                        existing = db.query(UserWordState).filter_by(user_id=current_user.id, word_id=v_id).first()
                        if not existing:
                            db.add(UserWordState(user_id=current_user.id, word_id=v_id, status=WordStatus.SEEN))
                    
                    # Mark Kanji
                    for k in t.get("kanji_list", []):
                        k_db = db.query(Kanji).filter(Kanji.character == k["character"]).first()
                        if k_db:
                            ex_k = db.query(UserKanjiState).filter_by(user_id=current_user.id, kanji_id=k_db.id).first()
                            if not ex_k:
                                db.add(UserKanjiState(user_id=current_user.id, kanji_id=k_db.id, status=WordStatus.SEEN))
        
        db.commit()

    return {"seen_lines": seen_lines}

# --- Stats & AI Endpoints ---

@app.get("/api/stats")
def get_user_stats(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    """
    Returns user vocabulary statistics broken down by learning stage.
    """
    # 1. Seen: Words encountered but not yet reviewed (interval is 0)
    seen = db.query(UserWordState).filter(
        UserWordState.user_id == current_user.id,
        UserWordState.interval == 0.0
    ).count()
    
    # 2. Learning: Words actively in the SRS system (interval > 0 and < 21)
    learning = db.query(UserWordState).filter(
        UserWordState.user_id == current_user.id,
        UserWordState.interval > 0.0,
        UserWordState.interval < 21.0
    ).count()
    
    # 3. Mastered: Words that have reached the 21-day interval threshold
    mastered = db.query(UserWordState).filter(
        UserWordState.user_id == current_user.id,
        UserWordState.interval >= 21.0
    ).count()
    
    return {
        "seen": seen,
        "learning": learning,
        "mastered": mastered,
        "mastery_threshold_days": 21
    }

class ChatMessage(BaseModel):
    role: str
    content: str

class ChatRequest(BaseModel):
    line_context: str
    history: List[ChatMessage]

@app.post("/api/ai/chat")
def get_ai_chat(req: ChatRequest, current_user: User = Depends(get_current_user)):
    history_dicts = [{"role": msg.role, "content": msg.content} for msg in req.history]
    
    explanation = generate_chat_explanation(history_dicts, req.line_context)
    return {"explanation": explanation}

class SaveChatRequest(BaseModel):
    song_id: Optional[int] = None
    song_title: Optional[str] = None
    line_text: str
    history: List[ChatMessage]

@app.post("/api/ai/saved_chats")
def save_chat(req: SaveChatRequest, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    chat = SavedChat(
        user_id=current_user.id,
        song_id=req.song_id,
        song_title=req.song_title,
        line_text=req.line_text,
        chat_history=json.dumps([{"role": m.role, "content": m.content} for m in req.history])
    )
    db.add(chat)
    db.commit()
    db.refresh(chat)
    return {"message": "Chat saved successfully", "id": chat.id}

@app.get("/api/ai/saved_chats")
def get_saved_chats(song_id: Optional[int] = None, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    query = db.query(SavedChat).filter(SavedChat.user_id == current_user.id)
    if song_id is not None:
        query = query.filter(SavedChat.song_id == song_id)
    chats = query.order_by(SavedChat.created_at.desc()).all()
    result = []
    for c in chats:
        result.append({
            "id": c.id,
            "song_id": c.song_id,
            "song_title": c.song_title,
            "line_text": c.line_text,
            "chat_history": json.loads(c.chat_history),
            "created_at": c.created_at
        })
    return result

@app.put("/api/ai/saved_chats/{chat_id}")
def update_saved_chat(chat_id: int, req: SaveChatRequest, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    chat = db.query(SavedChat).filter(SavedChat.id == chat_id, SavedChat.user_id == current_user.id).first()
    if not chat:
        raise HTTPException(status_code=404, detail="Chat not found")
    
    chat.chat_history = json.dumps([{"role": m.role, "content": m.content} for m in req.history])
    db.commit()
    return {"message": "Chat updated successfully"}

@app.delete("/api/ai/saved_chats/{chat_id}")
def delete_saved_chat(chat_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    chat = db.query(SavedChat).filter(SavedChat.id == chat_id, SavedChat.user_id == current_user.id).first()
    if not chat:
        raise HTTPException(status_code=404, detail="Chat not found")
    db.delete(chat)
    db.commit()
    return {"message": "Chat deleted successfully"}

# --- Flashcard / SRS Endpoints ---

@app.get("/api/flashcards/due")
def get_due_flashcards(
    song_ids: Optional[str] = None, 
    limit: int = 20,
    include_seen: bool = True,
    include_learned: bool = True,
    db: Session = Depends(get_db), 
    current_user: User = Depends(get_current_user)
):
    """
    Returns vocabulary words due for review with enhanced filtering.
    """
    import datetime
    now = datetime.datetime.utcnow()
    
    # Base query for user's words
    query = db.query(UserWordState).filter(UserWordState.user_id == current_user.id)
    
    # Filter by Status
    status_filters = []
    if include_seen: status_filters.append(WordStatus.SEEN)
    if include_learned: status_filters.append(WordStatus.LEARNED)
    
    if not status_filters:
        return {"cards": [], "total": 0}
    
    query = query.filter(UserWordState.status.in_(status_filters))

    if song_ids:
        try:
            id_list = [int(sid.strip()) for sid in song_ids.split(",") if sid.strip()]
            if id_list:
                # Join with song_vocabulary to find words in selected songs
                query = query.join(Vocabulary).join(
                    song_vocabulary, Vocabulary.id == song_vocabulary.c.vocabulary_id
                ).filter(song_vocabulary.c.song_id.in_(id_list))
        except ValueError:
            pass # Ignore malformed IDs

    # SRS Logic: Prioritize due words
    due_states = query.filter(UserWordState.next_review <= now).limit(limit).all()
    
    # If fewer than limit, include SEEN words that haven't been reviewed or aren't due yet
    if len(due_states) < limit:
        remaining = limit - len(due_states)
        due_ids = [s.word_id for s in due_states]
        
        # Fallback to all filtered words NOT in the due list
        extra = query.filter(
            ~UserWordState.word_id.in_(due_ids) if due_ids else True
        ).limit(remaining).all()
        due_states.extend(extra)
    
    cards = []
    for state in due_states:
        vocab = db.query(Vocabulary).filter(Vocabulary.id == state.word_id).first()
        if not vocab:
            continue
        
        # Get kanji info for this word
        kanji_chars = [ch for ch in (vocab.dictionary_form or '') if '\u4e00' <= ch <= '\u9faf']
        kanji_info = []
        for k_char in kanji_chars:
            k_row = db.query(Kanji).filter(Kanji.character == k_char).first()
            if k_row:
                kanji_info.append({
                    "character": k_row.character,
                    "meaning": k_row.meaning
                })
        
        cards.append({
            "word_id": vocab.id,
            "surface": vocab.dictionary_form,
            "reading": vocab.reading or "",
            "meaning": vocab.meaning or "",
            "pos": vocab.pos or "",
            "kanji_list": kanji_info,
            "status": state.status.value,
            "interval": state.interval,
            "ease_factor": state.ease_factor,
        })
    
    return {"cards": cards, "total": len(cards)}


@app.get("/api/vocabulary/bank")
def get_vocabulary_bank(
    song_ids: Optional[str] = None, 
    include_seen: bool = True,
    include_learned: bool = True,
    db: Session = Depends(get_db), 
    current_user: User = Depends(get_current_user)
):
    """
    Returns ALL vocabulary words for a user based on filters, without SRS limits.
    """
    # Base query for user's words
    query = db.query(UserWordState).filter(UserWordState.user_id == current_user.id)
    
    # Filter by Status
    status_filters = []
    if include_seen: status_filters.append(WordStatus.SEEN)
    if include_learned: status_filters.append(WordStatus.LEARNED)
    
    if not status_filters:
        return {"words": []}
    
    query = query.filter(UserWordState.status.in_(status_filters))

    if song_ids:
        try:
            # Filter out zeros or negative IDs that might come from frontend misparsing
            id_list = [int(sid.strip()) for sid in song_ids.split(",") if sid.strip() and int(sid.strip()) > 0]
            if id_list:
                query = query.join(Vocabulary, UserWordState.word_id == Vocabulary.id).join(
                    song_vocabulary, Vocabulary.id == song_vocabulary.c.vocabulary_id
                ).filter(song_vocabulary.c.song_id.in_(id_list))
        except ValueError:
            pass

    # Sort by most recently reviewed/updated
    word_states = query.order_by(UserWordState.last_reviewed.desc()).all()
    
    results = []
    for state in word_states:
        vocab = db.query(Vocabulary).filter(Vocabulary.id == state.word_id).first()
        if not vocab: continue
        
        # Get songs this word appears in
        word_songs = db.query(Song.id, Song.title).join(song_vocabulary).filter(song_vocabulary.c.vocabulary_id == vocab.id).all()
        
        results.append({
            "id": vocab.id,
            "surface": vocab.dictionary_form,
            "reading": vocab.reading,
            "meaning": vocab.meaning,
            "status": state.status.value,
            "songs": [{"id": s.id, "title": s.title} for s in word_songs]
        })
        
    return {"words": results}


@app.get("/api/kanji/{character}/words")
def get_kanji_related_words(character: str, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    """
    Find vocabulary words containing this character ONLY if seen by the user.
    Includes song contexts for each word.
    """
    # Look up the kanji character info
    kanji = db.query(Kanji).filter(Kanji.character == character).first()
    
    # Get user's seen word IDs for words containing this character
    # We join Vocabulary to filter by dictionary_form
    seen_states = db.query(UserWordState).join(Vocabulary).filter(
        UserWordState.user_id == current_user.id,
        Vocabulary.dictionary_form.like(f"%{character}%")
    ).all()
    
    results = []
    # Identify context for each word (similar to get_word_contexts)
    # Optimizing: only look at songs the user has processed
    user_progs = db.query(UserSongProgress).filter_by(user_id=current_user.id).all()
    processed_songs = [p.song for p in user_progs if p.song.parsed_lyrics_cache]

    for state in seen_states:
        v = state.word
        
        # Find occurrences in songs
        contexts = []
        for song in processed_songs:
            try:
                parsed = json.loads(song.parsed_lyrics_cache)
                for i, line in enumerate(parsed):
                    if any(t.get("vocab_id") == v.id for t in line):
                        line_text = "".join(t.get("surface", "") for t in line)
                        contexts.append({
                            "song_id": song.id,
                            "song_title": song.title,
                            "line_text": line_text.strip(),
                            "line_index": i
                        })
                        if len(contexts) >= 3: break # Limit instances per song
                if len(contexts) >= 5: break # Limit total instances per word
            except:
                continue

        results.append({
            "id": v.id,
            "dictionary_form": v.dictionary_form,
            "reading": v.reading,
            "meaning": v.meaning,
            "status": state.status.value,
            "contexts": contexts
        })
    
    # Priority: Learned words first
    order = {"LEARNED": 0, "SEEN": 1}
    results.sort(key=lambda x: order.get(x["status"], 2))
    
    return {
        "character": character,
        "meaning": kanji.meaning if kanji else None,
        "radicals": kanji.radicals if kanji else None,
        "words": results
    }


@app.get("/api/vocabulary/{word_id}/contexts")
def get_word_contexts(word_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    """
    Find lines in songs the user has processed where this word appears.
    """
    # Get vocabulary word
    vocab = db.query(Vocabulary).get(word_id)
    if not vocab:
        raise HTTPException(status_code=404, detail="Word not found")

    # For now, search through songs the user has progress in
    user_progs = db.query(UserSongProgress).filter_by(user_id=current_user.id).all()
    contexts = []

    for prog in user_progs:
        song = prog.song
        if not song.parsed_lyrics_cache:
            continue
            
        try:
            parsed = json.loads(song.parsed_lyrics_cache)
            for i, line in enumerate(parsed):
                # check if vocab_id is in this line
                contains_word = False
                line_text = ""
                for token in line:
                    line_text += token.get("surface", "")
                    if token.get("vocab_id") == word_id:
                        contains_word = True
                
                if contains_word:
                    contexts.append({
                        "song_id": song.id,
                        "song_title": song.title,
                        "line_text": line_text.strip(),
                        "line_index": i
                    })
        except:
            continue

    return contexts[:5]  # Limit to 5 examples


class FlashcardReview(BaseModel):
    word_id: int
    grade: int  # 0=forgot, 1=hard, 2=easy

@app.post("/api/flashcards/review")
def review_flashcard(req: FlashcardReview, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    """
    Applies SM-2 spaced repetition algorithm to update a word's review schedule.
    grade: 0=forgot (reset), 1=hard (slow progression), 2=easy (normal SM-2)
    """
    import datetime
    
    state = db.query(UserWordState).filter_by(
        user_id=current_user.id, word_id=req.word_id
    ).first()
    
    if not state:
        raise HTTPException(status_code=404, detail="Word not tracked for this user")
    
    now = datetime.datetime.utcnow()
    state.last_reviewed = now
    
    if req.grade == 0:  # Forgot
        state.interval = 0.0
        state.ease_factor = max(1.3, state.ease_factor - 0.2)
        state.next_review = now + datetime.timedelta(minutes=10)
        # Demote back to SEEN if was LEARNED
        state.status = WordStatus.SEEN
        
    elif req.grade == 1:  # Hard
        if state.interval == 0:
            state.interval = 1.0
        else:
            state.interval = state.interval * 1.2
        state.ease_factor = max(1.3, state.ease_factor - 0.15)
        state.next_review = now + datetime.timedelta(days=state.interval)
        
    else:  # Easy (grade == 2)
        if state.interval == 0:
            state.interval = 1.0
        elif state.interval == 1:
            state.interval = 6.0
        else:
            state.interval = state.interval * state.ease_factor
        state.ease_factor = state.ease_factor + 0.1
        state.next_review = now + datetime.timedelta(days=state.interval)
    
    # Promote to LEARNED once interval exceeds 21 days
    if state.interval >= 21.0:
        state.status = WordStatus.LEARNED
    
    db.commit()
    
    return {
        "word_id": req.word_id,
        "new_status": state.status.value,
        "new_interval": round(state.interval, 1),
        "next_review": state.next_review.isoformat() if state.next_review else None
    }
