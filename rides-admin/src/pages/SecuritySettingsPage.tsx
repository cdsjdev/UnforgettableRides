import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { authAPI, settingsAPI } from '../services/api';

function SecuritySettingsPage() {  const queryClient = useQueryClient();
  const [showSecurityPanel, setShowSecurityPanel] = useState(false);
  const [securityError, setSecurityError] = useState('');
  const [securitySuccess, setSecuritySuccess] = useState('');
  const [unlockPassword, setUnlockPassword] = useState('');
  const [unlocked, setUnlocked] = useState(false);
  const [deviceChallengeEnabled, setDeviceChallengeEnabled] = useState(false);
  const [requireVerifiedEmailForSensitive, setRequireVerifiedEmailForSensitive] = useState(false);
  const [publicAppBaseUrl, setPublicAppBaseUrl] = useState('');
  const [emailDeliveryMode, setEmailDeliveryMode] = useState('');
  const [emailWebhookUrl, setEmailWebhookUrl] = useState('');
  const [smtpHost, setSmtpHost] = useState('');
  const [smtpPort, setSmtpPort] = useState('587');
  const [smtpUser, setSmtpUser] = useState('');
  const [smtpPassword, setSmtpPassword] = useState('');
  const [smtpPasswordConfigured, setSmtpPasswordConfigured] = useState(false);
  const [showSmtpPassword, setShowSmtpPassword] = useState(false);
  const [smtpUseTls, setSmtpUseTls] = useState(true);
  const [smtpUseSsl, setSmtpUseSsl] = useState(false);
  const [emailFromName, setEmailFromName] = useState('UnforgettableRides');
  const [emailFromAddress, setEmailFromAddress] = useState('');
  const [emailTestTo, setEmailTestTo] = useState('');

  const { data: globalSettings } = useQuery({
    queryKey: ['global-settings'],
    queryFn: () => settingsAPI.getGlobal(),
  });

  useEffect(() => {
    if (!globalSettings) return;
    const parseBool = (v: any) => {
      const raw = String(v ?? '0').toLowerCase().trim();
      return raw === '1' || raw === 'true' || raw === 'on';
    };
    setDeviceChallengeEnabled(parseBool(globalSettings.auth_device_challenge_enabled));
    setRequireVerifiedEmailForSensitive(parseBool(globalSettings.auth_require_verified_for_sensitive));
    setPublicAppBaseUrl(String(globalSettings.public_app_base_url ?? '').trim());
    setEmailDeliveryMode(String(globalSettings.email_delivery_mode ?? '').trim());
    setEmailWebhookUrl(String(globalSettings.email_notification_webhook_url ?? '').trim());
    setSmtpHost(String(globalSettings.smtp_host ?? '').trim());
    setSmtpPort(String(globalSettings.smtp_port ?? '587').trim() || '587');
    setSmtpUser(String(globalSettings.smtp_user ?? '').trim());
    setSmtpPasswordConfigured(parseBool(globalSettings.smtp_pass_configured));
    setSmtpUseTls(parseBool(globalSettings.smtp_use_tls ?? '1'));
    setSmtpUseSsl(parseBool(globalSettings.smtp_use_ssl ?? '0'));
    setEmailFromName(String(globalSettings.email_from_name ?? 'UnforgettableRides').trim() || 'UnforgettableRides');
    setEmailFromAddress(String(globalSettings.email_from_address ?? '').trim());
  }, [globalSettings]);

  const unlockMutation = useMutation({
    mutationFn: () => authAPI.verifyPassword(unlockPassword),
    onSuccess: () => {
      setSecurityError('');
      setSecuritySuccess('');
      setUnlocked(true);
      setUnlockPassword('');
    },
    onError: (err: any) => {
      setSecurityError(err?.response?.data?.error?.message || err?.message || 'Operation failed. Please try again.');
    },
  });

  const saveSecurityMutation = useMutation({
    mutationFn: (payload: {
      deviceChallengeEnabled: boolean;
      requireVerifiedEmailForSensitive: boolean;
      publicAppBaseUrl: string;
      emailDeliveryMode: string;
      emailWebhookUrl: string;
      smtpHost: string;
      smtpPort: string;
      smtpUser: string;
      smtpPassword: string;
      smtpUseTls: boolean;
      smtpUseSsl: boolean;
      emailFromName: string;
      emailFromAddress: string;
    }) => settingsAPI.updateGlobal({
      auth_device_challenge_enabled: payload.deviceChallengeEnabled ? '1' : '0',
      auth_require_verified_for_sensitive: payload.requireVerifiedEmailForSensitive ? '1' : '0',
      public_app_base_url: payload.publicAppBaseUrl,
      email_delivery_mode: payload.emailDeliveryMode,
      email_notification_webhook_url: payload.emailWebhookUrl,
      smtp_host: payload.smtpHost,
      smtp_port: payload.smtpPort,
      smtp_user: payload.smtpUser,
      smtp_use_tls: payload.smtpUseTls ? '1' : '0',
      smtp_use_ssl: payload.smtpUseSsl ? '1' : '0',
      email_from_name: payload.emailFromName,
      email_from_address: payload.emailFromAddress,
      ...(payload.smtpPassword.trim() ? { smtp_password: payload.smtpPassword.replace(/\s+/g, '').trim() } : {}),
    }),
    onSuccess: (updated) => {
      setSecurityError('');
      setSecuritySuccess('');
      setSmtpPassword('');
      queryClient.setQueryData(['global-settings'], updated);
      queryClient.invalidateQueries({ queryKey: ['global-settings'] });
    },
    onError: (err: any) => {
      setSecurityError(err?.response?.data?.error?.message || err?.message || 'Operation failed. Please try again.');
    },
  });

  const testEmailMutation = useMutation({
    mutationFn: () => settingsAPI.sendEmailTest(emailTestTo.trim() || undefined),
    onSuccess: (data) => {
      setSecurityError('');
      setSecuritySuccess(`Test email sent to ${data.to}.`);
    },
    onError: (err: any) => {
      setSecuritySuccess('');
      setSecurityError(err?.response?.data?.error?.message || err?.message || 'Operation failed. Please try again.');
    },
  });

  return (
    <div>
      <div className="page-title-bar">
        <h1>{'Settings'}</h1>
      </div>

      <div className="panel stores-security-panel">
        <div className="panel-header stores-security-panel-header">
          <div className="stores-security-title-wrap">
            <h3>{'Security Settings'}</h3>
            <p>{'Global security controls for account sign-in.'}</p>
          </div>
          <button
            type="button"
            className="stores-security-toggle"
            onClick={() => setShowSecurityPanel((v) => !v)}
            aria-expanded={showSecurityPanel}
            aria-label={showSecurityPanel ? 'Collapse security settings' : 'Expand security settings'}
          >
            <span className={`stores-security-chevron${showSecurityPanel ? ' open' : ''}`}>▾</span>
          </button>
        </div>

        {showSecurityPanel && (
          <div className="panel-body stores-security-body">
            {!unlocked ? (
              <div className="form-grid">
                <div className="full-width">
                  <label htmlFor="security-unlock-password">Confirm admin password</label>
                  <input
                    id="security-unlock-password"
                    type="password"
                    value={unlockPassword}
                    onChange={(e) => setUnlockPassword(e.target.value)}
                    placeholder="Enter current password to unlock settings"
                    disabled={unlockMutation.isPending}
                  />
                </div>
                <div className="full-width form-actions">
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={() => unlockMutation.mutate()}
                    disabled={unlockMutation.isPending || !unlockPassword.trim()}
                  >
                    {unlockMutation.isPending ? 'Saving...' : 'Unlock'}
                  </button>
                </div>
              </div>
            ) : (
              <>
                <div className="form-grid">
                  <div className="full-width stores-security-inline-options">
                    <label htmlFor="stores-device-challenge" className="stores-check-label">
                      <input
                        id="stores-device-challenge"
                        type="checkbox"
                        checked={deviceChallengeEnabled}
                        onChange={(e) => setDeviceChallengeEnabled(e.target.checked)}
                        disabled={saveSecurityMutation.isPending}
                      />
                      <span>{'Require email code on new device login'}</span>
                    </label>
                    <label htmlFor="stores-sensitive-verify" className="stores-check-label">
                      <input
                        id="stores-sensitive-verify"
                        type="checkbox"
                        checked={requireVerifiedEmailForSensitive}
                        onChange={(e) => setRequireVerifiedEmailForSensitive(e.target.checked)}
                        disabled={saveSecurityMutation.isPending}
                      />
                      <span>{'Require verified email for sensitive actions'}</span>
                    </label>
                  </div>

                  <div>
                    <label htmlFor="stores-public-app-base-url">{'Public App Base URL'}</label>
                    <input
                      id="stores-public-app-base-url"
                      value={publicAppBaseUrl}
                      onChange={(e) => setPublicAppBaseUrl(e.target.value)}
                      placeholder={'https://app.unforgettablerides.com'}
                      disabled={saveSecurityMutation.isPending}
                    />
                    <small className="stores-security-hint">{'Used for email verification links and redirect target (for example https://app.unforgettablerides.com).'}</small>
                  </div>

                  <div>
                    <label htmlFor="stores-email-mode">{'Email Delivery Mode'}</label>
                    <select
                      id="stores-email-mode"
                      value={emailDeliveryMode}
                      onChange={(e) => setEmailDeliveryMode(e.target.value)}
                      disabled={saveSecurityMutation.isPending}
                    >
                      <option value="">{'Auto (Webhook -> SMTP)'}</option>
                      <option value="smtp">{'SMTP Only'}</option>
                      <option value="webhook">{'Webhook Only'}</option>
                    </select>
                  </div>
                  <div>
                    <label htmlFor="stores-email-webhook">{'Email Webhook URL'}</label>
                    <input
                      id="stores-email-webhook"
                      value={emailWebhookUrl}
                      onChange={(e) => setEmailWebhookUrl(e.target.value)}
                      placeholder="https://example.com/email-webhook"
                      disabled={saveSecurityMutation.isPending}
                    />
                  </div>

                  <div>
                    <label htmlFor="stores-smtp-host">{'SMTP Host'}</label>
                    <input
                      id="stores-smtp-host"
                      value={smtpHost}
                      onChange={(e) => setSmtpHost(e.target.value)}
                      disabled={saveSecurityMutation.isPending}
                    />
                  </div>
                  <div>
                    <label htmlFor="stores-smtp-port">{'SMTP Port'}</label>
                    <input
                      id="stores-smtp-port"
                      value={smtpPort}
                      onChange={(e) => setSmtpPort(e.target.value)}
                      disabled={saveSecurityMutation.isPending}
                    />
                  </div>
                  <div>
                    <label htmlFor="stores-smtp-user">{'SMTP User'}</label>
                    <input
                      id="stores-smtp-user"
                      value={smtpUser}
                      onChange={(e) => setSmtpUser(e.target.value)}
                      disabled={saveSecurityMutation.isPending}
                    />
                  </div>
                  <div>
                    <label htmlFor="stores-smtp-pass">{'SMTP Password'}</label>
                    <div className="password-input-wrap">
                      <input
                        id="stores-smtp-pass"
                        type={showSmtpPassword ? 'text' : 'password'}
                        value={smtpPassword}
                        onChange={(e) => setSmtpPassword(e.target.value)}
                        placeholder={smtpPasswordConfigured ? 'Configured (leave blank to keep unchanged)' : 'Not configured yet'}
                        disabled={saveSecurityMutation.isPending}
                      />
                      <button
                        type="button"
                        className="password-toggle"
                        onClick={() => setShowSmtpPassword((v) => !v)}
                        aria-label={showSmtpPassword ? 'Hide password' : 'Show password'}
                        title={showSmtpPassword ? 'Hide password' : 'Show password'}
                        disabled={saveSecurityMutation.isPending}
                      >
                        {showSmtpPassword ? 'Hide password' : 'Show password'}
                      </button>
                    </div>
                  </div>

                  <div className="full-width stores-security-inline-options">
                    <label className="stores-check-label">
                      <input
                        type="checkbox"
                        checked={smtpUseTls}
                        onChange={(e) => setSmtpUseTls(e.target.checked)}
                        disabled={saveSecurityMutation.isPending}
                      />
                      <span>{'Use TLS'}</span>
                    </label>
                    <label className="stores-check-label">
                      <input
                        type="checkbox"
                        checked={smtpUseSsl}
                        onChange={(e) => setSmtpUseSsl(e.target.checked)}
                        disabled={saveSecurityMutation.isPending}
                      />
                      <span>{'Use SSL'}</span>
                    </label>
                  </div>

                  <div>
                    <label htmlFor="stores-from-name">{'From Name'}</label>
                    <input
                      id="stores-from-name"
                      value={emailFromName}
                      onChange={(e) => setEmailFromName(e.target.value)}
                      disabled={saveSecurityMutation.isPending}
                    />
                  </div>
                  <div>
                    <label htmlFor="stores-from-address">{'From Email'}</label>
                    <input
                      id="stores-from-address"
                      value={emailFromAddress}
                      onChange={(e) => setEmailFromAddress(e.target.value)}
                      disabled={saveSecurityMutation.isPending}
                    />
                  </div>

                  <div className="full-width stores-security-test-row">
                    <input
                      value={emailTestTo}
                      onChange={(e) => setEmailTestTo(e.target.value)}
                      placeholder={'Test recipient (optional, default current admin email)'}
                      disabled={testEmailMutation.isPending || saveSecurityMutation.isPending}
                    />
                    <button
                      type="button"
                      className="btn btn-secondary"
                      onClick={() => testEmailMutation.mutate()}
                      disabled={testEmailMutation.isPending || saveSecurityMutation.isPending}
                    >
                      {testEmailMutation.isPending ? 'Sending...' : 'Send Test Email'}
                    </button>
                  </div>

                  <div className="full-width form-actions stores-security-actions">
                    <button
                      type="button"
                      className="btn btn-primary"
                      onClick={() => saveSecurityMutation.mutate({
                        deviceChallengeEnabled,
                        requireVerifiedEmailForSensitive,
                        publicAppBaseUrl,
                        emailDeliveryMode,
                        emailWebhookUrl,
                        smtpHost,
                        smtpPort,
                        smtpUser,
                        smtpPassword,
                        smtpUseTls,
                        smtpUseSsl,
                        emailFromName,
                        emailFromAddress,
                      })}
                      disabled={saveSecurityMutation.isPending}
                    >
                      {saveSecurityMutation.isPending ? 'Saving...' : 'Save'}
                    </button>
                  </div>
                </div>
                <small className="stores-security-hint">{'When enabled, users must verify by email code on untrusted devices.'}</small>
                <small className="stores-security-hint">{'When disabled, users can checkout/save appointments without email verification (temporary mode).'}</small>
              </>
            )}
            {securityError && (
              <div className="alert alert-error" style={{ marginTop: 10 }}>{securityError}</div>
            )}
            {securitySuccess && (
              <div className="alert alert-success" style={{ marginTop: 10 }}>{securitySuccess}</div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default SecuritySettingsPage;

