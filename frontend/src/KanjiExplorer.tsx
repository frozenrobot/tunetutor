import { apiPath } from "./api";
import React, { useState, useEffect, useContext } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { AuthContext } from './Auth';
import { ArrowLeft, Music, Bookmark, ChevronRight } from 'lucide-react';

export const KanjiExplorer = () => {
    const { character } = useParams();
    const navigate = useNavigate();
    const { token, setToken } = useContext(AuthContext);

    const [loading, setLoading] = useState(true);
    const [data, setData] = useState<any>(null);
    const [isMobile, setIsMobile] = useState(window.innerWidth < 768);

    useEffect(() => {
        const handleResize = () => setIsMobile(window.innerWidth < 768);
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    useEffect(() => {
        if (!token || !character) return;
        setLoading(true);
        fetch(apiPath(`/api/kanji/${character}/words`), {
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
            setData(data);
            setLoading(false);
        })
        .catch(e => {
            console.error(e);
            setLoading(false);
        });
    }, [character, token, setToken]);

    if (loading) return <div className="page-enter" style={{padding: '3rem', textAlign: 'center'}}>Loading contextual data for {character}...</div>;
    if (!data) return <div style={{padding: '3rem'}}>Failed to load Kanji data.</div>;

    return (
        <div className="page-enter">
            <button 
                className="btn btn-outline" 
                style={{marginBottom: '2rem', display: 'flex', alignItems: 'center', gap: '0.5rem'}}
                onClick={() => navigate(-1)}
            >
                <ArrowLeft size={18} /> Back
            </button>

            <div style={{
                display: 'flex', 
                flexDirection: isMobile ? 'column' : 'row', 
                gap: isMobile ? '1rem' : '2rem',
                alignItems: isMobile ? 'stretch' : 'flex-start'
            }}>
                {/* Kanji Information */}
                <div style={{ flex: isMobile ? 'none' : '0 0 35%' }}>
                    <div className="glass-panel" style={{ 
                        padding: isMobile ? '1.5rem' : '3rem', 
                        textAlign: 'center', 
                        display: 'flex', 
                        flexDirection: 'column', 
                        alignItems: 'center', 
                        position: isMobile ? 'relative' : 'sticky', 
                        top: isMobile ? '0' : '2rem' 
                    }}>
                        <h1 style={{ 
                            fontSize: isMobile ? '5rem' : '8.5rem', 
                            margin: '0 0 0.5rem 0', 
                            color: 'var(--brand-primary)', 
                            lineHeight: 1 
                        }}>{data.character}</h1>
                        <h2 style={{ fontSize: isMobile ? '1.4rem' : '1.8rem', marginBottom: '0.5rem' }}>{data.meaning}</h2>
                        {data.radicals && (
                            <p style={{ color: 'var(--text-secondary)', marginBottom: isMobile ? '1rem' : '2rem', fontSize: isMobile ? '0.9rem' : '1.1rem' }}>Radicals: {data.radicals}</p>
                        )}
                        
                        <div style={{ 
                            width: '100%', 
                            borderTop: '1px solid var(--glass-border)', 
                            paddingTop: isMobile ? '1rem' : '2rem', 
                            display: 'flex', 
                            flexDirection: 'column', 
                            gap: isMobile ? '0.75rem' : '1.5rem' 
                        }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <span style={{ color: 'var(--text-secondary)', fontSize: isMobile ? '0.85rem' : '1rem' }}>Words Discovered</span>
                                <span style={{ fontWeight: 700, fontSize: isMobile ? '1rem' : '1.2rem' }}>{data.words.length}</span>
                            </div>
                            <p style={{ fontSize: isMobile ? '0.75rem' : '0.85rem', color: 'var(--text-muted)', textAlign: 'left', lineHeight: 1.5 }}>
                                Showing encounter vocabulary. Tap a card to jump to the song line.
                            </p>
                        </div>
                    </div>
                </div>

                {/* Encountered Vocabulary Grid */}
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: isMobile ? '1rem' : '2rem' }}>
                    {data.words.length === 0 ? (
                        <div className="glass-panel" style={{padding: '3rem', textAlign: 'center'}}>
                            <p style={{color: 'var(--text-secondary)'}}>You haven't processed any songs containing this Kanji yet.</p>
                        </div>
                    ) : (
                        data.words.map((w: any) => (
                            <div 
                                key={w.id} 
                                className="glass-panel" 
                                style={{
                                    padding: isMobile ? '1.25rem' : '2rem', 
                                    borderLeft: '4px solid var(--brand-primary)',
                                    background: 'rgba(99, 102, 241, 0.03)',
                                    display: 'flex',
                                    flexDirection: 'column',
                                    gap: isMobile ? '1rem' : '1.5rem'
                                }}
                            >
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                    <div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.25rem' }}>
                                            <span style={{ fontSize: isMobile ? '1.5rem' : '2rem', fontWeight: 700 }}>{w.dictionary_form}</span>
                                            {w.status === 'LEARNED' && <Bookmark size={isMobile ? 16 : 20} color="var(--brand-secondary)" fill="var(--brand-secondary)" />}
                                        </div>
                                        <p style={{ fontSize: isMobile ? '0.9rem' : '1.1rem', color: 'var(--brand-secondary)', fontWeight: 500 }}>{w.reading}</p>
                                    </div>
                                    <div style={{ textAlign: 'right' }}>
                                        <span style={{ fontSize: '0.65rem', padding: '0.2rem 0.6rem', borderRadius: '20px', background: 'rgba(255,255,255,0.05)', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                            {w.status}
                                        </span>
                                    </div>
                                </div>
                                
                                <p style={{ fontSize: isMobile ? '0.95rem' : '1.1rem', lineHeight: 1.4 }}>{w.meaning}</p>
                                
                                {/* Contextual Occurrences */}
                                <div style={{background: 'rgba(0,0,0,0.15)', borderRadius: '12px', padding: '1.25rem'}}>
                                    <h4 style={{fontSize: '0.8rem', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '1rem', letterSpacing: '0.05em'}}>Where you saw this:</h4>
                                    <div style={{display: 'flex', flexDirection: 'column', gap: '0.75rem'}}>
                                        {w.contexts && w.contexts.length > 0 ? (
                                            w.contexts.map((ctx: any, idx: number) => (
                                                <div 
                                                    key={idx} 
                                                    className="hover-bright"
                                                    style={{
                                                        padding: '1rem', 
                                                        background: 'rgba(255,255,255,0.03)', 
                                                        borderRadius: '8px', 
                                                        border: '1px solid var(--glass-border)',
                                                        cursor: 'pointer',
                                                        display: 'flex',
                                                        justifyContent: 'space-between',
                                                        alignItems: 'center'
                                                    }}
                                                    onClick={() => {
                                                        const currentUrl = encodeURIComponent(window.location.pathname + window.location.search);
                                                        navigate(`/viewer/${ctx.song_id}?line=${ctx.line_index}&fromFlashcards=true&returnTo=${currentUrl}`);
                                                    }}
                                                >
                                                    <div style={{flex: 1}}>
                                                        <div style={{display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.3rem'}}>
                                                            <Music size={14} color="var(--brand-primary)" />
                                                            <span style={{fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)'}}>{ctx.song_title}</span>
                                                        </div>
                                                        <p style={{fontSize: '1rem', color: 'var(--text-primary)'}}>{ctx.line_text}</p>
                                                    </div>
                                                    <ChevronRight size={18} color="var(--text-muted)" />
                                                </div>
                                            ))
                                        ) : (
                                            <p style={{fontSize: '0.9rem', color: 'var(--text-muted)'}}>No specific line recorded.</p>
                                        )}
                                    </div>
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </div>
        </div>
    );
};
