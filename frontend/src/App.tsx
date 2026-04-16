import { useState, useEffect, useContext } from 'react';
import { BrowserRouter, Routes, Route, Link, NavLink, Navigate, useNavigate } from 'react-router-dom';
import { Music, Settings, Search, Trash2, AlertCircle, BarChart3, Layers, Compass, User } from 'lucide-react';
import { AuthView, AuthContext } from './Auth';
import { SongViewer } from './SongViewer';
import { StatsDashboard } from './Stats';
import { FlashcardsArea } from './Flashcards';
import { SettingsPage } from './Settings';
import { VocabularyBank } from './VocabularyBank';
import { KanjiExplorer } from './KanjiExplorer';
import { SettingsProvider } from './SettingsContext';
import { apiPath } from './api';
import './index.css';

const ConfirmationModal = ({ isOpen, onClose, onConfirm, title, message }: any) => {
  if (!isOpen) return null;
  return (
    <>
      <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 1000, backdropFilter: 'blur(4px)' }} onClick={onClose} />
      <div className="glass-panel" style={{
        position: 'fixed',
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        zIndex: 1001,
        width: '90%',
        maxWidth: '450px',
        padding: '2rem',
        animation: 'fadeIn 0.2s ease-out'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1.5rem', color: 'var(--danger)' }}>
          <AlertCircle size={28} />
          <h2 style={{ margin: 0, fontSize: '1.5rem' }}>{title}</h2>
        </div>
        <p style={{ color: 'var(--text-secondary)', lineHeight: 1.6, marginBottom: '2rem' }}>{message}</p>
        <div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end' }}>
          <button className="btn btn-outline" onClick={onClose}>Cancel</button>
          <button className="btn" style={{ background: 'var(--danger)', borderColor: 'var(--danger)' }} onClick={onConfirm}>Remove Song</button>
        </div>
      </div>
    </>
  );
};

const Home = () => {
  const [songs, setSongs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const { token } = useContext(AuthContext);
  const navigate = useNavigate();

  // Modal State
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);

  const fetchSongs = () => {
    if (!token) return;
    setLoading(true);
    fetch(apiPath('/api/songs'), {
      headers: { 'Authorization': `Bearer ${token}` }
    })
      .then(r => r.json())
      .then(data => {
        setSongs(data);
        setLoading(false);
      })
      .catch(e => {
        console.error(e);
        setLoading(false);
      });
  };

  useEffect(() => {
    fetchSongs();
  }, [token]);

  const removeFromLibrary = async (songId: number) => {
    if (!token) return;
    try {
      const res = await fetch(apiPath(`/api/songs/${songId}/library`), {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        fetchSongs();
        setConfirmDeleteId(null);
      }
    } catch (e) {
      console.error("Failed to remove song", e);
    }
  };

  const getYoutubeThumbnail = (url: string) => {
    if (!url) return '';
    const match = url.match(/v=([a-zA-Z0-9_-]{11})/);
    return match ? `https://img.youtube.com/vi/${match[1]}/hqdefault.jpg` : '';
  };

  const filteredSongs = songs.filter(s =>
    s.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    s.artist.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const librarySongs = filteredSongs.filter(s => s.status !== null);
  const discoverSongs = filteredSongs.filter(s => s.status === null);

  const SongCard = ({ song, isLibrary }: { song: any, isLibrary: boolean }) => {
    const progress = song.total_lines > 0 ? (song.seen_count / song.total_lines) * 100 : 0;

    return (
      <div
        className="glass-panel song-card"
        onClick={() => navigate(`/viewer/${song.id}`)}
        style={{ padding: 0, display: 'flex', flexDirection: 'column', position: 'relative', overflow: 'hidden' }}
      >
        <div style={{
          height: '160px',
          backgroundImage: song.youtube_url ? `url(${getYoutubeThumbnail(song.youtube_url)})` : 'linear-gradient(45deg, var(--bg-tertiary), var(--bg-secondary))',
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          position: 'relative'
        }}>
          {song.status === 'COMPLETED' && <span className="song-status status-completed" style={{ zIndex: 2 }}>Completed</span>}
          {song.status === 'IN_PROGRESS' && <span className="song-status" style={{ zIndex: 2 }}>In Progress</span>}

          {isLibrary && (
            <div style={{
              position: 'absolute',
              bottom: 0,
              left: 0,
              width: '100%',
              height: '4px',
              background: 'rgba(255,255,255,0.1)',
              zIndex: 3
            }}>
              <div style={{
                width: `${progress}%`,
                height: '100%',
                background: 'var(--brand-primary)',
                boxShadow: '0 0 10px var(--brand-primary)',
                transition: 'width 0.5s ease-in-out'
              }} />
            </div>
          )}
        </div>

        <div style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', flex: 1, gap: '0.4rem', position: 'relative' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div style={{ flex: 1 }}>
              <h3 style={{ fontSize: '1.2rem', margin: 0 }}>{song.title}</h3>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: '1rem', marginTop: '0.2rem' }}>{song.artist}</p>
            </div>

            {isLibrary && (
              <button
                className="delete-card-btn"
                style={{
                  background: 'rgba(255,255,255,0.05)',
                  border: 'none',
                  borderRadius: '8px',
                  width: '36px',
                  height: '36px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'var(--text-muted)',
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                  marginTop: '-0.2rem'
                }}
                onClick={(e) => {
                  e.stopPropagation();
                  setConfirmDeleteId(song.id);
                }}
                title="Remove from Library"
              >
                <Trash2 size={18} />
              </button>
            )}
          </div>

          {isLibrary && (
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>
              {song.seen_count} / {song.total_lines} lines mastered
            </div>
          )}

          <button
            className={`btn ${isLibrary ? '' : 'btn-outline'}`}
            style={{ marginTop: 'auto', width: '100%', fontSize: '0.9rem', padding: '0.6rem' }}
            onClick={(e) => { e.stopPropagation(); navigate(`/viewer/${song.id}`); }}
          >
            {isLibrary ? 'Continue Session' : 'Process Song'}
          </button>
        </div>
      </div>
    );
  };

  const selectedSongToDelete = songs.find(s => s.id === confirmDeleteId);

  if (loading && songs.length === 0) {
    return (
      <div className="page-enter" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '60vh' }}>
        <div className="spinner" style={{ width: '60px', height: '60px', border: '3px solid var(--glass-border)', borderTopColor: 'var(--brand-primary)', borderRadius: '50%', animation: 'spin 1s linear infinite' }}></div>
      </div>
    );
  }

  return (
    <>
      <ConfirmationModal
        isOpen={confirmDeleteId !== null}
        onClose={() => setConfirmDeleteId(null)}
        onConfirm={() => confirmDeleteId && removeFromLibrary(confirmDeleteId)}
        title="Remove from Library?"
        message={selectedSongToDelete ? `This will remove "${selectedSongToDelete.title}" and erase your SRS progress for all vocabulary unique to this song. Shared words will be preserved.` : ""}
      />
      <div className="page-enter" style={{ maxWidth: '1200px', margin: '0 auto' }}>
      <div style={{ marginBottom: '4rem', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: '2rem' }}>
        <div>
          <h1 className="title-gradient" style={{ fontSize: '3.5rem', marginBottom: '1rem', lineHeight: 1.1 }}>
            Unlock Japanese <br />through Music
          </h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '1.1rem', maxWidth: '600px', margin: 0 }}>
            Learn vocabulary and grammar intuitively by processing real song lyrics. Your library grows as you explore.
          </p>
        </div>

        {/* Search Bar */}
        <div style={{ position: 'relative', width: '100%', maxWidth: '400px' }}>
          <Search size={20} style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
          <input
            type="text"
            placeholder="Search by title or artist..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="glass-input"
            style={{ paddingLeft: '3rem', width: '100%' }}
          />
        </div>
      </div>

      {librarySongs.length > 0 && (
        <section style={{ marginBottom: '4rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '2rem' }}>
            <h2 style={{ margin: 0, fontSize: '1.75rem' }}>Your Library</h2>
            <div style={{ height: '1px', flex: 1, background: 'linear-gradient(90deg, var(--glass-border), transparent)' }} />
          </div>
          <div className="song-grid">
            {librarySongs.map(s => <SongCard key={s.id} song={s} isLibrary={true} />)}
          </div>
        </section>
      )}

      <section>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '2rem' }}>
          <h2 style={{ margin: 0, fontSize: '1.75rem' }}>Discover New Songs</h2>
          <div style={{ height: '1px', flex: 1, background: 'linear-gradient(90deg, var(--glass-border), transparent)' }} />
        </div>
        <div className="song-grid">
          {discoverSongs.map(s => <SongCard key={s.id} song={s} isLibrary={false} />)}
        </div>
      </section>

      <style>{`
        .delete-card-btn:hover { background: #ff4d4f !important; color: white !important; transform: scale(1.1); }
      `}</style>
    </div>
    </>
  );
};

const Navigation = ({ onLogout }: { onLogout: () => void }) => {
  return (
    <>
      {/* Desktop & Mobile Brand Header */}
      <nav className="navbar">
        <Link to="/" className="nav-brand title-gradient">
          <Music size={28} color="var(--brand-primary)" />
          Lyvo
        </Link>
        <div className="nav-links">
          <NavLink to="/" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>Explore</NavLink>
          <NavLink to="/stats" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>My Progress</NavLink>
          <NavLink to="/flashcards" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>Flashcards</NavLink>
          <NavLink to="/settings" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
            <Settings size={18} style={{ verticalAlign: 'middle', marginRight: '4px' }} />
            Profile & Settings
          </NavLink>
          <button onClick={onLogout} className="btn btn-outline" style={{ padding: '5px 15px' }}>Logout</button>
        </div>
      </nav>

      {/* Mobile Bottom Navigation Bar */}
      {window.innerWidth < 768 && (
        <nav className="mobile-bottom-nav">
          <NavLink to="/" className={({ isActive }) => `mobile-nav-item ${isActive ? 'active' : ''}`}>
            <Compass />
            <span>Explore</span>
          </NavLink>
          <NavLink to="/stats" className={({ isActive }) => `mobile-nav-item ${isActive ? 'active' : ''}`}>
            <BarChart3 />
            <span>Stats</span>
          </NavLink>
          <NavLink to="/flashcards" className={({ isActive }) => `mobile-nav-item ${isActive ? 'active' : ''}`}>
            <Layers />
            <span>Cards</span>
          </NavLink>
          <NavLink to="/settings" className={({ isActive }) => `mobile-nav-item ${isActive ? 'active' : ''}`}>
            <User />
            <span>Profile</span>
          </NavLink>
        </nav>
      )}
    </>
  );
};

function App() {
  const [token, setToken] = useState<string | null>(localStorage.getItem("lyvo_token"));

  // Check for special URL tokens on mount that require AuthView handling
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('verify_token') || params.get('reset_token') || params.get('email_change_token')) {
      // If we have a verification or reset token, we must show the AuthView
      // even if we have a saved token, otherwise the user won't see the feedback.
      setToken(null);
    }
  }, []);

  const login = (newToken: string) => {
    setToken(newToken);
    localStorage.setItem("lyvo_token", newToken);
  };
  const logout = () => {
    setToken(null);
    localStorage.removeItem("lyvo_token");
  };

  if (!token) {
    return <AuthView onLogin={login} />;
  }

  return (
    <AuthContext.Provider value={{ token, setToken }}>
      <SettingsProvider>
        <BrowserRouter>
          <div className="app-container">
            <Navigation onLogout={logout} />
            <main className="content">
              <Routes>
                <Route path="/" element={<Home />} />
                <Route path="/viewer/:id" element={<SongViewer />} />
                <Route path="/stats" element={<StatsDashboard />} />
                <Route path="/flashcards" element={<FlashcardsArea />} />
                <Route path="/vocabulary-bank" element={<VocabularyBank />} />
                <Route path="/settings" element={<SettingsPage />} />
                <Route path="/kanji/:character" element={<KanjiExplorer />} />
                <Route path="*" element={<Navigate to="/" />} />
              </Routes>
            </main>
          </div>
        </BrowserRouter>
      </SettingsProvider>
    </AuthContext.Provider>
  );
}

export default App;
