import { apiPath } from "./api";
import { useState, useEffect, useContext } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { AuthContext } from './Auth';
import { ArrowLeft, Search, Music, BookOpen } from 'lucide-react';

export const VocabularyBank = () => {
    const { token, setToken } = useContext(AuthContext);
    const navigate = useNavigate();
    const location = useLocation();
    
    // Parse filters from URL if available
    const queryParams = new URLSearchParams(location.search);
    const songsStr = queryParams.get('songs');
    const initialSongs = (songsStr && songsStr !== '') ? songsStr.split(',').map(Number).filter(id => !isNaN(id) && id > 0) : [];
    const initialSeen = queryParams.get('seen') !== 'false';
    const initialLearned = queryParams.get('learned') !== 'false';

    const [loading, setLoading] = useState(true);
    const [words, setWords] = useState<any[]>([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [isMobile] = useState(window.innerWidth < 768);

    useEffect(() => {
        if (!token) return;
        setLoading(true);
        
        const params = new URLSearchParams();
        if (initialSongs.length > 0) {
            params.append('song_ids', initialSongs.join(','));
        }
        params.append('include_seen', String(initialSeen));
        params.append('include_learned', String(initialLearned));

        fetch(apiPath(`/api/vocabulary/bank?${params.toString()}`), {
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
            setWords(data.words || []);
            setLoading(false);
        })
        .catch(e => {
            console.error(e);
            setLoading(false);
        });
    }, [token, setToken]);

    const filteredWords = words.filter(w => 
        w.surface.toLowerCase().includes(searchTerm.toLowerCase()) ||
        w.meaning.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (w.reading && w.reading.toLowerCase().includes(searchTerm.toLowerCase()))
    );

    if (loading) return <div className="page-enter" style={{padding: '3rem', textAlign: 'center'}}>Loading vocabulary corpus...</div>;

    return (
        <div className="page-enter">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem', flexDirection: isMobile ? 'column' : 'row', gap: '1rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    <button 
                        className="btn btn-outline" 
                        style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}
                        onClick={() => navigate(-1)}
                    >
                        <ArrowLeft size={18} /> Back
                    </button>
                    <div>
                        <h1 className="hero-title" style={{ margin: 0 }}>Vocabulary Bank</h1>
                        <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>Showing {filteredWords.length} words from your library</p>
                    </div>
                </div>

                <div style={{ position: 'relative', width: isMobile ? '100%' : '300px' }}>
                    <Search style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} size={18} />
                    <input 
                        className="glass-input"
                        style={{ width: '100%', paddingLeft: '40px' }}
                        placeholder="Search word, meaning..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>
            </div>

            {filteredWords.length === 0 ? (
                <div className="glass-panel" style={{ padding: '4rem', textAlign: 'center' }}>
                    <BookOpen size={48} style={{ color: 'var(--text-muted)', marginBottom: '1rem', opacity: 0.5 }} />
                    <h3>No words found</h3>
                    <p style={{ color: 'var(--text-secondary)' }}>Try adjusting your search or filters.</p>
                </div>
            ) : (
                <div className="selection-grid">
                    {filteredWords.map((w: any) => (
                        <div 
                            key={w.id} 
                            className="glass-panel hover-bright" 
                            style={{ 
                                padding: '1.5rem', 
                                borderLeft: `4px solid ${w.status === 'LEARNED' ? 'var(--success)' : 'var(--brand-primary)'}`,
                                cursor: 'pointer',
                                display: 'flex',
                                flexDirection: 'column',
                                gap: '0.75rem'
                            }}
                            onClick={() => navigate(`/kanji/${w.surface[0]}`)} // Generic jump to first kanji explorer
                        >
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                <div>
                                    <h3 style={{ fontSize: '1.4rem', margin: 0 }}>{w.surface}</h3>
                                    <p style={{ color: 'var(--brand-secondary)', fontSize: '0.9rem', fontWeight: 600 }}>{w.reading}</p>
                                </div>
                                <span style={{ 
                                    fontSize: '0.65rem', 
                                    padding: '0.2rem 0.6rem', 
                                    borderRadius: '20px', 
                                    background: w.status === 'LEARNED' ? 'rgba(16, 185, 129, 0.1)' : 'rgba(255,255,255,0.05)', 
                                    color: w.status === 'LEARNED' ? 'var(--success)' : 'var(--text-secondary)', 
                                    textTransform: 'uppercase', 
                                    letterSpacing: '0.05em',
                                    fontWeight: 700
                                }}>
                                    {w.status}
                                </span>
                            </div>

                            <p style={{ fontSize: '0.95rem', lineHeight: 1.4, color: 'var(--text-primary)' }}>{w.meaning}</p>

                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', marginTop: 'auto', paddingTop: '0.5rem', borderTop: '1px solid var(--glass-border)' }}>
                                {w.songs?.slice(0, 3).map((s: any) => (
                                    <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.7rem', color: 'var(--text-secondary)', background: 'rgba(255,255,255,0.03)', padding: '0.2rem 0.5rem', borderRadius: '4px' }}>
                                        <Music size={10} />
                                        <span style={{ maxWidth: '80px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.title}</span>
                                    </div>
                                ))}
                                {w.songs?.length > 3 && <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>+{w.songs.length - 3} more</span>}
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};
