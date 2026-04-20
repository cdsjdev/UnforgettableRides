import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../contexts/AuthContext';
import { socialModerationAPI } from '../services/api';

const ACTION_LABELS: Record<string, string> = {
  warn: 'Warn',
  mute: 'Mute (messaging)',
  suspend: 'Suspend account',
  ban: 'Permanent ban',
  remove_meetup: 'Remove meetup',
};

export default function ModerationAuditPage() {
  const { user } = useAuth();
  const [cursor, setCursor] = useState<string | undefined>(undefined);
  const [history, setHistory] = useState<string[]>([]);

  const { data, isLoading } = useQuery({
    queryKey: ['social-moderation-audit', cursor],
    queryFn: () => socialModerationAPI.getModerationActions({ cursor, limit: 30 }),
    enabled: user?.role === 'admin',
  });

  if (user?.role !== 'admin') {
    return (
      <div>
        <div className="page-title-bar"><h1>Moderation Audit Log</h1></div>
        <div className="panel"><div className="panel-body"><p>Admin access required.</p></div></div>
      </div>
    );
  }

  const loadNext = () => {
    if (!data?.nextCursor) return;
    setHistory((prev) => [...prev, cursor ?? '']);
    setCursor(data.nextCursor);
  };

  const loadPrev = () => {
    const prev = history[history.length - 1];
    setHistory((h) => h.slice(0, -1));
    setCursor(prev === '' ? undefined : prev);
  };

  return (
    <div>
      <div className="page-title-bar" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h1>Moderation Audit Log</h1>
        <div style={{ display: 'flex', gap: 8 }}>
          <Link to="/moderation" className="btn btn-secondary">{'<-'} {'Moderation Queue'}</Link>
          <Link to="/moderation/abuse-stats" className="btn btn-secondary">Abuse Stats</Link>
        </div>
      </div>

      <p className="page-description">A full history of moderation actions taken by admins. Use this to review past decisions and maintain accountability.</p>

      <div className="panel">
        <div className="panel-body">
          {isLoading ? (
            <div className="loading">Loading actions...</div>
          ) : !data?.items.length ? (
            <div className="empty-state">
              <div className="icon">&#128203;</div>
              <p>No moderation actions recorded yet.</p>
            </div>
          ) : (
            <>
              <div className="table-wrapper">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Action</th>
                      <th>Target</th>
                      <th>Duration</th>
                      <th>By</th>
                      <th>Note</th>
                      <th>Report</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.items.map((action) => (
                      <tr key={action.id}>
                        <td>{new Date(action.createdAt).toLocaleString('en-US')}</td>
                        <td><span className={`badge badge-${action.actionType}`}>{ACTION_LABELS[action.actionType] || action.actionType}</span></td>
                        <td>
                          {action.targetDisplayName
                            || (action.targetMeetupId ? `meetup/${action.targetMeetupId.slice(0, 8)}` : null)
                            || (action.targetUserId ? action.targetUserId.slice(0, 8) : '-')}
                        </td>
                        <td>{action.durationHours ? `${action.durationHours}h` : '-'}</td>
                        <td>{action.actorDisplayName || action.actorUserId.slice(0, 8)}</td>
                        <td>{action.actionNote || '-'}</td>
                        <td>{action.reportId ? action.reportId.slice(0, 8) : '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
                {history.length > 0 && <button className="btn btn-secondary" onClick={loadPrev}>{'<-'} {'Previous'}</button>}
                {data.nextCursor && <button className="btn btn-secondary" onClick={loadNext}>{'Next'} {'->'}</button>}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
