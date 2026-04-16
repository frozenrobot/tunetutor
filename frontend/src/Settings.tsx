import { apiPath } from "./api";
import React, { useState, useEffect, useContext } from 'react';
import { useSettings, ReadingFormat } from './SettingsContext';
import { AuthContext } from './Auth';
import { Settings as SettingsIcon, User, Mail, Lock, Trash2, LogOut, CheckCircle, AlertCircle } from 'lucide-react';

const FORMAT_OPTIONS: { value: ReadingFormat; label: string; example: string }[] = [
    { value: 'hiragana', label: 'Hiragana', example: 'ひらがな' },
    { value: 'katakana', label: 'Katakana', example: 'カタカナ' },
    { value: 'romaji', label: 'Romaji', example: 'romaji' },
];

export const SettingsPage = () => {
    const { token, setToken } = useContext(AuthContext);
    const { readingFormat, setReadingFormat } = useSettings();

    const [userData, setUserData] = useState<any>(null);
    const [editName, setEditName] = useState("");
    const [editEmail, setEditEmail] = useState("");
    
    const [currentPassword, setCurrentPassword] = useState("");
    const [newPassword, setNewPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");

    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const [success, setSuccess] = useState("");

    useEffect(() => {
        if (token) fetchUser();
    }, [token]);

    const fetchUser = async () => {
        try {
            const res = await fetch("http://127.0.0.1:8000/api/user/me", {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const data = await res.json();
            if (res.ok) {
                setUserData(data);
                setEditName(data.username);
                setEditEmail(data.email);
            }
        } catch (e) {
            console.error(e);
        }
    };

    const handleUpdateProfile = async (e: React.FormEvent) => {
        e.preventDefault();
        setError("");
        setSuccess("");
        setLoading(true);
        try {
            const res = await fetch("http://127.0.0.1:8000/api/user/me", {
                method: "PUT",
                headers: { 
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ username: editName, email: editEmail })
            });
            const data = await res.json();
            if (res.ok) {
                const emailChanged = data.email !== userData?.email; // This will actually be false if backend didn't update yet
                // However, our backend returns the current_user object which hasn't changed email yet but has pending_email.
                // Let's check if the input email is different from current email
                
                if (editEmail !== userData?.email && editName !== userData?.username) {
                    setSuccess("Username updated! A verification link has been sent to your new email address. Please click it to finalize the email change.");
                } else if (editEmail !== userData?.email) {
                    setSuccess("Verification link sent! Please check your new email address to confirm the change.");
                } else if (editName !== userData?.username) {
                    setSuccess("Username updated successfully!");
                } else {
                    setSuccess("No changes were made.");
                }
                
                setUserData(data);
                fetchUser(); // Refresh local state
            } else {
                setError(data.detail || "Update failed");
            }
        } catch (e) {
            setError("Network error");
        } finally {
            setLoading(false);
        }
    };

    const handleChangePassword = async (e: React.FormEvent) => {
        e.preventDefault();
        setError("");
        setSuccess("");
        if (newPassword !== confirmPassword) {
            setError("New passwords do not match");
            return;
        }
        setLoading(true);
        try {
            const res = await fetch(apiPath("/api/user/password"), {
                method: "PATCH",
                headers: { 
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ current_password: currentPassword, new_password: newPassword })
            });
            const data = await res.json();
            if (res.ok) {
                setSuccess("Password changed successfully!");
                setCurrentPassword("");
                setNewPassword("");
                setConfirmPassword("");
            } else {
                setError(data.detail || "Password change failed");
            }
        } catch (e) {
            setError("Network error");
        } finally {
            setLoading(false);
        }
    };

    const handleDeleteAccount = async () => {
        if (!window.confirm("ARE YOU SURE? This will permanently delete your account and all learning progress. This cannot be undone.")) return;
        
        try {
            const res = await fetch("http://127.0.0.1:8000/api/user/me", {
                method: "DELETE",
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (res.ok) {
                setToken(null);
                localStorage.removeItem("lyvo_token");
                window.location.href = "/";
            }
        } catch (e) {
            setError("Failed to delete account");
        }
    };

    const handleLogout = () => {
        setToken(null);
        localStorage.removeItem("lyvo_token");
        window.location.href = "/";
    };

    return (
        <div className="page-enter" style={{ maxWidth: '1000px', margin: '0 auto', padding: '1rem' }}>
            <div style={{ marginBottom: '3rem' }}>
                <h2 className="title-gradient" style={{ fontSize: '2.5rem', marginBottom: '0.5rem' }}>Account Dashboard</h2>
                <p style={{ color: 'var(--text-secondary)' }}>Manage your profile, security settings, and app preferences.</p>
            </div>

            {error && (
                <div style={{ background: 'rgba(239, 68, 68, 0.1)', border: '1px solid var(--danger)', color: 'var(--danger)', padding: '1rem', borderRadius: '12px', marginBottom: '2rem', display: 'flex', alignItems: 'center', gap: '0.75rem', animation: 'fadeIn 0.3s ease' }}>
                    <AlertCircle size={20} /> {error}
                </div>
            )}
            {success && (
                <div style={{ background: 'rgba(16, 185, 129, 0.1)', border: '1px solid var(--success)', color: 'var(--success)', padding: '1rem', borderRadius: '12px', marginBottom: '2rem', display: 'flex', alignItems: 'center', gap: '0.75rem', animation: 'fadeIn 0.3s ease' }}>
                    <CheckCircle size={20} /> {success}
                </div>
            )}

            <div className="settings-grid" style={{ display: 'grid', gridTemplateColumns: 'minmax(280px, 1fr) 2fr', gap: '2rem' }}>
                
                {/* Left Column: Summary & Global Settings */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
                    <div className="glass-panel" style={{ padding: '2rem' }}>
                        <h3 style={{ marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.75rem', fontSize: '1.1rem' }}>
                            <SettingsIcon size={18} color="var(--brand-primary)" />
                            Reading Format
                        </h3>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                            {FORMAT_OPTIONS.map(opt => (
                                <label
                                    key={opt.value}
                                    onClick={() => setReadingFormat(opt.value)}
                                    style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '1rem',
                                        padding: '0.75rem 1rem',
                                        borderRadius: '12px',
                                        cursor: 'pointer',
                                        background: readingFormat === opt.value
                                            ? 'rgba(99, 102, 241, 0.15)'
                                            : 'rgba(255, 255, 255, 0.03)',
                                        border: `1px solid ${readingFormat === opt.value ? 'var(--brand-primary)' : 'var(--glass-border)'}`,
                                        transition: 'all 0.2s ease',
                                    }}
                                >
                                    <div style={{ flex: 1, fontSize: '0.9rem' }}>
                                        <span style={{ fontWeight: 600 }}>{opt.label}</span>
                                        <span style={{ color: 'var(--text-muted)', marginLeft: '0.5rem', fontSize: '0.8rem' }}>({opt.example})</span>
                                    </div>
                                    <div style={{
                                        width: '18px',
                                        height: '18px',
                                        borderRadius: '50%',
                                        border: `2px solid ${readingFormat === opt.value ? 'var(--brand-primary)' : 'var(--text-muted)'}`,
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center'
                                    }}>
                                        {readingFormat === opt.value && (
                                            <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'var(--brand-primary)' }} />
                                        )}
                                    </div>
                                </label>
                            ))}
                        </div>
                    </div>
                </div>

                {/* Right Column: Forms */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
                    
                    <div className="glass-panel" style={{ padding: '2rem' }}>
                        <h3 style={{ marginBottom: '2rem' }}>
                            Profile Information
                        </h3>
                        <form onSubmit={handleUpdateProfile} style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                                    <label style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', fontWeight: 500 }}>Username</label>
                                    <div style={{ position: 'relative' }}>
                                        <User size={16} style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                                        <input 
                                            className="glass-input" 
                                            style={{ paddingLeft: '2.75rem', width: '100%' }}
                                            value={editName}
                                            onChange={(e) => setEditName(e.target.value)}
                                        />
                                    </div>
                                </div>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                                    <label style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', fontWeight: 500 }}>Email</label>
                                    <div style={{ position: 'relative' }}>
                                        <Mail size={16} style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                                        <input 
                                            className="glass-input" 
                                            style={{ paddingLeft: '2.75rem', width: '100%' }}
                                            type="email"
                                            value={editEmail}
                                            onChange={(e) => setEditEmail(e.target.value)}
                                        />
                                    </div>
                                </div>
                            </div>
                            <button className="btn" type="submit" disabled={loading} style={{ alignSelf: 'flex-start', padding: '0.75rem 2rem' }}>
                                Save Changes
                            </button>
                        </form>
                    </div>

                    <div className="glass-panel" style={{ padding: '2rem' }}>
                        <h3 style={{ marginBottom: '2rem' }}>
                            Security & Privacy
                        </h3>
                        <form onSubmit={handleChangePassword} style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                                <label style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', fontWeight: 500 }}>Current Password</label>
                                <div style={{ position: 'relative' }}>
                                    <Lock size={16} style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                                    <input 
                                        type="password"
                                        className="glass-input" 
                                        style={{ paddingLeft: '2.75rem', width: '100%' }}
                                        value={currentPassword}
                                        onChange={(e) => setCurrentPassword(e.target.value)}
                                        required
                                    />
                                </div>
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                                    <label style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', fontWeight: 500 }}>New Password</label>
                                    <div style={{ position: 'relative' }}>
                                        <Lock size={16} style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                                        <input 
                                            type="password"
                                            className="glass-input" 
                                            style={{ paddingLeft: '2.75rem', width: '100%' }}
                                            value={newPassword}
                                            onChange={(e) => setNewPassword(e.target.value)}
                                            required
                                        />
                                    </div>
                                </div>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                                    <label style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', fontWeight: 500 }}>Verify New Password</label>
                                    <div style={{ position: 'relative' }}>
                                        <Lock size={16} style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                                        <input 
                                            type="password"
                                            className="glass-input" 
                                            style={{ paddingLeft: '2.75rem', width: '100%' }}
                                            value={confirmPassword}
                                            onChange={(e) => setConfirmPassword(e.target.value)}
                                            required
                                        />
                                    </div>
                                </div>
                            </div>
                            <button className="btn btn-outline" type="submit" disabled={loading} style={{ alignSelf: 'flex-start', padding: '0.75rem 2rem' }}>
                                Change Password
                            </button>
                        </form>

                        <div style={{ marginTop: '3rem', borderTop: '1px solid var(--glass-border)', paddingTop: '2rem' }}>
                            <h4 style={{ color: 'var(--danger)', marginBottom: '1rem' }}>Danger Zone</h4>
                            <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '1.5rem' }}>
                                Once you delete your account, there is no going back. Please be certain.
                            </p>
                            <div style={{ display: 'flex', gap: '1rem' }}>
                                <button className="btn btn-outline" onClick={handleLogout} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                    <LogOut size={16} /> Sign Out
                                </button>
                                <button 
                                    className="btn btn-outline" 
                                    onClick={handleDeleteAccount}
                                    style={{ borderColor: 'rgba(239, 68, 68, 0.4)', color: 'var(--danger)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}
                                >
                                    <Trash2 size={16} /> Delete Account
                                </button>
                            </div>
                        </div>
                    </div>

                </div>

            </div>
        </div>
    );
};
