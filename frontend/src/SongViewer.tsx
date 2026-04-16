import { apiPath } from "./api";
import React, { useState, useEffect, useContext, useRef } from 'react';
import ReactDOM from 'react-dom';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { AuthContext } from './Auth';
import { useSettings, hiraganaToKatakana, katakanaToHiragana, kanaToRomaji } from './SettingsContext';
import { BrainCircuit, ArrowLeft, ExternalLink, CheckCircle, CheckCheck, Lightbulb, RefreshCw, ChevronRight, ChevronDown, MessageSquare, X } from 'lucide-react';

export const SongViewer = () => {
    const { id } = useParams();
    const navigate = useNavigate();
    const location = useLocation();
    const { token, setToken } = useContext(AuthContext);

    // Parse query params for line navigation
    const queryParams = new URLSearchParams(location.search);
    const targetLine = queryParams.get('line');
    const fromFlashcards = queryParams.get('fromFlashcards') === 'true';
    const returnTo = queryParams.get('returnTo');

    const [loading, setLoading] = useState(true);
    const [songData, setSongData] = useState<any>(null);
    const [selectedKanji, setSelectedKanji] = useState<any>(null);
    const [grammarExpl, setGrammarExpl] = useState<string>('');
    const [isGenerating] = useState(false);
    const [seenLines, setSeenLines] = useState<number[]>([]);

    // Chat UI State
    const [activeLineChatIdx, setActiveLineChatIdx] = useState<number | null>(null);
    const [chatHistory, setChatHistory] = useState<any[]>([]);
    const [chatInput, setChatInput] = useState<string>('');
    const [chatLoading, setChatLoading] = useState(false);
    const [activeSavedChatId, setActiveSavedChatId] = useState<number | null>(null);
    const [savedChatsForSong, setSavedChatsForSong] = useState<any[]>([]);
    const chatEndRef = useRef<HTMLDivElement>(null);

    // Scroll chat to bottom
    useEffect(() => {
        if (chatEndRef.current) {
            chatEndRef.current.scrollIntoView({ behavior: 'smooth' });
        }
    }, [chatHistory]);

    const [activeKanji, setActiveKanji] = useState<string | null>(null);
    const [relatedWords, setRelatedWords] = useState<any[]>([]);
    const [isFetchingWords, setIsFetchingWords] = useState(false);

    // Responsive State
    const [windowWidth, setWindowWidth] = useState(window.innerWidth);
    const [isChatDrawerOpen, setIsChatDrawerOpen] = useState(false);
    const isMobile = windowWidth < 768;

    useEffect(() => {
        const handleResize = () => setWindowWidth(window.innerWidth);
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    // YouTube Player Refs
    const playerRef = useRef<any>(null);

    // Ref for the container to handle scrolling
    const scrollContainerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!token) return;
        setLoading(true);
        // Process & fetch
        fetch(apiPath(`/api/songs/${id}/process`), {
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
                setSongData(data);
                setSeenLines(data.seen_lines || []);
                setLoading(false);
            })
            .catch(e => {
                console.error(e);
                setLoading(false);
            });

        // Fetch saved chats specifically for this song
        fetch(apiPath(`/api/ai/saved_chats?song_id=${id}`), {
            headers: { 'Authorization': `Bearer ${token}` }
        })
            .then(r => r.ok ? r.json() : [])
            .then(data => setSavedChatsForSong(data))
            .catch(e => console.error(e));

    }, [id, token]);

    // Handle initial scrolling to target line (from Kanji Explorer/Flashcards)
    useEffect(() => {
        if (!loading && targetLine !== null && songData) {
            setTimeout(() => {
                const element = document.getElementById(`line-${targetLine}`);
                if (element) {
                    element.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    element.classList.add('highlight-line');
                    setTimeout(() => element.classList.remove('highlight-line'), 3000);
                }
            }, 500);
        }
    }, [loading, targetLine, songData]);

    // Explicit sync — only called with complete history (after AI responds)
    const syncToServer = (savedChatId: number, history: any[]) => {
        if (!token || history.length === 0) return;
        fetch(apiPath(`/api/ai/saved_chats/${savedChatId}`), {
            method: 'PUT',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                line_text: "",
                history: history
            })
        }).catch(e => console.error("Sync failed", e));
    };

    // Helper to check if a line has a saved chat
    const getLineText = (lineIdx: number) => {
        if (!songData) return '';
        return songData.parsed_lyrics[lineIdx].map((t: any) => t.surface).join('');
    };
    const lineHasSavedChat = (lineIdx: number) => {
        return savedChatsForSong.some(c => c.line_text === getLineText(lineIdx));
    };

    // Auto-create a saved chat record after the first AI response
    const autoSaveChat = async (lineIdx: number, history: any[]) => {
        if (!token || !songData || activeSavedChatId) return;
        try {
            const lineText = getLineText(lineIdx);
            const res = await fetch(apiPath(`/api/ai/saved_chats`), {
                method: "POST",
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    song_id: parseInt(id || "0"),
                    song_title: songData.title,
                    line_text: lineText,
                    history: history
                })
            });
            if (res.ok) {
                const data = await res.json();
                setActiveSavedChatId(data.id);
                setSavedChatsForSong(prev => [...prev, { id: data.id, line_text: lineText, chat_history: history }]);
            }
        } catch (e) {
            console.error("Auto-save failed", e);
        }
    };

    const requestChat = async (lineIdx: number, message?: string, label?: string, forceNew: boolean = false) => {
        if (!token || !songData) return;

        if (isMobile) setIsChatDrawerOpen(true);
        
        const userMessageCount = chatHistory.filter(m => m.role === 'user').length;
        if (userMessageCount >= 10 && !message) {
            alert("Chat limit reached (10 messages per line). Please restart the chat if you have more questions.");
            return;
        }

        let userMessage = message;
        let displayMessage = label;
        let newHistory = [...chatHistory];

        // If switching to a new line
        if (activeLineChatIdx !== lineIdx || forceNew) {
            if (!userMessage) {
                const existingChat = savedChatsForSong.find(c => c.line_text === getLineText(lineIdx));
                if (existingChat && !forceNew) {
                    setActiveLineChatIdx(lineIdx);
                    setActiveSavedChatId(existingChat.id);
                    setChatHistory(existingChat.chat_history);
                    if (isMobile) setIsChatDrawerOpen(true);
                    return;
                }
            }

            setActiveLineChatIdx(lineIdx);
            setActiveSavedChatId(null);
            newHistory = [];
            setChatHistory([]);
            if (!userMessage) {
                userMessage = "Could you explain the grammar and vocabulary used in this line?";
                displayMessage = "HIDDEN";
            }
        }

        if (!userMessage) return;

        let updatedHistory = [...newHistory];
        if (displayMessage !== "HIDDEN") {
            const bubbleContent = displayMessage || userMessage;
            updatedHistory = [...updatedHistory, { role: 'user', content: bubbleContent }];
            setChatHistory(updatedHistory);
        }
        
        setChatInput('');
        setChatLoading(true);

        const lineText = getLineText(lineIdx);
        const llmHistory = [...newHistory, { role: 'user', content: userMessage }];

        if (llmHistory.filter(m => m.role === 'user').length > 10) {
            setChatHistory([...updatedHistory, { role: 'assistant', content: "Limit reached: 10 messages per chat session." }]);
            setChatLoading(false);
            return;
        }

        try {
            const res = await fetch(apiPath(`/api/ai/chat`), {
                method: "POST",
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    line_context: lineText,
                    history: llmHistory
                })
            });
            const data = await res.json();
            const finalHistory = [...updatedHistory, { role: 'assistant', content: data.explanation }];
            setChatHistory(finalHistory);

            if (activeSavedChatId) {
                syncToServer(activeSavedChatId, finalHistory);
            } else {
                autoSaveChat(lineIdx, finalHistory);
            }
        } catch (e) {
            console.error("Chat error", e);
            setChatHistory([...updatedHistory, { role: 'assistant', content: "Failed to connect to AI server." }]);
        } finally {
            setChatLoading(false);
        }
    };

    const refreshChat = async () => {
        if (!token || activeLineChatIdx === null || !songData) return;
        if (activeSavedChatId) {
            try {
                await fetch(apiPath(`/api/ai/saved_chats/${activeSavedChatId}`), {
                    method: 'DELETE',
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                setSavedChatsForSong(prev => prev.filter(c => c.id !== activeSavedChatId));
            } catch (e) { console.error(e); }
        }
        const lineIdx = activeLineChatIdx;
        setActiveSavedChatId(null);
        setActiveLineChatIdx(null);
        setChatHistory([]);
        setTimeout(() => requestChat(lineIdx, undefined, undefined, true), 50);
    };

    const focusLine = (idx: number) => {
        setActiveLineIdx(idx);
        if (playerRef.current) {
            playerRef.current.seekTo(songData.timestamps[idx], true);
        }
        if (isMobile && lineHasSavedChat(idx)) {
            requestChat(idx);
        }
    };

    const translatePos = (pos: string) => {
        const mapping: { [key: string]: string } = {
            '名詞': 'Noun',
            '動詞': 'Verb',
            '助動詞': 'Aux. Verb',
            '形容詞': 'Adjective',
            '副詞': 'Adverb',
            '助詞': 'Particle',
            '接続詞': 'Conjunction',
            '代名詞': 'Pronoun',
            '感動詞': 'Interjection',
            '接頭辞': 'Prefix',
            '接尾辞': 'Suffix',
            '連体詞': 'Adnominal',
            'フィラー': 'Filler',
            '記号': 'Symbol'
        };
        return mapping[pos] || pos;
    };

    const fetchRelatedWords = async (char: string) => {
        if (activeKanji === char) {
            setActiveKanji(null);
            return;
        }
        setActiveKanji(char);
        setIsFetchingWords(true);
        try {
            const res = await fetch(apiPath(`/api/kanji/${char}/words`), {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const data = await res.json();
            setRelatedWords(data.words.filter((w: any) => w.status !== 'UNSEEN').slice(0, 5));
        } catch (e) {
            console.error(e);
        } finally {
            setIsFetchingWords(false);
        }
    };

    const getEmbedUrl = (url: string) => {
        if (!url) return '';
        const match = url.match(/v=([a-zA-Z0-9_-]{11})/);
        return match ? `https://www.youtube.com/embed/${match[1]}?autoplay=0&rel=0&modestbranding=1` : '';
    };

    const [showKana, setShowKana] = useState(true);
    const [showTranslation, setShowTranslation] = useState(true);
    const { readingFormat } = useSettings();

    const getReadingText = (kana: string): string => {
        if (!kana) return '';
        switch (readingFormat) {
            case 'katakana': return hiraganaToKatakana(katakanaToHiragana(kana));
            case 'romaji': return kanaToRomaji(kana);
            default: return katakanaToHiragana(kana); // hiragana
        }
    };

    const getReadingForToken = (token: any): string => {
        const kana = token.kana || '';
        if (readingFormat === 'romaji') {
            return kanaToRomaji(kana || token.surface);
        }
        return getReadingText(kana);
    };

    const acknowledgeLine = async (idx: number) => {
        if (!token || seenLines.includes(idx)) return;

        try {
            const res = await fetch(apiPath(`/api/songs/${id}/acknowledge_line/${idx}`), {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const data = await res.json();
            setSeenLines(data.seen_lines);
        } catch (e) {
            console.error('Failed to acknowledge line:', e);
        }
    };

    const captureAll = async () => {
        if (!token || !songData) return;

        try {
            await Promise.all(songData.parsed_lyrics.map((_: any, i: number) => acknowledgeLine(i)));
        } catch (e) {
            console.error('Failed to capture all lines:', e);
        }
    };

    if (loading) {
        return (
            <div className="page-enter" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '60vh' }}>
                <div className="spinner" style={{ width: '50px', height: '50px', border: '3px solid var(--glass-border)', borderTopColor: 'var(--brand-primary)', borderRadius: '50%', animation: 'spin 1s linear infinite' }}></div>
                <h2 style={{ marginTop: '2rem' }}>Processing Japanese NLP...</h2>
                <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
            </div>
        );
    }

    if (!songData || !songData.parsed_lyrics) return <div className="page-enter" style={{ padding: '2rem', textAlign: 'center' }}>Song data incomplete or analysis failed.</div>;

    return (
        <div className="viewer-layout page-enter">
            {fromFlashcards && (
                <div style={{ gridColumn: '1 / -1', marginBottom: '1rem', animation: 'fadeIn 0.5s ease' }}>
                    <button
                        className="btn btn-outline"
                        style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.5rem 1.25rem', background: 'rgba(99, 102, 241, 0.1)' }}
                        onClick={() => {
                            if (returnTo) {
                                navigate(decodeURIComponent(returnTo));
                            } else {
                                navigate('/flashcards');
                            }
                        }}
                    >
                        <ArrowLeft size={18} /> Back to Flashcards
                    </button>
                    <p style={{ marginTop: '0.75rem', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                        Reviewing context from your session for word usage: <span style={{ color: 'var(--brand-primary)', fontWeight: 600 }}>{songData.title}</span>
                    </p>
                </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem', flex: isMobile ? 'none' : 1 }}>
                <div className="media-container glass-panel" style={{ padding: isMobile ? '1rem' : '2rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                        <h2 style={{ margin: 0 }}>{songData.title}</h2>
                        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                            <button
                                className="btn btn-outline"
                                style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}
                                onClick={() => navigate(`/flashcards?songId=${id}`)}
                            >
                                <BrainCircuit size={18} /> Review Vocab
                            </button>
                        </div>
                    </div>
                    {songData.youtube_url ? (
                        <iframe
                            width="100%"
                            height="auto"
                            style={{ aspectRatio: '16/9', borderRadius: '8px', border: 'none' }}
                            src={getEmbedUrl(songData.youtube_url)}
                            title="YouTube video player"
                            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                            allowFullScreen
                        ></iframe>
                    ) : (
                        <div style={{ aspectRatio: '16/9', background: 'var(--glass-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '8px' }}>
                            <p style={{ color: 'var(--text-secondary)' }}>No YouTube URL mapped</p>
                        </div>
                    )}
                </div>

                {!isMobile && (
                    <div className="glass-panel" style={{ padding: '2rem', display: 'flex', flexDirection: 'column', height: '65vh', minHeight: '450px', maxHeight: '800px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                            <h3 className="title-gradient" style={{ margin: 0 }}>AI Tutor</h3>
                            {activeLineChatIdx !== null && chatHistory.length > 0 && (
                                <button
                                    className="btn btn-outline"
                                    style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}
                                    onClick={refreshChat}
                                    title="Start fresh conversation for this line"
                                >
                                    <RefreshCw size={14} /> Restart
                                </button>
                            )}
                        </div>

                        {activeLineChatIdx === null ? (
                            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-secondary)', textAlign: 'center' }}>
                                Click the 💡 icon next to any lyric line to start a conversational AI explanation of its grammar and vocabulary.
                            </div>
                        ) : (
                            <>
                                <div style={{ flex: 1, overflowY: 'auto', marginBottom: '1rem', paddingRight: '0.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                                    {chatHistory.filter(msg => msg.role !== 'system' && msg.content && msg.content.trim()).map((msg, idx) => (
                                        <div key={idx} style={{
                                            alignSelf: msg.role === 'user' ? 'flex-end' : 'flex-start',
                                            background: msg.role === 'user' ? 'rgba(99, 102, 241, 0.2)' : 'rgba(255,255,255,0.05)',
                                            padding: '0.75rem 1rem',
                                            borderRadius: '8px',
                                            maxWidth: '85%',
                                            border: msg.role === 'user' ? '1px solid rgba(99, 102, 241, 0.3)' : '1px solid var(--glass-border)',
                                            fontSize: '0.9rem',
                                            lineHeight: 1.5,
                                            whiteSpace: 'pre-wrap'
                                        }}>
                                            {msg.content}
                                        </div>
                                    ))}
                                    {chatLoading && (
                                        <div style={{ alignSelf: 'flex-start', color: 'var(--brand-primary)', fontSize: '0.9rem' }}>
                                            Generating response...
                                        </div>
                                    )}
                                    <div ref={chatEndRef} />
                                </div>

                                {chatHistory.length >= 2 && activeLineChatIdx !== null && (
                                    <div style={{ marginTop: '0.5rem', marginBottom: '1rem', borderTop: '1px solid var(--glass-border)', paddingTop: '1rem' }}>
                                        <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>Deep Dive Suggestions:</p>
                                        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                                            {songData.parsed_lyrics[activeLineChatIdx] && songData.parsed_lyrics[activeLineChatIdx]
                                                .filter((t: any) => /[\u4e00-\u9faf]/.test(t.surface) || !!t.vocab_id)
                                                .filter((t: any, idx: number, self: any[]) => idx === self.findIndex(s => s.surface === t.surface))
                                                .map((t: any, idx: number) => (
                                                    <button
                                                        key={idx}
                                                        className="btn btn-outline"
                                                        style={{ padding: '0.3rem 0.6rem', fontSize: '0.75rem', borderRadius: '16px', background: 'rgba(99, 102, 241, 0.05)' }}
                                                        onClick={() => requestChat(
                                                            activeLineChatIdx,
                                                            `Could you explain the specific usage of the word: ${t.surface}?`,
                                                            t.surface
                                                        )}
                                                    >
                                                        {t.surface}
                                                    </button>
                                                ))
                                            }
                                        </div>
                                    </div>
                                )}

                                <form
                                    style={{ display: 'flex', gap: '0.5rem' }}
                                    onSubmit={(e) => {
                                        e.preventDefault();
                                        requestChat(activeLineChatIdx, chatInput);
                                    }}
                                >
                                    <input
                                        className="glass-input"
                                        style={{ flex: 1, padding: '0.75rem' }}
                                        type="text"
                                        placeholder="Ask a follow-up question..."
                                        value={chatInput}
                                        onChange={e => setChatInput(e.target.value)}
                                        disabled={chatLoading}
                                    />
                                    <button className="btn" type="submit" disabled={chatLoading || !chatInput.trim()}>Send</button>
                                </form>
                                <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textAlign: 'center', marginTop: '0.5rem', fontStyle: 'italic' }}>
                                    AI is not always accurate.
                                </p>
                            </>
                        )}
                    </div>
                )}
            </div>

            <div className={`lyrics-container glass-panel ${isMobile ? 'mobile-lyrics' : ''}`} style={{ padding: isMobile ? '1rem' : '2rem', height: isMobile ? 'auto' : '100%' }} ref={scrollContainerRef}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                    <h3 style={{ color: 'var(--text-secondary)' }}>Translated Lyrics</h3>
                    <div style={{ display: 'flex', gap: '1rem' }}>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontSize: '0.85rem', color: showKana ? 'var(--text-primary)' : 'var(--text-muted)' }}>
                            <input type="checkbox" checked={showKana} onChange={() => setShowKana(!showKana)} style={{ display: 'none' }} />
                            <div style={{ width: '36px', height: '20px', background: showKana ? 'var(--brand-primary)' : 'rgba(255,255,255,0.1)', borderRadius: '20px', position: 'relative', transition: 'all 0.3s' }}>
                                <div style={{ width: '16px', height: '16px', background: 'white', borderRadius: '50%', position: 'absolute', top: '2px', left: showKana ? '18px' : '2px', transition: 'all 0.3s' }} />
                            </div>
                            Readings
                        </label>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontSize: '0.85rem', color: showTranslation ? 'var(--text-primary)' : 'var(--text-muted)' }}>
                            <input type="checkbox" checked={showTranslation} onChange={() => setShowTranslation(!showTranslation)} style={{ display: 'none' }} />
                            <div style={{ width: '36px', height: '20px', background: showTranslation ? 'var(--brand-primary)' : 'rgba(255,255,255,0.1)', borderRadius: '20px', position: 'relative', transition: 'all 0.3s' }}>
                                <div style={{ width: '16px', height: '16px', background: 'white', borderRadius: '50%', position: 'absolute', top: '2px', left: showTranslation ? '18px' : '2px', transition: 'all 0.3s' }} />
                            </div>
                            Translations
                        </label>
                    </div>
                </div>

                {songData.parsed_lyrics && songData.parsed_lyrics.map((line: any[], i: number) => {
                    const literalTranslation = line.map(t => t.meaning).filter(Boolean).join(" • ");
                    const aiTranslation = (songData.english_lines && songData.english_lines[i])
                        ? songData.english_lines[i].trim()
                        : "";

                    const displayTranslation = aiTranslation || literalTranslation;
                    const isSeen = seenLines.includes(i);

                    return (
                        <div
                            key={i}
                            id={`line-${i}`}
                            className="lyric-line-wrapper"
                            style={{
                                marginBottom: showTranslation ? '1rem' : '0',
                                padding: '1rem',
                                paddingLeft: '3.5rem',
                                borderRadius: '12px',
                                transition: 'all 0.3s ease',
                                border: isSeen ? '1px solid rgba(16, 185, 129, 0.2)' : '1px solid transparent',
                                background: isSeen ? 'rgba(16, 185, 129, 0.03)' : 'transparent',
                                position: 'relative',
                                cursor: lineHasSavedChat(i) ? 'pointer' : 'default'
                            }}
                            onClick={() => focusLine(i)}
                        >
                            <div
                                style={{
                                    position: 'absolute',
                                    left: '1rem',
                                    top: '1.25rem',
                                    display: 'flex',
                                    flexDirection: 'column',
                                    gap: '0.75rem',
                                    alignItems: 'center'
                                }}
                            >
                                <div
                                    style={{
                                        cursor: isSeen ? 'default' : 'pointer',
                                        transition: 'all 0.2s',
                                        opacity: isSeen ? 1 : 0.2,
                                    }}
                                    onClick={() => acknowledgeLine(i)}
                                    title={isSeen ? "Acknowledged" : "Click to capture vocabulary"}
                                    className="check-gutter"
                                >
                                    <CheckCircle
                                        size={20}
                                        color={isSeen ? "var(--success)" : "var(--text-muted)"}
                                        fill={isSeen ? "rgba(16, 185, 129, 0.1)" : "none"}
                                    />
                                </div>

                                <div
                                    style={{
                                        cursor: 'pointer',
                                        transition: 'all 0.2s',
                                        opacity: activeLineChatIdx === i ? 1 : (lineHasSavedChat(i) ? 0.8 : 0.4),
                                        transform: activeLineChatIdx === i ? 'scale(1.1)' : 'none'
                                    }}
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        requestChat(i);
                                    }}
                                    title={lineHasSavedChat(i) ? "Resume saved AI chat" : "AI Explain Line"}
                                >
                                    <Lightbulb size={20} color={(activeLineChatIdx === i && (isMobile ? isChatDrawerOpen : true)) ? "var(--brand-primary)" : (lineHasSavedChat(i) ? "#facc15" : "var(--text-muted)")} />
                                </div>
                            </div>

                            <p className="lyric-line" style={{ lineHeight: showKana ? '2.5' : '1.8', margin: 0, marginLeft: '0.5rem' }}>
                                {line.map((token: any, j: number) => {
                                    const hasKanji = /[\u4e00-\u9faf]/.test(token.surface);
                                    const isVocab = !!token.vocab_id;
                                    const showRuby = showKana && (hasKanji || readingFormat === 'romaji');
                                    const readingText = getReadingForToken(token);

                                    const WordElement = () => (
                                        <span
                                            className={`lyric-word ${(isVocab || hasKanji) ? 'kanji' : ''}`}
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                if (isVocab || hasKanji) {
                                                    setSelectedKanji(token);
                                                    setActiveKanji(null);
                                                    setRelatedWords([]);
                                                }
                                            }}
                                            title={token.meaning || token.dict_form}
                                        >
                                            {token.surface}
                                        </span>
                                    );

                                    return (
                                        <React.Fragment key={j}>
                                            {showRuby && readingText ? (
                                                <ruby style={{ rubyPosition: 'over' }}>
                                                    <WordElement />
                                                    <rt style={{ color: 'var(--brand-secondary)', fontSize: readingFormat === 'romaji' ? '0.45em' : '0.5em', userSelect: 'none' }}>{readingText}</rt>
                                                </ruby>
                                            ) : (
                                                <WordElement />
                                            )}
                                        </React.Fragment>
                                    );
                                })}
                            </p>

                            {showTranslation && displayTranslation && (
                                <p style={{ fontSize: '0.9rem', color: 'var(--text-muted)', marginTop: '0.5rem', margin: 0 }}>
                                    ↳ {displayTranslation}
                                </p>
                            )}
                        </div>
                    );
                })}

                <div style={{ marginTop: '3rem', borderTop: '1px solid var(--glass-border)', paddingTop: '2rem', textAlign: 'center' }}>
                    <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '1.5rem' }}>
                        Finished studying? You can capture all remaining vocabulary at once.
                    </p>
                    <button
                        className="btn btn-outline"
                        style={{ display: 'inline-flex', alignItems: 'center', gap: '0.75rem', borderColor: 'var(--success)', color: 'var(--success)' }}
                        onClick={captureAll}
                        disabled={!songData?.parsed_lyrics || seenLines.length === songData.parsed_lyrics.length}
                    >
                        <CheckCheck size={18} /> {(songData?.parsed_lyrics && seenLines.length === songData.parsed_lyrics.length) ? "Song Fully Captured" : "Mark Full Song as Seen"}
                    </button>

                    <style>{`
                        .lyric-line-wrapper:hover .check-gutter {
                            opacity: 1 !important;
                        }
                    `}</style>
                </div>
            </div>

            {selectedKanji && ReactDOM.createPortal(
                <>
                    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', zIndex: 1000, backdropFilter: 'blur(8px)', animation: 'fadeIn 0.3s ease' }} onClick={() => setSelectedKanji(null)} />
                    <div className="glass-panel kanji-modal">
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '2rem' }}>
                            <div>
                                <h1 style={{ fontSize: '4rem', margin: '0 0 0.5rem 0' }} className="title-gradient">{selectedKanji.surface}</h1>
                                <p style={{ color: 'var(--text-secondary)', fontSize: '1.2rem' }}>{selectedKanji.reading} • {selectedKanji.meaning}</p>
                            </div>
                            <div style={{ background: 'rgba(99, 102, 241, 0.2)', padding: '0.5rem 1rem', borderRadius: '12px', color: 'var(--brand-primary)', fontWeight: 600 }}>
                                {translatePos(selectedKanji.pos)}
                            </div>
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
                            <div>
                                <h3 style={{ marginBottom: '1rem', color: 'var(--text-secondary)', fontSize: '0.9rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Kanji Components</h3>
                                {selectedKanji.kanji_list.map((k: any, idx: number) => (
                                    <div key={idx} className="glass-panel" style={{ padding: '1.5rem', marginBottom: '1rem', borderLeft: '4px solid var(--brand-primary)' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                            <div 
                                                style={{ display: 'flex', alignItems: 'center', cursor: 'pointer', gap: '0.5rem' }}
                                                onClick={() => fetchRelatedWords(k.character)}
                                            >
                                                <ChevronRight 
                                                    size={18} 
                                                    style={{ 
                                                        transition: 'transform 0.2s', 
                                                        transform: activeKanji === k.character ? 'rotate(90deg)' : 'none',
                                                        color: 'var(--text-muted)'
                                                    }} 
                                                />
                                                <span style={{ fontSize: '2rem', fontWeight: 700, marginRight: '0.5rem' }}>{k.character}</span>
                                                <span style={{ color: 'var(--text-secondary)' }}>{k.meaning}</span>
                                            </div>
                                            <button
                                                className="btn btn-outline"
                                                style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem' }}
                                                onClick={() => navigate(`/kanji/${k.character}`)}
                                            >
                                                Explore Usage
                                            </button>
                                        </div>

                                        {activeKanji === k.character && (
                                            <div style={{ marginTop: '1rem', borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: '1rem', animation: 'fadeIn 0.3s ease' }}>
                                                <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>Words you've seen with this Kanji:</p>
                                                {isFetchingWords ? (
                                                    <p style={{ fontSize: '0.85rem' }}>Searching your vocabulary...</p>
                                                ) : relatedWords.length > 0 ? (
                                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                                                        {relatedWords.map((rw: any) => (
                                                            <div key={rw.id} className="glass-panel" style={{ padding: '0.4rem 0.8rem', fontSize: '0.9rem', background: 'rgba(99, 102, 241, 0.15)', borderColor: 'var(--brand-primary)' }}>
                                                                <span style={{ fontWeight: 600 }}>{rw.dictionary_form}</span>
                                                                <span style={{ color: 'var(--text-secondary)', marginLeft: '0.4rem', fontSize: '0.75rem' }}>({rw.meaning.split(',')[0]})</span>
                                                            </div>
                                                        ))}
                                                    </div>
                                                ) : (
                                                    <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>No other words encountered yet.</p>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </div>
                        <button className="btn" style={{ marginTop: '2rem', width: '100%' }} onClick={() => setSelectedKanji(null)}>Close</button>
                    </div>
                </>,
                document.body
            )}

            {isMobile && isChatDrawerOpen && ReactDOM.createPortal(
                <div 
                    style={{ 
                        position: 'fixed', 
                        bottom: 0, 
                        left: 0, 
                        width: '100%', 
                        height: '75vh', 
                        background: 'var(--bg-secondary)', 
                        zIndex: 2000, 
                        borderTopLeftRadius: '24px', 
                        borderTopRightRadius: '24px',
                        borderTop: '2px solid var(--brand-primary)',
                        display: 'flex',
                        flexDirection: 'column',
                        padding: '1.5rem',
                        boxShadow: '0 -10px 40px rgba(0,0,0,0.5)',
                        animation: 'slideUp 0.4s cubic-bezier(0.16, 1, 0.3, 1)'
                    }}
                >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <div style={{ width: '40px', height: '4px', background: 'rgba(255,255,255,0.2)', borderRadius: '2px', position: 'absolute', top: '10px', left: 'calc(50% - 20px)' }} />
                            <h3 className="title-gradient" style={{ margin: 0 }}>AI Tutor</h3>
                        </div>
                        <div style={{ display: 'flex', gap: '1rem' }}>
                            {activeLineChatIdx !== null && chatHistory.length > 0 && (
                                <button
                                    className="btn btn-outline"
                                    style={{ padding: '0.4rem 0.8rem', fontSize: '0.7rem', display: 'flex', alignItems: 'center', gap: '0.3rem' }}
                                    onClick={refreshChat}
                                >
                                    <RefreshCw size={12} /> Restart
                                </button>
                            )}
                            <button 
                                onClick={() => setIsChatDrawerOpen(false)}
                                style={{ background: 'rgba(255,255,255,0.05)', border: 'none', borderRadius: '50%', width: '32px', height: '32px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white' }}
                            >
                                <X size={20} />
                            </button>
                        </div>
                    </div>

                    <div style={{ flex: 1, overflowY: 'auto', marginBottom: '1rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                        {activeLineChatIdx === null ? (
                            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-secondary)', textAlign: 'center' }}>
                                Select a line to start learning.
                            </div>
                        ) : (
                            chatHistory.filter(msg => msg.role !== 'system' && msg.content && msg.content.trim()).map((msg, idx) => (
                                <div key={idx} style={{
                                    alignSelf: msg.role === 'user' ? 'flex-end' : 'flex-start',
                                    background: msg.role === 'user' ? 'rgba(99, 102, 241, 0.2)' : 'rgba(255,255,255,0.05)',
                                    padding: '0.75rem 1rem',
                                    borderRadius: '8px',
                                    maxWidth: '85%',
                                    border: msg.role === 'user' ? '1px solid rgba(99, 102, 241, 0.3)' : '1px solid var(--glass-border)',
                                    fontSize: '0.9rem',
                                    lineHeight: 1.5,
                                    whiteSpace: 'pre-wrap'
                                }}>
                                    {msg.content}
                                </div>
                            ))
                        )}
                        {chatLoading && <div style={{ color: 'var(--brand-primary)', fontSize: '0.9rem' }}>Typing...</div>}
                        <div ref={chatEndRef} />
                    </div>

                    <form
                        style={{ display: 'flex', gap: '0.5rem' }}
                        onSubmit={(e) => {
                            e.preventDefault();
                            if (activeLineChatIdx !== null) requestChat(activeLineChatIdx, chatInput);
                        }}
                    >
                        <input
                            className="glass-input"
                            style={{ flex: 1, padding: '0.75rem' }}
                            type="text"
                            placeholder="Message tutor..."
                            value={chatInput}
                            onChange={(e) => setChatInput(e.target.value)}
                        />
                        <button type="submit" className="btn" style={{ padding: '0.75rem' }}>
                            Send
                        </button>
                    </form>
                </div>,
                document.body
            )}
        </div>
    );
};
