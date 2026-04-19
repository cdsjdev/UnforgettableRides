import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../contexts/AuthContext';
import { useI18n } from '../i18n/I18nContext';
import { socialModerationAPI, type SocialAbuseCount } from '../services/api';

function fmtMs(ms: number): string {
  if (ms < 60_000) return `${ms / 1000}s`;
  if (ms < 3_600_000) return `${ms / 60_000} min`;
  return `${ms / 3_600_000} hr`;
}

const HOUR_OPTIONS = [1, 6, 12, 24, 48, 72, 168];

function CountTable({
  title,
  rows,
  truncateKey = false,
  keyLabel,
  countLabel,
  noDataText,
}: {
  title: string;
  rows: SocialAbuseCount[];
  truncateKey?: boolean;
  keyLabel: string;
  countLabel: string;
  noDataText: string;
}) {
  return (
    <div className="panel" style={{ marginBottom: 0 }}>
      <div className="panel-header">{title}</div>
      <div className="panel-body" style={{ paddingTop: 0 }}>
        {!rows.length ? (
          <p style={{ color: 'var(--text-muted)' }}>{noDataText}</p>
        ) : (
          <div className="table-wrapper">
            <table className="data-table">
              <thead>
                <tr>
                  <th>{keyLabel}</th>
                  <th>{countLabel}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={`${title}-${row.key}`}>
                    <td>{truncateKey ? `${row.key.slice(0, 8)}...` : row.key}</td>
                    <td>{row.count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

export default function ModerationAbuseStatsPage() {
  const { user } = useAuth();
  const { t, lang } = useI18n();
  const [hours, setHours] = useState(24);

  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ['social-moderation-abuse-stats', hours],
    queryFn: () => socialModerationAPI.getAbuseStats({ hours, recent_limit: 100, max_rows: 2000 }),
    enabled: user?.role === 'admin',
  });

  if (user?.role !== 'admin') {
    return (
      <div>
        <div className="page-title-bar"><h1>{t('moderation.abuseTitle')}</h1></div>
        <div className="panel"><div className="panel-body"><p>{t('moderation.adminRequired')}</p></div></div>
      </div>
    );
  }

  return (
    <div>
      <div className="page-title-bar" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <h1>{t('moderation.abuseTitle')}</h1>
          <Link to="/moderation" className="btn btn-secondary">{'<-'} {t('moderation.queueTitle')}</Link>
          <Link to="/moderation/audit" className="btn btn-secondary">{t('moderation.auditTitle')}</Link>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <label htmlFor="window-select" style={{ margin: 0 }}>
            {t('moderation.stats.window')}
            <select id="window-select" value={hours} onChange={(e) => setHours(Number(e.target.value))} style={{ marginTop: 4, minWidth: 110 }}>
              {HOUR_OPTIONS.map((value) => <option key={value} value={value}>{value}h</option>)}
            </select>
          </label>
          <button className="btn btn-secondary" onClick={() => refetch()} disabled={isFetching}>
            {isFetching ? t('moderation.refreshing') : t('moderation.refresh')}
          </button>
        </div>
      </div>

      <p className="page-description">{t('moderation.abuseDescription')}</p>

      {isLoading ? (
        <div className="loading">{t('moderation.loadingStats')}</div>
      ) : !data ? (
        <div className="panel"><div className="panel-body"><p>{t('moderation.noData')}</p></div></div>
      ) : (
        <>
          <div className="stat-cards">
            <div className="stat-card"><div className="label">{t('moderation.stats.window')}</div><div className="value">{data.windowHours}h</div></div>
            <div className="stat-card"><div className="label">{t('moderation.stats.signalsInWindow')}</div><div className="value">{data.totals.inWindow}</div></div>
            <div className="stat-card"><div className="label">{t('moderation.stats.sampledRows')}</div><div className="value">{data.sampledRows}</div></div>
            <div className="stat-card"><div className="label">{t('moderation.stats.processLifetime')}</div><div className="value">{data.totals.processLifetime}</div></div>
          </div>

          {data.alerting && (
            <div className="panel">
              <div className="panel-header">{t('moderation.stats.alertingStatus')}</div>
              <div className="panel-body">
                <p>Window: {fmtMs(data.alerting.windowMs)} | Cooldown: {fmtMs(data.alerting.cooldownMs)}</p>
                <p>
                  {t('moderation.stats.thresholds')}: total {data.alerting.thresholds.total}, RATE_LIMITED {data.alerting.thresholds.rateLimited}, SPAM_DETECTED {data.alerting.thresholds.spamDetected}
                </p>
                <p>
                  {t('moderation.stats.currentWindow')}: total {data.alerting.currentWindow.total}, RATE_LIMITED {data.alerting.currentWindow.rateLimited}, SPAM_DETECTED {data.alerting.currentWindow.spamDetected}
                </p>
              </div>
            </div>
          )}

          <div style={{ display: 'grid', gap: 16, gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', marginBottom: 24 }}>
            <CountTable title={t('moderation.stats.byCode')} rows={data.breakdown.byCode} keyLabel={t('moderation.stats.key')} countLabel={t('moderation.stats.count')} noDataText={t('moderation.noData')} />
            <CountTable title={t('moderation.stats.byAction')} rows={data.breakdown.byAction} keyLabel={t('moderation.stats.key')} countLabel={t('moderation.stats.count')} noDataText={t('moderation.noData')} />
            <CountTable title={t('moderation.stats.byRoute')} rows={data.breakdown.byRoute} keyLabel={t('moderation.stats.key')} countLabel={t('moderation.stats.count')} noDataText={t('moderation.noData')} />
            <CountTable title={t('moderation.stats.topUsers')} rows={data.breakdown.topUsers} truncateKey keyLabel={t('moderation.stats.key')} countLabel={t('moderation.stats.count')} noDataText={t('moderation.noData')} />
            <CountTable title={t('moderation.stats.rawRateLimitKeys')} rows={data.rawSignals.rateLimitEventsByKey} keyLabel={t('moderation.stats.key')} countLabel={t('moderation.stats.count')} noDataText={t('moderation.noData')} />
            <CountTable title={t('moderation.stats.rawFingerprintKeys')} rows={data.rawSignals.contentFingerprintsByKey} keyLabel={t('moderation.stats.key')} countLabel={t('moderation.stats.count')} noDataText={t('moderation.noData')} />
          </div>

          <div className="panel">
            <div className="panel-header">{t('moderation.stats.recentEvents')}</div>
            <div className="panel-body" style={{ paddingTop: 0 }}>
              {!data.recentEvents.length ? (
                <p style={{ color: 'var(--text-muted)' }}>{t('moderation.stats.noEvents')}</p>
              ) : (
                <div className="table-wrapper">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>{t('moderation.col.time')}</th>
                        <th>{t('moderation.col.code')}</th>
                        <th>{t('moderation.col.action')}</th>
                        <th>{t('moderation.col.route')}</th>
                        <th>{t('moderation.col.user')}</th>
                        <th>{t('moderation.col.retry')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.recentEvents.map((event, idx) => (
                        <tr key={`${event.createdAt || 'na'}-${event.code}-${idx}`}>
                          <td>{event.createdAt ? new Date(event.createdAt).toLocaleString(lang === 'zh' ? 'zh-CN' : 'en-US') : '-'}</td>
                          <td>{event.code}</td>
                          <td>{event.action}</td>
                          <td>{event.route}</td>
                          <td>{event.userId ? `${event.userId.slice(0, 8)}...` : '-'}</td>
                          <td>{event.retryAfterSeconds ? `${event.retryAfterSeconds}s` : '-'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
