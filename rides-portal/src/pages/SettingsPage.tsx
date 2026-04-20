import { Link } from 'react-router-dom';
import { useRef, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { authAPI } from '../services/api';

function formatRole(role: string) {
  return role.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

export default function SettingsPage() {
  const { user, logout, updateUserProfile } = useAuth();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [avatarError, setAvatarError] = useState('');

  if (!user) {
    return (
      <div className="container page">
        <div className="empty">
          <h3>Sign In Required</h3>
          <p>Please sign in to view your account settings.</p>
          <Link to="/login" className="btn btn-primary">Sign In</Link>
        </div>
      </div>
    );
  }

  const onPickAvatar = () => {
    fileInputRef.current?.click();
  };

  const onAvatarFileSelected = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setAvatarError('Please choose an image file.');
      event.target.value = '';
      return;
    }

    setAvatarError('');
    setUploadingAvatar(true);
    try {
      const uploadedUrl = await authAPI.uploadProfileImage(file);
      if (!uploadedUrl) {
        throw new Error('Upload failed');
      }
      await updateUserProfile({ avatar_url: uploadedUrl });
    } catch (error: any) {
      setAvatarError(error?.response?.data?.error?.message || error?.message || 'Failed to update avatar.');
    } finally {
      setUploadingAvatar(false);
      event.target.value = '';
    }
  };

  return (
    <>
      <div className="page-header">
        <div className="container">
          <div className="section-eyebrow">Account</div>
          <h1 className="page-title">Settings</h1>
          <p className="page-subtitle">Manage your profile and account access.</p>
        </div>
      </div>

      <div className="container page" style={{ paddingTop: 24 }}>
        <div className="stat-card" style={{ textAlign: 'left', marginBottom: 16 }}>
          <div style={{ color: 'var(--text)', fontWeight: 700, marginBottom: 12 }}>Profile</div>
          <div className="settings-avatar-row">
            <div className="settings-avatar-preview">
              {user.avatar_url
                ? <img src={user.avatar_url} alt={user.name} className="settings-avatar-img" />
                : <span>{user.name.charAt(0).toUpperCase()}</span>}
            </div>
            <div>
              <button
                type="button"
                className="btn btn-outline btn-sm"
                onClick={onPickAvatar}
                disabled={uploadingAvatar}
              >
                {uploadingAvatar ? 'Uploading...' : 'Change Avatar'}
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                style={{ display: 'none' }}
                onChange={onAvatarFileSelected}
              />
            </div>
          </div>
          {avatarError ? <div className="error" style={{ marginBottom: 12 }}>{avatarError}</div> : null}
          <div style={{ display: 'grid', gap: 8, fontSize: '0.9rem' }}>
            <div><span style={{ color: 'var(--text-muted)' }}>Name:</span> {user.name}</div>
            <div>
              <span style={{ color: 'var(--text-muted)' }}>Email:</span> {user.email}
              {user.email_verified_at
                ? <span style={{ color: 'var(--success)', fontSize: '0.75rem', marginLeft: 8 }}>✓ Verified</span>
                : <span style={{ color: 'var(--warning)', fontSize: '0.75rem', marginLeft: 8 }}>Unverified</span>}
            </div>
            <div><span style={{ color: 'var(--text-muted)' }}>Account Type:</span> {formatRole(user.role)}</div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          {!user.email_verified_at && (
            <Link to="/verify-email" className="btn btn-outline">Verify Email</Link>
          )}
          {(user.role === 'owner' || user.role === 'admin') && (
            <Link to="/owner" className="btn btn-outline">Owner Dashboard</Link>
          )}
          <Link to="/help" className="btn btn-outline">Help Center</Link>
          <button className="btn btn-primary" onClick={logout}>Sign Out</button>
        </div>
      </div>
    </>
  );
}
