import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../contexts/AuthContext';
import { socialModerationAPI } from '../services/api';

type StatusFilter = '' | 'pending' | 'reviewed' | 'actioned';
type ActionType = 'warn' | 'mute' | 'suspend' | 'ban';

export default function ModerationPage() {
  const { user } = useAuth();
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
        <div className="page-title-bar"><h1>{'Moderation'}</h1></div>
        <div className="panel"><div className="panel-body"><p>{'Admin access required.'}</p></div></div>
      </div>
    );
  }

  return (
    <div>
      <div className="page-title-bar" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h1>{'Moderation Queue'}</h1>
        <div style={{ display: 'flex', gap: 8 }}>
          <Link to="/moderation/abuse-stats" className="btn btn-secondary">{'Abuse Stats'}</Link>
          <Link to="/moderation/audit" className="btn btn-secondary">{'Moderation Audit Log'}</Link>
        </div>
      </div>

      <p className="page-description">{'Review user-submitted reports from the social feed. Mark reports as reviewed or take account actions against reported users.'}</p>

      <div className="panel">
        <div className="panel-body">
          <div className="filter-bar">
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}>
              <option value="">{'All'}</option>
              <option value="pending">{'Pending'}</option>
              <option value="reviewed">{'Reviewed'}</option>
              <option value="actioned">{'Actioned'}</option>
            </select>
          </div>

          {isLoading ? (
            <div className="loading">{'Loading reports...'}</div>
          ) : !data?.items.length ? (
            <div className="empty-state">
              <div className="icon">&#128172;</div>
              <p>{statusFilter ? `No reports with status "${statusFilter}".` : 'No reports.'}</p>
            </div>
          ) : (
            <div className="table-wrapper">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>{'ID'}</th>
                    <th>{'Reporter'}</th>
                    <th>{'Target'}</th>
                    <th>{'Reason'}</th>
                    <th>{'Status'}</th>
                    <th>{'Created'}</th>
                    <th>{'Actions'}</th>
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
                      <td>{new Date(report.createdAt).toLocaleString('en-US')}</td>
                      <td>
                        {report.status === 'pending' ? (
                          <div style={{ display: 'flex', gap: 8 }}>
                            <button
                              className="btn btn-secondary"
                              onClick={() => resolveMutation.mutate({ id: report.id, status: 'reviewed' })}
                              disabled={resolveMutation.isPending}
                            >
                              {'Mark Reviewed'}
                            </button>
                            {report.targetType === 'user' ? (
                              <button
                                className="btn btn-primary"
                                onClick={() => setActionModal({ reportId: report.id, targetUserId: report.targetId })}
                              >
                                {'Take Action'}
                              </button>
                            ) : report.targetType === 'meetup' ? (
                              <button
                                className="btn btn-primary"
                                disabled={removeMeetupMutation.isPending}
                                onClick={() => {
                                  const ok = window.confirm('Remove this meetup now? This will cancel it for all attendees.');
                                  if (!ok) return;
                                  removeMeetupMutation.mutate({ meetupId: report.targetId, reportId: report.id });
                                }}
                              >
                                {removeMeetupMutation.isPending ? 'Submitting...' : 'Remove Meetup'}
                              </button>
                            ) : (
                              <button className="btn btn-secondary" disabled title={'Account actions only apply to user reports'}>
                                {'Take Action'}
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
            <h3 style={{ marginBottom: 12 }}>{'Take Action'}</h3>
            <p style={{ fontSize: 13, color: '#64748B' }}>{'Report'}: {actionModal.reportId.slice(0, 8)}</p>
            <label>
              {'Action Type'}
              <select value={actionType} onChange={(e) => setActionType(e.target.value as ActionType)}>
                <option value="warn">{'Warn'}</option>
                <option value="mute">{'Mute (messaging)'}</option>
                <option value="suspend">{'Suspend account'}</option>
                <option value="ban">{'Permanent ban'}</option>
              </select>
            </label>
            {(actionType === 'mute' || actionType === 'suspend') && (
              <label>
                {'Duration (hours)'}
                <input
                  type="number"
                  min={1}
                  value={durationHours}
                  onChange={(e) => setDurationHours(e.target.value)}
                  placeholder={'e.g. 24'}
                />
              </label>
            )}
            <label>
              {'Note (optional)'}
              <textarea
                rows={3}
                value={actionNote}
                onChange={(e) => setActionNote(e.target.value)}
                placeholder={'Internal note for this action'}
              />
            </label>
            {actionMutation.isError && (
              <p style={{ color: 'var(--danger)', marginTop: 8 }}>{'Action failed. Please try again.'}</p>
            )}
            <div className="action-dialog-actions">
              <button className="btn btn-primary" onClick={() => actionMutation.mutate()} disabled={actionMutation.isPending}>
                {actionMutation.isPending ? 'Submitting...' : 'Submit Action'}
              </button>
              <button className="btn btn-secondary" onClick={() => setActionModal(null)}>{'Cancel'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

