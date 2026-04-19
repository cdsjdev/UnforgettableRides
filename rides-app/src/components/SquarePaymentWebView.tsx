import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  ActivityIndicator,
  SafeAreaView,
} from 'react-native';
import { WebView, WebViewMessageEvent } from 'react-native-webview';
import { Ionicons } from '@expo/vector-icons';
import { paymentsAPI } from '../services/api';

// HTML is embedded directly so the WebView loads it as a local document with
// baseUrl='https://squareup.com', giving it the secure context Square SDK requires.
// Config (appId, locationId, env) is fetched from the server at runtime — not baked in at build time.
function buildPaymentHtml(appId: string, locationId: string, env: string, amountStr: string, currencyCode: string) {
  const scriptUrl = env === 'production'
    ? 'https://web.squarecdn.com/v1/square.js'
    : 'https://sandbox.web.squarecdn.com/v1/square.js';
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
<title>Card Payment</title>
<script src="${scriptUrl}"></script>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #F9FAFB; padding: 16px; }
  .wallet-row { display: flex; gap: 10px; margin-bottom: 12px; }
  .wallet-row > div { flex: 1; min-height: 48px; }
  .divider { display: flex; align-items: center; gap: 10px; margin-bottom: 14px; color: #9CA3AF; font-size: 13px; }
  .divider::before, .divider::after { content: ''; flex: 1; height: 1px; background: #E5E7EB; }
  #card-container { background: #fff; border: 1px solid #D1D5DB; border-radius: 10px; padding: 14px; min-height: 52px; margin-bottom: 16px; }
  #pay-btn { width: 100%; background: #10B981; color: #fff; border: none; border-radius: 12px; padding: 15px; font-size: 16px; font-weight: 600; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 8px; }
  #pay-btn:disabled { opacity: 0.6; cursor: not-allowed; }
  #status { margin-top: 12px; font-size: 14px; color: #EF4444; text-align: center; min-height: 20px; }
  .spinner { display: inline-block; width: 18px; height: 18px; border: 2px solid #fff; border-top-color: transparent; border-radius: 50%; animation: spin 0.7s linear infinite; }
  @keyframes spin { to { transform: rotate(360deg); } }
</style>
</head>
<body>
<div class="wallet-row">
  <div id="apple-pay-button"></div>
  <div id="google-pay-button"></div>
</div>
<div class="divider" id="divider" style="display:none">or pay by card</div>
<div id="card-container"></div>
<button id="pay-btn" disabled><span id="btn-label">Loading...</span></button>
<div id="status"></div>
<script>
  const APP_ID = ${JSON.stringify(appId)};
  const LOCATION_ID = ${JSON.stringify(locationId)};
  const ORDER_AMOUNT = ${JSON.stringify(amountStr)};
  const CURRENCY = ${JSON.stringify(currencyCode)};

  function postToApp(msg) {
    try {
      if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage(JSON.stringify(msg));
      else window.parent.postMessage(JSON.stringify(msg), '*');
    } catch(e) {}
  }
  function setStatus(msg, isError) {
    const el = document.getElementById('status');
    el.textContent = msg;
    el.style.color = isError ? '#EF4444' : '#6B7280';
  }
  function setLoading(loading, label) {
    const btn = document.getElementById('pay-btn');
    const lbl = document.getElementById('btn-label');
    btn.disabled = loading;
    lbl.innerHTML = loading ? '<span class="spinner"></span>' : (label || 'Pay Now');
  }
  async function handleToken(token) {
    postToApp({ type: 'SQUARE_TOKEN', token });
  }
  async function init() {
    try {
      if (!window.Square) throw new Error('Square SDK failed to load');
      const payments = window.Square.payments(APP_ID, LOCATION_ID);

      const paymentRequest = payments.paymentRequest({
        countryCode: 'US',
        currencyCode: CURRENCY,
        total: { amount: ORDER_AMOUNT, label: 'UnforgettableRides Booking' },
      });

      let hasWallet = false;

      // Apple Pay
      try {
        const applePay = await payments.applePay(paymentRequest);
        await applePay.attach('#apple-pay-button');
        applePay.addEventListener('ontokenization', async (e) => {
          if (e.detail?.token) await handleToken(e.detail.token);
          else setStatus(e.detail?.error?.message || 'Apple Pay failed', true);
        });
        hasWallet = true;
      } catch(_) { document.getElementById('apple-pay-button').style.display = 'none'; }

      // Google Pay
      try {
        const googlePay = await payments.googlePay(paymentRequest);
        await googlePay.attach('#google-pay-button');
        googlePay.addEventListener('ontokenization', async (e) => {
          if (e.detail?.token) await handleToken(e.detail.token);
          else setStatus(e.detail?.error?.message || 'Google Pay failed', true);
        });
        hasWallet = true;
      } catch(_) { document.getElementById('google-pay-button').style.display = 'none'; }

      if (hasWallet) document.getElementById('divider').style.display = 'flex';

      // Card form
      const card = await payments.card();
      await card.attach('#card-container');
      setLoading(false, 'Pay Now');

      document.getElementById('pay-btn').addEventListener('click', async () => {
        setLoading(true);
        setStatus('');
        try {
          const result = await card.tokenize();
          if (result.status === 'OK' && result.token) {
            await handleToken(result.token);
          } else {
            const errMsg = (result.errors && result.errors[0] && result.errors[0].message) || 'Card details invalid';
            setStatus(errMsg, true);
            setLoading(false, 'Pay Now');
          }
        } catch(e) {
          setStatus(e.message || 'Tokenization failed', true);
          setLoading(false, 'Pay Now');
        }
      });
    } catch(e) {
      setStatus(e.message || 'Failed to load payment form', true);
      postToApp({ type: 'SQUARE_ERROR', message: e.message || 'Failed to load payment form' });
    }
  }
  document.addEventListener('DOMContentLoaded', init);
</script>
</body>
</html>`;
}

type Props = {
  visible: boolean;
  orderTotal: string;  // formatted display string e.g. "$12.99"
  orderAmount: number; // numeric total in dollars e.g. 12.99
  currencyCode?: string;
  loadingLabel?: string;
  onToken: (token: string) => void;
  onCancel: () => void;
};

export default function SquarePaymentWebView({
  visible,
  orderTotal,
  orderAmount,
  currencyCode = 'USD',
  loadingLabel = 'Loading payment form...',
  onToken,
  onCancel,
}: Props) {
  const webViewRef = useRef<WebView>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [htmlContent, setHtmlContent] = useState<string | null>(null);
  const amountStr = orderAmount.toFixed(2);

  useEffect(() => {
    if (!visible) return;
    // Reset stale error/content state each time the modal opens.
    setLoadError(false);
    setLoading(true);
    setHtmlContent(null);
    paymentsAPI.getConfig().then((cfg) => {
      const appId = cfg.square_application_id || '';
      const locationId = cfg.square_location_id || '';
      const env = cfg.environment || 'sandbox';
      const currency = cfg.currency?.toUpperCase() || currencyCode;
      setHtmlContent(buildPaymentHtml(appId, locationId, env, amountStr, currency));
    }).catch(() => {
      setLoadError(true);
      setLoading(false);
    });
  }, [visible, amountStr, currencyCode]);

  const handleMessage = (event: WebViewMessageEvent) => {
    try {
      const msg = JSON.parse(event.nativeEvent.data);
      if (msg.type === 'SQUARE_TOKEN' && msg.token) {
        onToken(msg.token);
      } else if (msg.type === 'SQUARE_ERROR') {
        // Error already shown inside the WebView - just log it
        console.warn('[SquareWebView] error:', msg.message);
      }
    } catch (_) {}
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onCancel}>
      <SafeAreaView style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={onCancel} style={styles.cancelBtn}>
            <Ionicons name="close" size={24} color="#374151" />
          </TouchableOpacity>
          <View style={styles.headerCenter}>
            <Text style={styles.headerTitle}>Card Payment</Text>
            <Text style={styles.headerSubtitle}>{orderTotal}</Text>
          </View>
          <View style={styles.cancelBtn} />
        </View>

        {/* Security badge */}
        <View style={styles.securityBadge}>
          <Ionicons name="lock-closed" size={13} color="#059669" />
          <Text style={styles.securityText}>Secured by Square</Text>
        </View>

        {/* WebView */}
        <View style={styles.webViewContainer}>
          {loading && !loadError && (
            <View style={styles.loadingOverlay}>
              <ActivityIndicator size="large" color="#3B82F6" />
              <Text style={styles.loadingText}>{loadingLabel}</Text>
            </View>
          )}
          {loadError ? (
            <View style={styles.errorContainer}>
              <Ionicons name="alert-circle-outline" size={48} color="#EF4444" />
              <Text style={styles.errorText}>Failed to load payment form.{'\n'}Check your connection and try again.</Text>
              <TouchableOpacity
                style={styles.retryBtn}
                onPress={() => { setLoadError(false); setLoading(true); webViewRef.current?.reload(); }}
              >
                <Text style={styles.retryBtnText}>Retry</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <WebView
              ref={webViewRef}
              source={htmlContent ? { html: htmlContent, baseUrl: 'https://squareup.com' } : { html: '<html><body></body></html>' }}
              style={styles.webView}
              onLoadEnd={() => setLoading(false)}
              onError={() => { setLoading(false); setLoadError(true); }}
              onHttpError={() => { setLoading(false); setLoadError(true); }}
              onMessage={handleMessage}
              javaScriptEnabled
              domStorageEnabled
              originWhitelist={['*']}
            />
          )}
        </View>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F9FAFB' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  cancelBtn: { width: 40, alignItems: 'flex-start' },
  headerCenter: { flex: 1, alignItems: 'center' },
  headerTitle: { fontSize: 16, fontWeight: '700', color: '#111827' },
  headerSubtitle: { fontSize: 13, color: '#6B7280', marginTop: 2 },
  securityBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingVertical: 6,
    backgroundColor: '#ECFDF5',
    borderBottomWidth: 1,
    borderBottomColor: '#A7F3D0',
  },
  securityText: { fontSize: 12, color: '#065F46', fontWeight: '500' },
  webViewContainer: { flex: 1, position: 'relative' },
  webView: { flex: 1, backgroundColor: '#F9FAFB' },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#F9FAFB',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 12,
    zIndex: 10,
  },
  loadingText: { fontSize: 14, color: '#6B7280' },
  errorContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32, gap: 12 },
  errorText: { fontSize: 15, color: '#6B7280', textAlign: 'center', lineHeight: 22 },
  retryBtn: { marginTop: 8, backgroundColor: '#3B82F6', paddingVertical: 10, paddingHorizontal: 24, borderRadius: 10 },
  retryBtnText: { color: '#fff', fontWeight: '600', fontSize: 15 },
});
