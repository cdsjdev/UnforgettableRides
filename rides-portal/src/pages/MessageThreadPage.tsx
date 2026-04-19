import { useState, useEffect, useRef } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { messagingAPI } from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import type { SocialThread, SocialMessage } from '@shared/types';

export default function MessageThreadPage() {
  const { threadId } = useParams<{ threadId: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [body, setBody] = useState('');
  const listRef = useRef<HTMLDivElement>(null);

  const { data: threads = [] } = useQuery({
    queryKey: ['threads'],
    queryFn: messagingAPI.getThreads,
    enabled: !!user,
  });

  const { data: messages = [], isLoading } = useQuery({
    queryKey: ['messages', threadId],
    queryFn: () => messagingAPI.getMessages(threadId!),
    enabled: !!threadId && !!user,
    refetchInterval: 8000,
  });

  useEffect(() => {
    if (threadId) messagingAPI.markRead(threadId).catch(() => {});
  }, [threadId, messages.length]);

  useEffect(() => {
    if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [messages]);

  const sendMutation = useMutation({
    mutationFn: () => messagingAPI.sendMessage(threadId!, body.trim()),
    onSuccess: () => {
      setBody('');
      qc.invalidateQueries({ queryKey: ['messages', threadId] });
      qc.invalidateQueries({ queryKey: ['threads'] });
    },
  });

  if (!user) return (
    <div className="container page"><p>Please <Link to="/login">sign in</Link>.</p></div>
  );

  const thread = threads.find((t: SocialThread) => t.id === threadId);
  const members: any[] = (thread as any)?.members ?? [];
  const other = members.find((m: any) => m.user_id !== user.id);
  const otherName = other?.user?.name ?? 'Conversation';

  function initials(name?: string) {
    if (!name) return '?';
    return name.split(' ').map((p: string) => p[0]).join('').slice(0, 2).toUpperCase();
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (body.trim() && !sendMutation.isPending) sendMutation.mutate();
    }
  }

  return (
    <div className="container messages-page">
      <div className="messages-layout">
        {/* Thread list sidebar */}
        <div className="threads-sidebar">
          <div className="threads-header">Messages</div>
          {threads.map((t: SocialThread) => {
            const m: any[] = (t as any).members ?? [];
            const o = m.find((x: any) => x.user_id !== user.id);
            const name = o?.user?.name ?? 'Unknown';
            return (
              <div
                key={t.id}
                className={`thread-item${t.id === threadId ? ' active' : ''}`}
                onClick={() => navigate(`/messages/${t.id}`)}
              >
                <div className="thread-av">{initials(name)}</div>
                <div className="thread-info">
                  <div className="thread-name">{name}</div>
                  <div className="thread-preview">{(t as any).last_message?.body ?? ''}</div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Message pane */}
        <div className="message-pane">
          <div className="message-pane-header">{otherName}</div>

          <div className="message-list" ref={listRef}>
            {isLoading ? (
              <p className="loading" style={{ paddingTop: 40 }}>Loading messages<span className="loading-dots" /></p>
            ) : messages.length === 0 ? (
              <div style={{ textAlign: 'center', color: 'var(--text-muted)', paddingTop: 40, fontSize: '0.84rem' }}>
                No messages yet. Say hello!
              </div>
            ) : (
              messages.map((msg: SocialMessage) => {
                const mine = msg.senderUserId === user.id;
                return (
                  <div key={msg.id} className={`msg-row ${mine ? 'mine' : 'theirs'}`}>
                    <div>
                      <div className="msg-bubble">{msg.body}</div>
                      <div className="msg-time">
                        {new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          <div className="message-compose">
            <textarea
              className="form-control"
              placeholder="Type a message… (Enter to send)"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              onKeyDown={handleKeyDown}
              rows={2}
            />
            <button
              className="btn btn-primary"
              onClick={() => sendMutation.mutate()}
              disabled={!body.trim() || sendMutation.isPending}
            >
              Send
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
