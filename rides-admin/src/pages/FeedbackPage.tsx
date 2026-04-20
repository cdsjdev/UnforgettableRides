import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { feedbackAPI } from '../services/api';
import type { FeedbackItem } from '@shared/types';

type RowDraft = {
  status: FeedbackItem['status'];
  admin_note: string;
};

const STATUS_OPTIONS: Array<'all' | FeedbackItem['status']> = ['all', 'new', 'reviewed', 'resolved'];
const STATUS_LABELS: Record<'all' | FeedbackItem['status'], string> = {
  all: 'All Status',
  new: 'New',
  reviewed: 'Reviewed',
  resolved: 'Resolved',
};
const CATEGORY_LABELS: Record<string, string> = {
  general: 'General',
  bug: 'Bug',
  improvement: 'Improvement',
  feature: 'Feature Request',
  other: 'Other',
};

export default function FeedbackPage() {
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState<'all' | FeedbackItem['status']>('new');
  const [search, setSearch] = useState('');
  const [drafts, setDrafts] = useState<Record<string, RowDraft>>({});
  const [savingId, setSavingId] = useState<string | null>(null);
  const [errorText, setErrorText] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['feedback-admin', statusFilter, search],
    queryFn: () => feedbackAPI.list({ status: statusFilter, search: search.trim() || undefined, limit: 300 }),
    refetchInterval: 20000,
  });

  const updateMutation = useMutation({
    mutationFn: (payload: { id: string; status: FeedbackItem['status']; admin_note: string | null }) =>
      feedbackAPI.update(payload.id, { status: payload.status, admin_note: payload.admin_note }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['feedback-admin'] });
      setSavingId(null);
      setErrorText('');
    },
    onError: (err: any) => {
      setSavingId(null);
      setErrorText(err?.response?.data?.error?.message || err?.message || 'Failed to update feedback');
    },
  });

  const rows = data || [];

  const displayRows = useMemo(() => {
    return rows.map((row) => {
      const d = drafts[row.id];
      return {
        ...row,
        draftStatus: d?.status ?? row.status,
        draftNote: d?.admin_note ?? (row.admin_note || ''),
      };
    });
  }, [rows, drafts]);

  const setDraft = (id: string, patch: Partial<RowDraft>, base: FeedbackItem) => {
    setDrafts((prev) => {
      const cur = prev[id] || { status: base.status, admin_note: base.admin_note || '' };
      return { ...prev, [id]: { ...cur, ...patch } };
    });
  };

  const hasChanges = (row: FeedbackItem & { draftStatus: FeedbackItem['status']; draftNote: string }) => {
    return row.status !== row.draftStatus || (row.admin_note || '') !== row.draftNote;
  };

  const onSave = (row: FeedbackItem & { draftStatus: FeedbackItem['status']; draftNote: string }) => {
    if (!hasChanges(row)) return;
    setSavingId(row.id);
    updateMutation.mutate({
      id: row.id,
      status: row.draftStatus,
      admin_note: row.draftNote.trim() || null,
    });
  };

  const formatDate = (v?: string) => {
    if (!v) return '-';
    const d = new Date(v);
    if (Number.isNaN(d.getTime())) return '-';
    return d.toLocaleString('en-US');
  };

  return (
    <div>
      <div className="page-title-bar">
        <h1>Member Feedback</h1>
      </div>

      {errorText ? (
        <div className="alert alert-error">{errorText}</div>
      ) : null}

      <div className="panel">
        <div className="panel-header">Feedback Inbox</div>
        <div className="panel-body">
          <div className="filter-bar">
            <input
              placeholder="Search by message/name/email..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{ minWidth: 260 }}
            />
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}>
              {STATUS_OPTIONS.map((s) => (
                <option key={s} value={s}>{STATUS_LABELS[s]}</option>
              ))}
            </select>
          </div>

          {isLoading ? (
            <div className="loading">Loading feedback...</div>
          ) : displayRows.length === 0 ? (
            <div className="empty-state">
              <div className="icon">&#128172;</div>
              <p>No feedback found</p>
            </div>
          ) : (
            <div className="table-wrapper">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Submitted At</th>
                    <th>Member</th>
                    <th>Category</th>
                    <th>Suggestion</th>
                    <th>Status</th>
                    <th>Admin Note</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {displayRows.map((row) => {
                    const changed = hasChanges(row);
                    const rowSaving = savingId === row.id && updateMutation.isPending;
                    return (
                      <tr key={row.id}>
                        <td>{formatDate(row.created_at)}</td>
                        <td>
                          <div style={{ fontWeight: 600 }}>{row.user_name || '-'}</div>
                          <div style={{ fontSize: 12, color: '#64748B' }}>{row.user_email || '-'}</div>
                        </td>
                        <td>{CATEGORY_LABELS[row.category] || row.category}</td>
                        <td style={{ maxWidth: 380, whiteSpace: 'pre-wrap' }}>{row.message}</td>
                        <td>
                          <select
                            value={row.draftStatus}
                            onChange={(e) => setDraft(row.id, { status: e.target.value as FeedbackItem['status'] }, row)}
                          >
                            <option value="new">New</option>
                            <option value="reviewed">Reviewed</option>
                            <option value="resolved">Resolved</option>
                          </select>
                        </td>
                        <td>
                          <textarea
                            value={row.draftNote}
                            onChange={(e) => setDraft(row.id, { admin_note: e.target.value }, row)}
                            rows={2}
                            style={{ width: 280, resize: 'vertical' }}
                            placeholder="Add review note (optional)"
                          />
                        </td>
                        <td>
                          <button className="btn btn-primary" disabled={!changed || rowSaving} onClick={() => onSave(row)}>
                            {rowSaving ? 'Saving...' : 'Save'}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
