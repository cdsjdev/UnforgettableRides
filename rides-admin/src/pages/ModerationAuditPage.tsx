import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../contexts/AuthContext';
import { useI18n } from '../i18n/I18nContext';
import { socialModerationAPI } from '../services/api';

const ACTION_LABELS: Record<string, string> = {
  warn: 'moderation.action.warn',
  mute: 'moderation.action.mute',
  suspend: 'moderation.action.suspend',
  ban: 'moderation.action.ban',
  remove_meetup: 'moderation.action.removeMeetup',
};

export default function ModerationAuditPage() {
  const { user } = useAuth();
  const { t, lang } = useI18n();
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
        <div className="page-title-bar"><h1>{t('moderation.auditTitle')}</h1></div>
        <div className="panel"><div className="panel-body"><p>{t('moderation.adminRequired')}</p></div></div>
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
        <h1>{t('moderation.auditTitle')}</h1>
        <div style={{ display: 'flex', gap: 8 }}>
          <Link to="/moderation" className="btn btn-secondary">{'<-'} {t('moderation.queueTitle')}</Link>
          <Link to="/moderation/abuse-stats" className="btn btn-secondary">{t('moderation.abuseTitle')}</Link>
        </div>
      </div>

      <p className="page-description">{t('moderation.auditDescription')}</p>

      <div className="panel">
        <div className="panel-body">
          {isLoading ? (
            <div className="loading">{t('moderation.loadingActions')}</div>
          ) : !data?.items.length ? (
            <div className="empty-state">
              <div className="icon">&#128203;</div>
              <p>{t('moderation.noActions')}</p>
            </div>
          ) : (
            <>
              <div className="table-wrapper">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>{t('moderation.col.date')}</th>
                      <th>{t('moderation.col.action')}</th>
                      <th>{t('moderation.col.target')}</th>
                      <th>{t('moderation.col.duration')}</th>
                      <th>{t('moderation.col.by')}</th>
                      <th>{t('moderation.col.note')}</th>
                      <th>{t('moderation.col.report')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.items.map((action) => (
                      <tr key={action.id}>
                        <td>{new Date(action.createdAt).toLocaleString(lang === 'zh' ? 'zh-CN' : 'en-US')}</td>
                        <td><span className={`badge badge-${action.actionType}`}>{t(ACTION_LABELS[action.actionType] || action.actionType)}</span></td>
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
                {history.length > 0 && <button className="btn btn-secondary" onClick={loadPrev}>{'<-'} {t('common.previous')}</button>}
                {data.nextCursor && <button className="btn btn-secondary" onClick={loadNext}>{t('common.next')} {'->'}</button>}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
