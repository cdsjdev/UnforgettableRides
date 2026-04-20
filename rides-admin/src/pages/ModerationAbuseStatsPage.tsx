import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../contexts/AuthContext';
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
  const [hours, setHours] = useState(24);

  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ['social-moderation-abuse-stats', hours],
    queryFn: () => socialModerationAPI.getAbuseStats({ hours, recent_limit: 100, max_rows: 2000 }),
    enabled: user?.role === 'admin',
  });

  if (user?.role !== 'admin') {
    return (
      <div>
        <div className="page-title-bar"><h1>{'Abuse Stats'}</h1></div>
        <div className="panel"><div className="panel-body"><p>{'Admin access required.'}</p></div></div>
      </div>
    );
  }

  return (
    <div>
      <div className="page-title-bar" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <h1>{'Abuse Stats'}</h1>
          <Link to="/moderation" className="btn btn-secondary">{'<-'} {'Moderation Queue'}</Link>
          <Link to="/moderation/audit" className="btn btn-secondary">{'Moderation Audit Log'}</Link>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <label htmlFor="window-select" style={{ margin: 0 }}>
            {'Window'}
            <select id="window-select" value={hours} onChange={(e) => setHours(Number(e.target.value))} style={{ marginTop: 4, minWidth: 110 }}>
              {HOUR_OPTIONS.map((value) => <option key={value} value={value}>{value}h</option>)}
            </select>
          </label>
          <button className="btn btn-secondary" onClick={() => refetch()} disabled={isFetching}>
            {isFetching ? 'Refreshing...' : 'Refresh'}
          </button>
        </div>
      </div>

      <p className="page-description">{'Real-time abuse signal counts from rate limiting and spam detection. Use the time window selector to spot spikes.'}</p>

      {isLoading ? (
        <div className="loading">{'Loading abuse stats...'}</div>
      ) : !data ? (
        <div className="panel"><div className="panel-body"><p>{'No data available.'}</p></div></div>
      ) : (
        <>
          <div className="stat-cards">
            <div className="stat-card"><div className="label">{'Window'}</div><div className="value">{data.windowHours}h</div></div>
            <div className="stat-card"><div className="label">{'Signals In Window'}</div><div className="value">{data.totals.inWindow}</div></div>
            <div className="stat-card"><div className="label">{'Sampled Rows'}</div><div className="value">{data.sampledRows}</div></div>
            <div className="stat-card"><div className="label">{'Process Lifetime'}</div><div className="value">{data.totals.processLifetime}</div></div>
          </div>

          {data.alerting && (
            <div className="panel">
              <div className="panel-header">{'Alerting Status'}</div>
              <div className="panel-body">
                <p>Window: {fmtMs(data.alerting.windowMs)} | Cooldown: {fmtMs(data.alerting.cooldownMs)}</p>
                <p>
                  {'Thresholds'}: total {data.alerting.thresholds.total}, RATE_LIMITED {data.alerting.thresholds.rateLimited}, SPAM_DETECTED {data.alerting.thresholds.spamDetected}
                </p>
                <p>
                  {'Current window'}: total {data.alerting.currentWindow.total}, RATE_LIMITED {data.alerting.currentWindow.rateLimited}, SPAM_DETECTED {data.alerting.currentWindow.spamDetected}
                </p>
              </div>
            </div>
          )}

          <div style={{ display: 'grid', gap: 16, gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', marginBottom: 24 }}>
            <CountTable title={'By Code'} rows={data.breakdown.byCode} keyLabel={'Key'} countLabel={'Count'} noDataText={'No data available.'} />
            <CountTable title={'By Action'} rows={data.breakdown.byAction} keyLabel={'Key'} countLabel={'Count'} noDataText={'No data available.'} />
            <CountTable title={'By Route'} rows={data.breakdown.byRoute} keyLabel={'Key'} countLabel={'Count'} noDataText={'No data available.'} />
            <CountTable title={'Top Users'} rows={data.breakdown.topUsers} truncateKey keyLabel={'Key'} countLabel={'Count'} noDataText={'No data available.'} />
            <CountTable title={'Raw Rate Limit Keys'} rows={data.rawSignals.rateLimitEventsByKey} keyLabel={'Key'} countLabel={'Count'} noDataText={'No data available.'} />
            <CountTable title={'Raw Fingerprint Keys'} rows={data.rawSignals.contentFingerprintsByKey} keyLabel={'Key'} countLabel={'Count'} noDataText={'No data available.'} />
          </div>

          <div className="panel">
            <div className="panel-header">{'Recent Events'}</div>
            <div className="panel-body" style={{ paddingTop: 0 }}>
              {!data.recentEvents.length ? (
                <p style={{ color: 'var(--text-muted)' }}>{'No abuse events in this window.'}</p>
              ) : (
                <div className="table-wrapper">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>{'Time'}</th>
                        <th>{'Code'}</th>
                        <th>{'Action'}</th>
                        <th>{'Route'}</th>
                        <th>{'User'}</th>
                        <th>{'Retry'}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.recentEvents.map((event, idx) => (
                        <tr key={`${event.createdAt || 'na'}-${event.code}-${idx}`}>
                          <td>{event.createdAt ? new Date(event.createdAt).toLocaleString('en-US') : '-'}</td>
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

