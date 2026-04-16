import { apiPath } from "./api";
import { useState, useEffect, useContext } from 'react';
import { AuthContext } from './Auth';
import { Zap, Trophy, HelpCircle } from 'lucide-react';

export const StatsDashboard = () => {
    const { token, setToken } = useContext(AuthContext);
    const [stats, setStats] = useState<any>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!token) return;
        setLoading(true);
        fetch(apiPath('/api/stats'), {
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
            setStats(data);
            setLoading(false);
        })
        .catch(e => {
            console.error(e);
            setLoading(false);
        });
    }, [token]);

    const totalWords = stats ? (stats.seen + stats.learning + stats.mastered) : 0;
    
    // Percentages for the progress bar
    const seenPct = totalWords > 0 ? (stats.seen / totalWords) * 100 : 0;
    const learningPct = totalWords > 0 ? (stats.learning / totalWords) * 100 : 0;
    const masteredPct = totalWords > 0 ? (stats.mastered / totalWords) * 100 : 0;

    if (loading) {
        return (
            <div className="page-enter" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '60vh' }}>
                <div className="spinner" style={{ width: '50px', height: '50px', border: '3px solid var(--glass-border)', borderTopColor: 'var(--brand-primary)', borderRadius: '50%', animation: 'spin 1s linear infinite' }}></div>
                <h2 style={{ marginTop: '2rem' }}>Calculating progress...</h2>
            </div>
        );
    }

    return (
        <div className="page-enter" style={{ maxWidth: '1000px', margin: '0 auto' }}>
            <div style={{ textAlign: 'center', marginBottom: '3rem' }}>
                <h1 className="title-gradient hero-title" style={{ fontSize: '3rem', marginBottom: '1rem' }}>Your Vocabulary Journey</h1>
                <p className="hero-subtitle" style={{ color: 'var(--text-secondary)', fontSize: '1.2rem' }}>Tracking your path from first encounter to long-term memory</p>
            </div>

            {/* Vocabulary Pipeline Visualization */}
            <div className="glass-panel" style={{ padding: '2.5rem', marginBottom: '3rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '1rem' }}>
                    <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        Vocabulary Pipeline
                    </h3>
                    <div style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>
                        Total Words Encountered: <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{totalWords}</span>
                    </div>
                </div>

                {/* Multi-segment Progress Bar */}
                <div style={{ 
                    height: '24px', 
                    width: '100%', 
                    background: 'rgba(255,255,255,0.05)', 
                    borderRadius: '12px', 
                    overflow: 'hidden', 
                    display: 'flex',
                    marginBottom: '2rem',
                    boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.2)'
                }}>
                    <div title={`Seen: ${stats.seen}`} style={{ width: `${seenPct}%`, background: 'rgba(255,255,255,0.15)', height: '100%', transition: 'width 1s ease-out' }} />
                    <div title={`Learning: ${stats.learning}`} style={{ width: `${learningPct}%`, background: 'var(--brand-primary)', height: '100%', transition: 'width 1s ease-out', boxShadow: '0 0 20px rgba(99, 102, 241, 0.4)' }} />
                    <div title={`Mastered: ${stats.mastered}`} style={{ width: `${masteredPct}%`, background: 'var(--success)', height: '100%', transition: 'width 1s ease-out', boxShadow: '0 0 20px rgba(16, 185, 129, 0.4)' }} />
                </div>

                {/* Legend / Breakdown */}
                <div className="stats-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '2rem' }}>
                    <div style={{ borderLeft: '3px solid rgba(255,255,255,0.2)', paddingLeft: '1rem' }}>
                        <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '0.25rem' }}>Stage 1</div>
                        <div style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: '0.25rem' }}>{stats.seen}</div>
                        <div style={{ color: 'var(--text-secondary)', fontWeight: 600, fontSize: '0.9rem' }}>Seen</div>
                    </div>
                    <div style={{ borderLeft: '3px solid var(--brand-primary)', paddingLeft: '1rem' }}>
                        <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '0.25rem' }}>Stage 2</div>
                        <div style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: '0.25rem' }}>{stats.learning}</div>
                        <div style={{ color: 'var(--brand-primary)', fontWeight: 600, fontSize: '0.9rem' }}>Learning</div>
                    </div>
                    <div style={{ borderLeft: '3px solid var(--success)', paddingLeft: '1rem' }}>
                        <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '0.25rem' }}>Stage 3</div>
                        <div style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: '0.25rem' }}>{stats.mastered}</div>
                        <div style={{ color: 'var(--success)', fontWeight: 600, fontSize: '0.9rem' }}>Mastered</div>
                    </div>
                </div>
            </div>

            {/* Descriptive Cards */}
            <div className="info-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem' }}>
                <div className="glass-panel" style={{ padding: '2rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem' }}>
                        <div style={{ background: 'rgba(99, 102, 241, 0.15)', padding: '0.5rem', borderRadius: '8px' }}>
                            <Zap size={20} color="var(--brand-primary)" />
                        </div>
                        <h3 style={{ margin: 0 }}>Words Learning</h3>
                    </div>
                    <p style={{ color: 'var(--text-secondary)', fontSize: '0.95rem', lineHeight: 1.6 }}>
                        These are words you've actively initiated in the Spaced Repetition System. By marking them "Easy" or "Hard" in your flashcard sessions, you've moved them beyond the initial encounter stage and into active study.
                    </p>
                </div>

                <div className="glass-panel" style={{ padding: '2rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem' }}>
                        <div style={{ background: 'rgba(16, 185, 129, 0.15)', padding: '0.5rem', borderRadius: '8px' }}>
                            <Trophy size={20} color="var(--success)" />
                        </div>
                        <h3 style={{ margin: 0 }}>Words Mastered</h3>
                    </div>
                    <p style={{ color: 'var(--text-secondary)', fontSize: '0.95rem', lineHeight: 1.6 }}>
                        Mastery represents long-term retention. A word only reaches this status once its review interval exceeds <strong>21 days</strong>, demonstrating that it has successfully moved into your permanent vocabulary memory.
                    </p>
                </div>
            </div>

            <div className="glass-panel" style={{ marginTop: '3rem', padding: '2rem', display: 'flex', gap: '1.5rem', alignItems: 'flex-start' }}>
                <div style={{ background: 'rgba(255,255,255,0.05)', padding: '0.75rem', borderRadius: '50%' }}>
                    <HelpCircle size={24} color="var(--text-muted)" />
                </div>
                <div>
                    <h4 style={{ margin: '0 0 0.5rem 0' }}>Why do I have 0 Mastered words?</h4>
                    <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', lineHeight: 1.6, margin: 0 }}>
                        Mastery is a measure of time and consistency. Even if you mark a word as "Easy" today, it needs several successful reviews over multiple weeks to prove it's mastered. Keep reviewing, and your "Learning" words will eventually graduate to "Mastered"!
                    </p>
                </div>
            </div>
            
            <style>{`
                @keyframes spin { to { transform: rotate(360deg); } }
            `}</style>
        </div>
    );
};
