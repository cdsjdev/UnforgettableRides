import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { feedbackAPI } from '../services/api';
import { useI18n } from '../i18n/I18nContext';
import type { FeedbackItem } from '@shared/types';

type RowDraft = {
  status: FeedbackItem['status'];
  admin_note: string;
};

const STATUS_OPTIONS: Array<'all' | FeedbackItem['status']> = ['all', 'new', 'reviewed', 'resolved'];

export default function FeedbackPage() {
  const { t, lang } = useI18n();
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
      setErrorText(err?.response?.data?.error?.message || err?.message || t('fb.saveFailed'));
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
    return d.toLocaleString(lang === 'zh' ? 'zh-CN' : 'en-US');
  };

  return (
    <div>
      <div className="page-title-bar">
        <h1>{t('fb.title')}</h1>
      </div>

      {errorText ? (
        <div className="alert alert-error">{errorText}</div>
      ) : null}

      <div className="panel">
        <div className="panel-header">{t('fb.panelTitle')}</div>
        <div className="panel-body">
          <div className="filter-bar">
            <input
              placeholder={t('fb.search')}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{ minWidth: 260 }}
            />
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}>
              {STATUS_OPTIONS.map((s) => (
                <option key={s} value={s}>{t(`fb.status.${s}`)}</option>
              ))}
            </select>
          </div>

          {isLoading ? (
            <div className="loading">{t('fb.loading')}</div>
          ) : displayRows.length === 0 ? (
            <div className="empty-state">
              <div className="icon">&#128172;</div>
              <p>{t('fb.empty')}</p>
            </div>
          ) : (
            <div className="table-wrapper">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>{t('fb.time')}</th>
                    <th>{t('fb.user')}</th>
                    <th>{t('fb.category')}</th>
                    <th>{t('fb.message')}</th>
                    <th>{t('fb.statusLabel')}</th>
                    <th>{t('fb.adminNote')}</th>
                    <th>{t('fb.actions')}</th>
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
                        <td>{t(`fb.category.${row.category}`)}</td>
                        <td style={{ maxWidth: 380, whiteSpace: 'pre-wrap' }}>{row.message}</td>
                        <td>
                          <select
                            value={row.draftStatus}
                            onChange={(e) => setDraft(row.id, { status: e.target.value as FeedbackItem['status'] }, row)}
                          >
                            <option value="new">{t('fb.status.new')}</option>
                            <option value="reviewed">{t('fb.status.reviewed')}</option>
                            <option value="resolved">{t('fb.status.resolved')}</option>
                          </select>
                        </td>
                        <td>
                          <textarea
                            value={row.draftNote}
                            onChange={(e) => setDraft(row.id, { admin_note: e.target.value }, row)}
                            rows={2}
                            style={{ width: 280, resize: 'vertical' }}
                            placeholder={t('fb.adminNotePlaceholder')}
                          />
                        </td>
                        <td>
                          <button className="btn btn-primary" disabled={!changed || rowSaving} onClick={() => onSave(row)}>
                            {rowSaving ? t('fb.saving') : t('fb.save')}
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
