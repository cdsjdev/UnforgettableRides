import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../contexts/AuthContext';
import { useI18n } from '../i18n/I18nContext';
import { socialModerationAPI } from '../services/api';

type StatusFilter = '' | 'pending' | 'reviewed' | 'actioned';
type ActionType = 'warn' | 'mute' | 'suspend' | 'ban';

export default function ModerationPage() {
  const { user } = useAuth();
  const { t, lang } = useI18n();
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('pending');
  const [actionModal, setActionModal] = useState<{ reportId: string; targetUserId: string } | null>(null);
  const [actionType, setActionType] = useState<ActionType>('warn');
  const [actionNote, setActionNote] = useState('');
  const [durationHours, setDurationHours] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['social-moderation-reports', statusFilter],
    queryFn: () => socialModerationAPI.getReports({ status: statusFilter || undefined, limit: 50 }),
    enabled: user?.role === 'admin',
  });

  const resolveMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: 'reviewed' | 'actioned' }) =>
      socialModerationAPI.resolveReport(id, status),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['social-moderation-reports'] }),
  });

  const actionMutation = useMutation({
    mutationFn: () => {
      if (!actionModal) return Promise.resolve();
      return socialModerationAPI.submitAction({
        report_id: actionModal.reportId,
        target_user_id: actionModal.targetUserId,
        action_type: actionType,
        action_note: actionNote.trim() || undefined,
        duration_hours: durationHours ? Number(durationHours) : undefined,
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['social-moderation-reports'] });
      setActionModal(null);
      setActionNote('');
      setDurationHours('');
      setActionType('warn');
    },
  });

  const removeMeetupMutation = useMutation({
    mutationFn: ({ meetupId, reportId }: { meetupId: string; reportId?: string }) =>
      socialModerationAPI.removeMeetup(meetupId, { report_id: reportId }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['social-moderation-reports'] });
    },
  });

  if (user?.role !== 'admin') {
    return (
      <div>
        <div className="page-title-bar"><h1>{t('moderation.title')}</h1></div>
        <div className="panel"><div className="panel-body"><p>{t('moderation.adminRequired')}</p></div></div>
      </div>
    );
  }

  return (
    <div>
      <div className="page-title-bar" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h1>{t('moderation.queueTitle')}</h1>
        <div style={{ display: 'flex', gap: 8 }}>
          <Link to="/moderation/abuse-stats" className="btn btn-secondary">{t('moderation.abuseTitle')}</Link>
          <Link to="/moderation/audit" className="btn btn-secondary">{t('moderation.auditTitle')}</Link>
        </div>
      </div>

      <p className="page-description">{t('moderation.queueDescription')}</p>

      <div className="panel">
        <div className="panel-body">
          <div className="filter-bar">
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}>
              <option value="">{t('moderation.status.all')}</option>
              <option value="pending">{t('moderation.status.pending')}</option>
              <option value="reviewed">{t('moderation.status.reviewed')}</option>
              <option value="actioned">{t('moderation.status.actioned')}</option>
            </select>
          </div>

          {isLoading ? (
            <div className="loading">{t('moderation.loadingReports')}</div>
          ) : !data?.items.length ? (
            <div className="empty-state">
              <div className="icon">&#128172;</div>
              <p>{statusFilter ? t('moderation.noReportsWithStatus', { status: statusFilter }) : t('moderation.noReports')}</p>
            </div>
          ) : (
            <div className="table-wrapper">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>{t('moderation.col.id')}</th>
                    <th>{t('moderation.col.reporter')}</th>
                    <th>{t('moderation.col.target')}</th>
                    <th>{t('moderation.col.reason')}</th>
                    <th>{t('moderation.col.status')}</th>
                    <th>{t('moderation.col.created')}</th>
                    <th>{t('moderation.col.actions')}</th>
                  </tr>
                </thead>
                <tbody>
                  {data.items.map((report) => (
                    <tr key={report.id}>
                      <td>{report.id.slice(0, 8)}</td>
                      <td>{report.reporterDisplayName || report.reporterUserId.slice(0, 8)}</td>
                      <td>{report.targetType} / {report.targetId.slice(0, 12)}</td>
                      <td>{report.reasonCode}{report.details ? ` - ${report.details}` : ''}</td>
                      <td><span className={`badge badge-${report.status}`}>{report.status}</span></td>
                      <td>{new Date(report.createdAt).toLocaleString(lang === 'zh' ? 'zh-CN' : 'en-US')}</td>
                      <td>
                        {report.status === 'pending' ? (
                          <div style={{ display: 'flex', gap: 8 }}>
                            <button
                              className="btn btn-secondary"
                              onClick={() => resolveMutation.mutate({ id: report.id, status: 'reviewed' })}
                              disabled={resolveMutation.isPending}
                            >
                              {t('moderation.markReviewed')}
                            </button>
                            {report.targetType === 'user' ? (
                              <button
                                className="btn btn-primary"
                                onClick={() => setActionModal({ reportId: report.id, targetUserId: report.targetId })}
                              >
                                {t('moderation.takeAction')}
                              </button>
                            ) : report.targetType === 'meetup' ? (
                              <button
                                className="btn btn-primary"
                                disabled={removeMeetupMutation.isPending}
                                onClick={() => {
                                  const ok = window.confirm(t('moderation.removeMeetupConfirm'));
                                  if (!ok) return;
                                  removeMeetupMutation.mutate({ meetupId: report.targetId, reportId: report.id });
                                }}
                              >
                                {removeMeetupMutation.isPending ? t('moderation.submitting') : t('moderation.removeMeetup')}
                              </button>
                            ) : (
                              <button className="btn btn-secondary" disabled title={t('moderation.accountActionOnly')}>
                                {t('moderation.takeAction')}
                              </button>
                            )}
                          </div>
                        ) : '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {actionModal && (
        <div className="action-dialog-backdrop" role="dialog" aria-modal="true">
          <div className="action-dialog">
            <h3 style={{ marginBottom: 12 }}>{t('moderation.takeAction')}</h3>
            <p style={{ fontSize: 13, color: '#64748B' }}>{t('moderation.col.report')}: {actionModal.reportId.slice(0, 8)}</p>
            <label>
              {t('moderation.actionType')}
              <select value={actionType} onChange={(e) => setActionType(e.target.value as ActionType)}>
                <option value="warn">{t('moderation.action.warn')}</option>
                <option value="mute">{t('moderation.action.mute')}</option>
                <option value="suspend">{t('moderation.action.suspend')}</option>
                <option value="ban">{t('moderation.action.ban')}</option>
              </select>
            </label>
            {(actionType === 'mute' || actionType === 'suspend') && (
              <label>
                {t('moderation.durationHours')}
                <input
                  type="number"
                  min={1}
                  value={durationHours}
                  onChange={(e) => setDurationHours(e.target.value)}
                  placeholder={t('moderation.durationPlaceholder')}
                />
              </label>
            )}
            <label>
              {t('moderation.noteOptional')}
              <textarea
                rows={3}
                value={actionNote}
                onChange={(e) => setActionNote(e.target.value)}
                placeholder={t('moderation.notePlaceholder')}
              />
            </label>
            {actionMutation.isError && (
              <p style={{ color: 'var(--danger)', marginTop: 8 }}>{t('moderation.actionFailed')}</p>
            )}
            <div className="action-dialog-actions">
              <button className="btn btn-primary" onClick={() => actionMutation.mutate()} disabled={actionMutation.isPending}>
                {actionMutation.isPending ? t('moderation.submitting') : t('moderation.submitAction')}
              </button>
              <button className="btn btn-secondary" onClick={() => setActionModal(null)}>{t('common.cancel')}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
