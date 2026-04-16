import { apiPath } from "./api";
import { useState, useEffect, useContext } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { AuthContext } from './Auth';
import { useSettings, kanaToRomaji, katakanaToHiragana, hiraganaToKatakana } from './SettingsContext';
import { RotateCcw, CheckCircle, Zap, Eye, EyeOff, Music, Search, Filter, LayoutGrid, ChevronLeft, ChevronRight, BookOpen } from 'lucide-react';

interface FlashCard {
    word_id: number;
    surface: string;
    reading: string;
    meaning: string;
    pos: string;
    kanji_list: { character: string; meaning: string }[];
    status: string;
    interval: number;
    ease_factor: number;
}

interface Song {
    id: number;
    title: string;
    artist: string;
    status: string;
}

export const FlashcardsArea = () => {
    const { token, setToken } = useContext(AuthContext);
    const { readingFormat } = useSettings();
    const location = useLocation();
    const navigate = useNavigate();
    const queryParams = new URLSearchParams(location.search);
    const initialSongId = queryParams.get('songId');

    // View state: 'selection' | 'session' | 'complete'
    const [view, setView] = useState<'selection' | 'session' | 'complete'>('selection');
    const [loading, setLoading] = useState(true);
    const [startingSession, setStartingSession] = useState(false);
    
    // Selection state
    const [songs, setSongs] = useState<Song[]>([]);
    const [selectedSongs, setSelectedSongs] = useState<number[]>(initialSongId ? [parseInt(initialSongId)] : []);
    const [sessionLimit, setSessionLimit] = useState(20);
    const [includeSeen, setIncludeSeen] = useState(true);
    const [includeLearned, setIncludeLearned] = useState(true);
    const [songSearch, setSongSearch] = useState('');

    // Session state
    const [cards, setCards] = useState<FlashCard[]>([]);
    const [currentIndex, setCurrentIndex] = useState(0);
    const [flipped, setFlipped] = useState(false);
    const [reviewing, setReviewing] = useState(false);
    const [reviewedCount, setReviewedCount] = useState(0);
    const [showFrontReading, setShowFrontReading] = useState(false);
    const [contexts, setContexts] = useState<any[]>([]);
    const [showContexts, setShowContexts] = useState(false);
    const [sessionResults, setSessionResults] = useState<{word_id: number, grade: number}[]>([]);

    // Persistence: Restore session on mount
    useEffect(() => {
        const savedSession = sessionStorage.getItem('flashcard_session');
        if (savedSession) {
            try {
                const parsed = JSON.parse(savedSession);
                setCards(parsed.cards || []);
                setCurrentIndex(parsed.currentIndex || 0);
                setReviewedCount(parsed.reviewedCount || 0);
                setSessionResults(parsed.sessionResults || []);
                setView(parsed.view || 'selection');
            } catch (e) {
                console.error("Failed to restore session", e);
            }
        }
    }, []);

    // Persistence: Save session whenever it changes
    useEffect(() => {
        if (view !== 'selection') {
            const sessionData = { 
                view, 
                cards, 
                currentIndex, 
                reviewedCount,
                sessionResults 
            };
            sessionStorage.setItem('flashcard_session', JSON.stringify(sessionData));
        }
    }, [view, cards, currentIndex, reviewedCount, sessionResults]);

    useEffect(() => {
        if (!token) return;
        setLoading(true);
        fetch(apiPath('/api/songs'), { headers: { 'Authorization': `Bearer ${token}` } })
        .then(r => r.json())
        .then(songsData => {
            setSongs(songsData || []);
            setLoading(false);
        })
        .catch(e => {
            console.error(e);
            setLoading(false);
        });
    }, [token]);

    const startSession = (specificCards?: FlashCard[]) => {
        if (!token) return;

        if (specificCards) {
            setCards(specificCards);
            setSessionResults([]);
            setReviewedCount(0);
            setCurrentIndex(0);
            setView('session');
            setFlipped(false);
            return;
        }

        if (selectedSongs.length === 0) return;

        setStartingSession(true);
        let url = apiPath(`/api/flashcards/due?limit=${sessionLimit}&include_seen=${includeSeen}&include_learned=${includeLearned}`);
        if (selectedSongs.length > 0) {
            url += `&song_ids=${selectedSongs.join(',')}`;
        }

        fetch(url, {
            headers: { 'Authorization': `Bearer ${token}` }
        })
        .then(r => {
            if (r.status === 401) {
                setToken(null);
                localStorage.removeItem("lyvo_token");
                throw new Error("Unauthorized");
            }
            return r.json();
        })
        .then(data => {
            setCards(data.cards || []);
            setSessionResults([]);
            setStartingSession(false);
            if (!data.cards || data.cards.length === 0) {
                setView('complete');
            } else {
                setView('session');
                setCurrentIndex(0);
                setReviewedCount(0);
                setFlipped(false);
            }
        })
        .catch(e => {
            console.error(e);
            setStartingSession(false);
        });
    };

    const submitReview = async (grade: number) => {
        if (reviewing || !cards[currentIndex]) return;
        setReviewing(true);
        const card = cards[currentIndex];

        setSessionResults(prev => {
            const exists = prev.findIndex(r => r.word_id === card.word_id);
            if (exists !== -1) {
                const updated = [...prev];
                updated[exists] = { word_id: card.word_id, grade };
                return updated;
            }
            return [...prev, { word_id: card.word_id, grade }];
        });

        try {
            await fetch(apiPath('/api/flashcards/review'), {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ word_id: card.word_id, grade })
            });
        } catch (e) {
            console.error('Review failed:', e);
        }
        
        setReviewing(false);
        setReviewedCount(prev => {
            const alreadyReviewed = sessionResults.some(r => r.word_id === card.word_id);
            return alreadyReviewed ? prev : prev + 1;
        });
        setFlipped(false);
        setContexts([]);
        setShowContexts(false);
        
        if (currentIndex + 1 < cards.length) {
            setTimeout(() => setCurrentIndex(prev => prev + 1), 200);
        } else {
            setView('complete');
        }
    };

    const fetchContexts = async (wordId: number) => {
        if (contexts.length > 0) return;
        try {
            const r = await fetch(apiPath(`/api/vocabulary/${wordId}/contexts`), {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const data = await r.json();
            setContexts(data || []);
        } catch (e) {
            console.error('Failed to fetch contexts', e);
        }
    };

    useEffect(() => {
        if (flipped && cards[currentIndex]) {
            fetchContexts(cards[currentIndex].word_id);
        }
    }, [flipped, currentIndex]);

    const getDisplayReading = (reading: string): string => {
        if (!reading) return '';
        switch (readingFormat) {
            case 'katakana': return hiraganaToKatakana(katakanaToHiragana(reading));
            case 'romaji': return kanaToRomaji(reading);
            default: return katakanaToHiragana(reading);
        }
    };

    if (loading) {
        return (
            <div className="page-enter" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '60vh' }}>
                <div className="spinner" style={{ width: '50px', height: '50px', border: '3px solid var(--glass-border)', borderTopColor: 'var(--brand-primary)', borderRadius: '50%', animation: 'spin 1s linear infinite' }}></div>
                <h2 style={{ marginTop: '2rem' }}>Loading selection screen...</h2>
                <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
            </div>
        );
    }

    if (view === 'selection') {
        const processedSongs = songs.filter(s => s.status !== null);
        const filteredSongs = processedSongs.filter(s => 
            s.title.toLowerCase().includes(songSearch.toLowerCase()) || 
            s.artist.toLowerCase().includes(songSearch.toLowerCase())
        );

        return (
            <div className="page-enter" style={{ maxWidth: '900px', margin: '0 auto' }}>
                <div style={{ textAlign: 'center', marginBottom: '3rem' }}>
                    <h1 className="title-gradient hero-title" style={{ fontSize: '3rem', marginBottom: '1rem' }}>Configure Session</h1>
                    <p className="hero-subtitle" style={{ color: 'var(--text-secondary)' }}>Choose what you want to practice today</p>
                </div>

                <div className="selection-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 350px', gap: '2rem' }}>
                    <div className="glass-panel" style={{ padding: '2rem' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                <Music size={20} color="var(--brand-primary)" />
                                <h3 style={{ margin: 0 }}>Vocabulary Sources</h3>
                            </div>
                            <div style={{ position: 'relative' }}>
                                <Search size={16} style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                                <input 
                                    type="text" 
                                    placeholder="Search songs..." 
                                    className="glass-input"
                                    style={{ paddingLeft: '2.5rem', fontSize: '0.85rem', width: '100%', minWidth: '150px' }}
                                    value={songSearch}
                                    onChange={(e) => setSongSearch(e.target.value)}
                                />
                            </div>
                        </div>

                        <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
                            <button className="btn btn-outline" style={{ fontSize: '0.75rem', padding: '0.4rem 0.8rem' }} onClick={() => setSelectedSongs([])}>Clear All</button>
                            <button className="btn btn-outline" style={{ fontSize: '0.75rem', padding: '0.4rem 0.8rem' }} onClick={() => setSelectedSongs(songs.map(s => s.id))}>Select All</button>
                        </div>

                        <div style={{ maxHeight: '400px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '0.75rem', paddingRight: '0.5rem' }}>
                            {filteredSongs.length > 0 ? filteredSongs.map(song => (
                                <div 
                                    key={song.id}
                                    onClick={() => {
                                        setSelectedSongs(prev => prev.includes(song.id) ? prev.filter(id => id !== song.id) : [...prev, song.id]);
                                    }}
                                    className="glass-panel hover-bright"
                                    style={{ 
                                        padding: '1rem', 
                                        cursor: 'pointer',
                                        background: selectedSongs.includes(song.id) ? 'rgba(99, 102, 241, 0.15)' : 'rgba(255,255,255,0.03)',
                                        border: selectedSongs.includes(song.id) ? '1px solid var(--brand-primary)' : '1px solid var(--glass-border)',
                                        display: 'flex',
                                        justifyContent: 'space-between',
                                        alignItems: 'center'
                                    }}
                                >
                                    <div>
                                        <div style={{ fontWeight: 600, fontSize: '1rem' }}>{song.title}</div>
                                        <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{song.artist}</div>
                                    </div>
                                </div>
                            )) : (
                                <p style={{ textAlign: 'center', color: 'var(--text-muted)', marginTop: '2rem' }}>No songs found matching your search.</p>
                            )}
                        </div>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
                        <div className="glass-panel" style={{ padding: '2rem' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.5rem' }}>
                                <Filter size={20} color="var(--brand-primary)" />
                                <h3 style={{ margin: 0 }}>Content Filters</h3>
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                                <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer' }}>
                                    <span style={{ fontSize: '0.9rem' }}>New Words (Seen)</span>
                                    <input type="checkbox" checked={includeSeen} onChange={() => setIncludeSeen(!includeSeen)} />
                                </label>
                                <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer' }}>
                                    <span style={{ fontSize: '0.9rem' }}>Learned Vocabulary</span>
                                    <input type="checkbox" checked={includeLearned} onChange={() => setIncludeLearned(!includeLearned)} />
                                </label>
                            </div>
                        </div>

                        <div className="glass-panel" style={{ padding: '2rem' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.5rem' }}>
                                <LayoutGrid size={20} color="var(--brand-primary)" />
                                <h3 style={{ margin: 0 }}>Session Size</h3>
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.75rem' }}>
                                {[10, 20, 30, 50, 75, 100].map(s => (
                                    <button 
                                        key={s}
                                        className={`btn ${sessionLimit === s ? '' : 'btn-outline'}`}
                                        style={{ padding: '0.5rem 0', fontSize: '0.9rem' }}
                                        onClick={() => setSessionLimit(s)}
                                    >
                                        {s}
                                    </button>
                                ))}
                            </div>
                        </div>

                        <button 
                            className="btn" 
                            style={{ 
                                width: '100%', 
                                padding: '1.25rem', 
                                fontSize: '1.1rem', 
                                display: 'flex', 
                                alignItems: 'center', 
                                justifyContent: 'center', 
                                gap: '1rem', 
                                boxShadow: selectedSongs.length > 0 ? '0 8px 32px rgba(99, 102, 241, 0.3)' : 'none',
                                opacity: selectedSongs.length > 0 ? 1 : 0.5,
                                cursor: selectedSongs.length > 0 ? 'pointer' : 'not-allowed'
                            }}
                            onClick={() => startSession()}
                            disabled={startingSession || selectedSongs.length === 0}
                        >
                            {startingSession ? 'Preparing deck...' : <><Zap size={20} /> Start Flashcards</>}
                        </button>

                        <button 
                            className="btn btn-outline" 
                            style={{ 
                                width: '100%', 
                                padding: '1rem', 
                                fontSize: '1rem', 
                                display: 'flex', 
                                alignItems: 'center', 
                                justifyContent: 'center', 
                                gap: '0.75rem',
                                opacity: selectedSongs.length > 0 ? 1 : 0.5,
                                cursor: selectedSongs.length > 0 ? 'pointer' : 'not-allowed'
                            }}
                            onClick={() => navigate(`/vocabulary-bank?songs=${selectedSongs.join(',')}&seen=${includeSeen}&learned=${includeLearned}`)}
                            disabled={selectedSongs.length === 0}
                        >
                            <BookOpen size={20} /> Browse Word Bank
                        </button>

                        {selectedSongs.length === 0 && (
                            <p style={{ color: 'var(--danger)', fontSize: '0.75rem', textAlign: 'center', marginTop: '0.5rem' }}>
                                Please select at least one song to start.
                            </p>
                        )}
                    </div>
                </div>
            </div>
        );
    }

    if (view === 'complete') {
        const hardWordIds = sessionResults.filter(r => r.grade <= 1).map(r => r.word_id);
        const hardCards = cards.filter(c => hardWordIds.includes(c.word_id));

        return (
            <div className="page-enter" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '60vh' }}>
                <div style={{ background: 'rgba(16, 185, 129, 0.15)', padding: '2rem', borderRadius: '50%', marginBottom: '2rem' }}>
                    <CheckCircle size={64} color="var(--success)" />
                </div>
                <h2 className="title-gradient" style={{ fontSize: '2.5rem', marginBottom: '1rem' }}>
                    {reviewedCount > 0 ? 'Session Complete!' : 'No cards found'}
                </h2>
                <p style={{ color: 'var(--text-secondary)', fontSize: '1.1rem', marginBottom: '0.5rem' }}>
                    {reviewedCount > 0
                        ? `You reviewed ${reviewedCount} card${reviewedCount !== 1 ? 's' : ''} this session.`
                        : 'No cards matched your current filters.'}
                </p>
                <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', justifyContent: 'center', marginTop: '2rem' }}>
                    <button className="btn btn-outline" onClick={() => {
                        sessionStorage.removeItem('flashcard_session');
                        setView('selection');
                    }}>New Session</button>
                    {hardCards.length > 0 && (
                        <button 
                            className="btn" 
                            style={{ background: 'var(--danger)', borderColor: 'var(--danger)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}
                            onClick={() => startSession(hardCards)}
                        >
                            <RotateCcw size={18} /> Revisit Hard Words ({hardCards.length})
                        </button>
                    )}
                    <button className="btn btn-outline" onClick={() => navigate('/browse')}>Browse More Songs</button>
                </div>
            </div>
        );
    }

    const card = cards[currentIndex];
    if (!card) return null;
    const hasBeenReviewed = sessionResults.some(r => r.word_id === card.word_id);

    return (
        <div className="page-enter" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', minHeight: '60vh' }}>
            <div style={{ width: '100%', maxWidth: '500px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
                <button 
                    className="btn btn-outline" 
                    onClick={() => {
                        sessionStorage.removeItem('flashcard_session');
                        setView('selection');
                    }} 
                    style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem' }}
                >
                    End Session
                </button>
                <div style={{ textAlign: 'center' }}>
                    <div style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
                        <button 
                            className="nav-arrow-btn" 
                            disabled={currentIndex === 0}
                            onClick={() => { setCurrentIndex(prev => prev - 1); setFlipped(false); }}
                            style={{ 
                                background: 'rgba(255,255,255,0.05)', 
                                border: 'none', 
                                color: currentIndex === 0 ? 'rgba(255,255,255,0.1)' : 'var(--text-primary)', 
                                cursor: currentIndex === 0 ? 'default' : 'pointer',
                                borderRadius: '50%',
                                width: '32px',
                                height: '32px',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                transition: 'all 0.2s'
                            }}
                        >
                            <ChevronLeft size={18} />
                        </button>
                        <span style={{ fontWeight: 600 }}>Card {currentIndex + 1} of {cards.length}</span>
                        <button 
                            className="nav-arrow-btn" 
                            disabled={currentIndex >= cards.length - 1 || (!hasBeenReviewed && currentIndex === reviewedCount)}
                            onClick={() => { setCurrentIndex(prev => prev + 1); setFlipped(false); }}
                            style={{ 
                                background: 'rgba(255,255,255,0.05)', 
                                border: 'none', 
                                color: (currentIndex >= cards.length - 1 || (!hasBeenReviewed && currentIndex === reviewedCount)) ? 'rgba(255,255,255,0.1)' : 'var(--text-primary)', 
                                cursor: (currentIndex >= cards.length - 1 || (!hasBeenReviewed && currentIndex === reviewedCount)) ? 'default' : 'pointer',
                                borderRadius: '50%',
                                width: '32px',
                                height: '32px',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                transition: 'all 0.2s'
                            }}
                        >
                            <ChevronRight size={18} />
                        </button>
                    </div>
                    <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem', marginTop: '0.25rem' }}>{reviewedCount} reviewed</div>
                </div>
                <div style={{ width: '70px' }}></div>
            </div>

            <div style={{ width: '100%', maxWidth: '500px', height: '4px', background: 'rgba(255,255,255,0.08)', borderRadius: '2px', marginBottom: '2rem', overflow: 'hidden' }}>
                <div style={{
                    width: `${((currentIndex) / cards.length) * 100}%`,
                    height: '100%',
                    background: 'linear-gradient(90deg, var(--brand-primary), var(--brand-secondary))',
                    borderRadius: '2px',
                    transition: 'width 0.3s ease',
                }} />
            </div>

            <div
                className="glass-panel"
                style={{
                    width: '100%',
                    maxWidth: '500px',
                    minHeight: '350px',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer',
                    position: 'relative',
                    transition: 'transform 0.6s cubic-bezier(0.34, 1.56, 0.64, 1)',
                    transformStyle: 'preserve-3d',
                    transform: flipped ? 'rotateY(180deg)' : 'rotateY(0deg)',
                }}
                onClick={() => setFlipped(!flipped)}
            >
                {!flipped && (
                    <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '2rem' }}>
                        <div 
                            style={{ position: 'absolute', top: '1.5rem', right: '1.5rem', cursor: 'pointer', zIndex: 10, padding: '0.6rem', borderRadius: '50%', background: 'rgba(255,255,255,0.05)', transition: 'all 0.2s' }}
                            onClick={(e) => {
                                e.stopPropagation();
                                setShowFrontReading(!showFrontReading);
                            }}
                        >
                            {!showFrontReading ? <EyeOff size={20} /> : <Eye size={20} />}
                        </div>
                        {showFrontReading && (
                            <span style={{ fontSize: '1.4rem', color: 'var(--brand-primary)', marginBottom: '1.5rem', fontWeight: 500 }}>
                                {readingFormat === 'romaji' ? kanaToRomaji(card.reading) : katakanaToHiragana(card.reading)}
                            </span>
                        )}
                        <h1 style={{ fontSize: '5rem', lineHeight: 1, marginBottom: '1rem' }}>{card.surface}</h1>
                        <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginTop: '2rem' }}>Tap to flip</p>
                    </div>
                )}

                {flipped && (
                    <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '2.5rem', transform: 'rotateY(180deg)' }}>
                        <h2 style={{ fontSize: '2.5rem', color: 'var(--brand-primary)', marginBottom: '0.75rem' }}>{getDisplayReading(card.reading)}</h2>
                        <p style={{ fontSize: '1.6rem', marginBottom: '2rem', textAlign: 'center', lineHeight: 1.4 }}>{card.meaning || 'No definition available'}</p>
                        <div style={{ width: '100%', overflowY: 'auto', maxHeight: '200px' }}>
                            {card.kanji_list && card.kanji_list.length > 0 && (
                                <div style={{ borderTop: '1px solid var(--glass-border)', paddingTop: '1.5rem', width: '100%', textAlign: 'center', marginBottom: '1.5rem' }}>
                                    <div style={{ display: 'flex', justifyContent: 'center', gap: '1.25rem', flexWrap: 'wrap' }}>
                                        {card.kanji_list.map((k, i) => (
                                            <span key={i} style={{ fontSize: '1rem', background: 'rgba(255,255,255,0.03)', padding: '0.4rem 0.8rem', borderRadius: '8px', border: '1px solid var(--glass-border)' }}>
                                                <span style={{ color: 'var(--brand-secondary)', fontSize: '1.3rem', fontWeight: 700 }}>{k.character}</span> {k.meaning}
                                            </span>
                                        ))}
                                    </div>
                                </div>
                            )}
                            <div style={{ borderTop: '1px solid var(--glass-border)', paddingTop: '1.5rem', width: '100%' }}>
                                <button className="btn btn-outline" style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.75rem' }} onClick={(e) => { e.stopPropagation(); setShowContexts(!showContexts); }}>
                                    <Music size={16} /> {showContexts ? 'Hide Context' : 'Show song context'}
                                </button>
                                {showContexts && (
                                    <div style={{ marginTop: '1.25rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                                        {contexts.map((ctx, idx) => (
                                            <div key={idx} className="glass-panel hover-bright" style={{ padding: '1rem', borderLeft: '3px solid var(--brand-primary)', cursor: 'pointer' }} onClick={(e) => {
                                                e.stopPropagation();
                                                navigate(`/viewer/${ctx.song_id}?line=${ctx.line_index}&fromFlashcards=true&returnTo=${encodeURIComponent(window.location.pathname + window.location.search)}`);
                                            }}>
                                                <p style={{ fontSize: '0.9rem', margin: 0 }}>{ctx.line_text}</p>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {flipped && (
                <div style={{ display: 'flex', gap: '1.25rem', marginTop: '2.5rem' }}>
                    <button className="btn btn-outline" style={{ borderColor: 'var(--danger)', color: 'var(--danger)', padding: '0.85rem 1.75rem' }} onClick={(e) => { e.stopPropagation(); submitReview(0); }} disabled={reviewing}>Forgot</button>
                    <button className="btn btn-outline" style={{ borderColor: 'var(--text-secondary)', color: 'var(--text-secondary)', padding: '0.85rem 1.75rem' }} onClick={(e) => { e.stopPropagation(); submitReview(1); }} disabled={reviewing}>Hard</button>
                    <button className="btn" style={{ background: 'var(--success)', borderColor: 'var(--success)', padding: '0.85rem 2rem' }} onClick={(e) => { e.stopPropagation(); submitReview(2); }} disabled={reviewing}>Easy</button>
                </div>
            )}
            <style>{`.hover-bright:hover { filter: brightness(1.2); } @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }`}</style>
        </div>
    );
};
