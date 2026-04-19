import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import { messagingAPI } from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import type { SocialThread } from '@shared/types';

export default function MessagesPage() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const { data: threads = [], isLoading } = useQuery({
    queryKey: ['threads'],
    queryFn: messagingAPI.getThreads,
    enabled: !!user,
    refetchInterval: 15000,
  });

  if (!user) {
    return (
      <div className="container page">
        <p>Please <Link to="/login">sign in</Link> to view messages.</p>
      </div>
    );
  }

  function otherMember(thread: SocialThread) {
    const members: any[] = (thread as any).members ?? [];
    return members.find((m: any) => m.user_id !== user!.id) || null;
  }

  function initials(name?: string) {
    if (!name) return '?';
    return name.split(' ').map((p) => p[0]).join('').slice(0, 2).toUpperCase();
  }

  return (
    <div className="container messages-page">
      <div className="messages-layout">
        {/* Thread list */}
        <div className="threads-sidebar">
          <div className="threads-header">Messages</div>
          {isLoading ? (
            <p className="loading" style={{ padding: 20 }}>Loading<span className="loading-dots" /></p>
          ) : threads.length === 0 ? (
            <div style={{ padding: 24, color: 'var(--text-muted)', fontSize: '0.84rem' }}>
              No conversations yet. Message a car owner from any car detail page.
            </div>
          ) : (
            threads.map((thread: SocialThread) => {
              const other = otherMember(thread);
              const name = other?.user?.name ?? 'Unknown';
              const lastMsg = (thread as any).last_message?.body ?? '';
              const isUnread = thread.unreadCount > 0;
              return (
                <div
                  key={thread.id}
                  className="thread-item"
                  onClick={() => navigate(`/messages/${thread.id}`)}
                >
                  <div className="thread-av">{initials(name)}</div>
                  <div className="thread-info">
                    <div className="thread-name">{name}</div>
                    <div className="thread-preview">{lastMsg || 'Start the conversation'}</div>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4, flexShrink: 0 }}>
                    {thread.lastMessageAt && (
                      <span className="thread-time">
                        {new Date(thread.lastMessageAt).toLocaleDateString()}
                      </span>
                    )}
                    {isUnread && <div className="unread-dot" />}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Empty message pane */}
        <div className="message-pane" style={{ alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ textAlign: 'center', color: 'var(--text-muted)' }}>
            <div style={{ fontSize: '2rem', marginBottom: 12, opacity: 0.3 }}>💬</div>
            <p style={{ fontSize: '0.88rem' }}>Select a conversation to view messages</p>
          </div>
        </div>
      </div>
    </div>
  );
}
