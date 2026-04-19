const { normalizeSquarePaymentStatus, extractSquareErrorMessage } = require('./payment-utils');

function registerPaymentsRoutes({
  app,
  db,
  apiResponse,
  isStaff,
  sendNotification,
  sendEmailNotification,
  NODE_ENV,
  stripe,
  STRIPE_WEBHOOK_SECRET,
  PAYMENT_CURRENCY,
  STRIPE_PUBLISHABLE_KEY,
  squareClient,
  SQUARE_APPLICATION_ID,
  SQUARE_LOCATION_ID,
  SQUARE_ENV,
  paypalClient,
  PAYPAL_CLIENT_ID,
  PAYPAL_ENV,
  uuidv4,
  isAuthRequireVerifiedForSensitive,
}) {
  function ensureVerifiedForSensitive(req, res) {
    if (!isAuthRequireVerifiedForSensitive()) return true;
    if (isStaff(req.user)) return true;
    if (req.user?.email_verified_at) return true;
    res.status(403).json(apiResponse(null, {
      code: 'EMAIL_VERIFICATION_REQUIRED',
      message: 'Please verify your email before this action.',
    }));
    return false;
  }

  async function sendPaymentConfirmedEmail(order) {
    const to = order.customer_email || (order.user_id
      ? db.prepare('SELECT email FROM users WHERE id = ?').get(order.user_id)?.email
      : null);
    if (!to) return;
    const orderId = order.id;
    const total = `$${Number(order.total).toFixed(2)}`;
    const items = db.prepare('SELECT * FROM order_items WHERE order_id = ?').all(orderId);
    const itemRowsHtml = items.map(i =>
      `<tr><td style="padding:4px 8px">${i.product_name || i.product_id}</td><td style="padding:4px 8px;text-align:center">${i.quantity}</td><td style="padding:4px 8px;text-align:right">$${Number(i.unit_price * i.quantity).toFixed(2)}</td></tr>`
    ).join('');
    const itemsText = items.map(i =>
      `  • ${i.product_name || i.product_id} x${i.quantity}  $${Number(i.unit_price * i.quantity).toFixed(2)}`
    ).join('\n');

    const subject = `Your UnforgettableRides order #${orderId} is confirmed — payment received`;
    const text = [
      'Great news — your payment was successful and your order is confirmed.',
      '',
      `Order: #${orderId}`,
      `Total: ${total}`,
      '',
      'Items:',
      itemsText,
      '',
      'Thank you for choosing UnforgettableRides!',
    ].join('\n');
    const html = `
<div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;color:#111827">
  <div style="background:#3B82F6;padding:24px;border-radius:8px 8px 0 0">
    <h1 style="color:#fff;margin:0;font-size:20px">🐾 UnforgettableRides</h1>
  </div>
  <div style="background:#fff;padding:24px;border:1px solid #E5E7EB;border-top:none;border-radius:0 0 8px 8px">
    <p style="font-size:16px">Great news — your payment was successful and your order is confirmed.</p>
    <table style="width:100%;border-collapse:collapse;margin:16px 0">
      <tr style="background:#F9FAFB"><th style="padding:8px;text-align:left">Item</th><th style="padding:8px;text-align:center">Qty</th><th style="padding:8px;text-align:right">Price</th></tr>
      ${itemRowsHtml}
      <tr style="border-top:2px solid #E5E7EB;font-weight:700">
        <td colspan="2" style="padding:8px">Total</td>
        <td style="padding:8px;text-align:right">${total}</td>
      </tr>
    </table>
    <p style="color:#6B7280;font-size:13px">Order #${orderId}</p>
    <p style="color:#6B7280;font-size:13px">Thank you for choosing UnforgettableRides!</p>
  </div>
</div>`;
    await sendEmailNotification({ kind: 'order_confirmed', to, payload: { subject, message: text, html } }).catch(() => {});
  }

  function getOrderOrReject(req, res, orderId) {
    const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId);
    if (!order) {
      res.status(404).json(apiResponse(null, { code: 'NOT_FOUND', message: 'Order not found' }));
      return null;
    }
    if (order.user_id !== req.user.id && !isStaff(req.user)) {
      res.status(403).json(apiResponse(null, { code: 'FORBIDDEN', message: 'Access denied' }));
      return null;
    }
    if (order.status !== 'pending') {
      res.status(400).json(apiResponse(null, {
        code: 'ORDER_NOT_PAYABLE',
        message: `Order is already ${order.status} and cannot be paid.`,
      }));
      return null;
    }
    return order;
  }

  const isSquareEnabled = Boolean(squareClient && SQUARE_APPLICATION_ID && SQUARE_LOCATION_ID);

  // Public config endpoint used by checkout UI.
  app.get('/api/v1/payments/config', (req, res) => {
    const provider = isSquareEnabled ? 'square' : (stripe ? 'stripe' : 'none');
    res.json(apiResponse({
      provider,
      publishable_key: provider === 'square' ? String(SQUARE_APPLICATION_ID || '') : String(STRIPE_PUBLISHABLE_KEY || ''),
      stripe_enabled: !!stripe,
      square_enabled: isSquareEnabled,
      square_application_id: String(SQUARE_APPLICATION_ID || ''),
      square_location_id: String(SQUARE_LOCATION_ID || ''),
      paypal_enabled: Boolean(paypalClient && PAYPAL_CLIENT_ID),
      paypal_client_id: PAYPAL_CLIENT_ID || '',
      paypal_environment: PAYPAL_ENV,
      currency: PAYMENT_CURRENCY,
      environment: isSquareEnabled ? SQUARE_ENV : undefined,
    }));
  });

  // Square payment HTML page — served inside a WebView on native mobile.
  // Loads Square Web Payments SDK, mounts card form, tokenizes and postMessages the token back.
  app.get('/api/v1/payments/square/webview', (req, res) => {
    if (!isSquareEnabled) {
      return res.status(503).send('<p>Square not configured</p>');
    }
    const appId = String(SQUARE_APPLICATION_ID || '');
    const locationId = String(SQUARE_LOCATION_ID || '');
    const scriptUrl = SQUARE_ENV === 'production'
      ? 'https://web.squarecdn.com/v1/square.js'
      : 'https://sandbox.web.squarecdn.com/v1/square.js';

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    res.send(`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
<title>Card Payment</title>
<script src="${scriptUrl}"></script>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #F9FAFB; padding: 16px; }
  #card-container { background: #fff; border: 1px solid #D1D5DB; border-radius: 10px; padding: 14px; min-height: 52px; margin-bottom: 16px; }
  #pay-btn {
    width: 100%; background: #10B981; color: #fff; border: none;
    border-radius: 12px; padding: 15px; font-size: 16px; font-weight: 600;
    cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 8px;
  }
  #pay-btn:disabled { opacity: 0.6; cursor: not-allowed; }
  #status { margin-top: 12px; font-size: 14px; color: #EF4444; text-align: center; min-height: 20px; }
  .spinner { display: inline-block; width: 18px; height: 18px; border: 2px solid #fff; border-top-color: transparent; border-radius: 50%; animation: spin 0.7s linear infinite; }
  @keyframes spin { to { transform: rotate(360deg); } }
</style>
</head>
<body>
<div id="card-container"></div>
<button id="pay-btn" disabled>
  <span id="btn-label">Loading...</span>
</button>
<div id="status"></div>
<script>
  const APP_ID = ${JSON.stringify(appId)};
  const LOCATION_ID = ${JSON.stringify(locationId)};

  function postToApp(msg) {
    try {
      // React Native WebView bridge
      if (window.ReactNativeWebView) {
        window.ReactNativeWebView.postMessage(JSON.stringify(msg));
      } else {
        window.parent.postMessage(JSON.stringify(msg), '*');
      }
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
    lbl.innerHTML = loading
      ? '<span class="spinner"></span>'
      : (label || 'Pay Now');
  }

  async function init() {
    try {
      if (!window.Square) throw new Error('Square SDK failed to load');
      const payments = window.Square.payments(APP_ID, LOCATION_ID);
      const card = await payments.card();
      await card.attach('#card-container');
      setLoading(false, 'Pay Now');

      document.getElementById('pay-btn').addEventListener('click', async () => {
        setLoading(true);
        setStatus('');
        try {
          const result = await card.tokenize();
          if (result.status === 'OK' && result.token) {
            postToApp({ type: 'SQUARE_TOKEN', token: result.token });
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
</html>`);
  });

  // Stripe compatibility endpoint kept for older clients; new checkout uses Square.
  app.post('/api/v1/payments/create-intent', async (req, res) => {
    if (!ensureVerifiedForSensitive(req, res)) return;
    return res.status(410).json(apiResponse(null, {
      code: 'PAYMENT_PROVIDER_CHANGED',
      message: 'Stripe flow is disabled. Please retry from the latest checkout screen.',
    }));
  });

  // Create Square card payment from tokenized source_id.
  // Note: autocomplete=true should return COMPLETED synchronously in normal card flows.
  // If we later support delayed capture/async statuses, add Square webhooks to reconcile
  // APPROVED/PENDING payments server-side and finalize order transitions.
  app.post('/api/v1/payments/square/create-payment', async (req, res) => {
    try {
      if (!ensureVerifiedForSensitive(req, res)) return;
      if (!isSquareEnabled) {
        return res.status(503).json(apiResponse(null, {
          code: 'SQUARE_NOT_CONFIGURED',
          message: 'Square payment processing is not configured.',
        }));
      }

      const orderId = req.body?.order_id;
      const sourceId = req.body?.source_id;
      const verificationToken = req.body?.verification_token || undefined;
      const idempotencyKey = String(req.body?.idempotency_key || `sq-${uuidv4()}`);

      if (!orderId || !sourceId) {
        return res.status(400).json(apiResponse(null, {
          code: 'VALIDATION',
          message: 'order_id and source_id are required',
        }));
      }

      const order = getOrderOrReject(req, res, orderId);
      if (!order) return;

      const amountCents = Math.round(Number(order.total || 0) * 100);
      if (!Number.isFinite(amountCents) || amountCents < 50) {
        return res.status(400).json(apiResponse(null, {
          code: 'AMOUNT_TOO_LOW',
          message: 'Order total must be at least $0.50',
        }));
      }

      const alreadySucceeded = db.prepare(
        "SELECT * FROM payments WHERE order_id = ? AND status = 'succeeded' ORDER BY created_at DESC LIMIT 1"
      ).get(orderId);
      if (alreadySucceeded) {
        return res.json(apiResponse({
          payment_id: alreadySucceeded.id,
          provider_payment_id: alreadySucceeded.provider_payment_id || alreadySucceeded.stripe_payment_intent_id,
          status: alreadySucceeded.status,
          amount: alreadySucceeded.amount,
          currency: alreadySucceeded.currency,
          receipt_url: alreadySucceeded.receipt_url,
        }));
      }

      let parsedShipping = null;
      if (order.shipping_address) {
        try { parsedShipping = typeof order.shipping_address === 'string' ? JSON.parse(order.shipping_address) : order.shipping_address; } catch (_) {}
      }

      const squareResp = await squareClient.payments.create({
        sourceId: String(sourceId),
        idempotencyKey,
        amountMoney: {
          amount: BigInt(amountCents),
          currency: String(PAYMENT_CURRENCY || 'usd').toUpperCase(),
        },
        locationId: String(SQUARE_LOCATION_ID),
        referenceId: String(orderId),
        note: `UnforgettableRides order ${orderId}`,
        autocomplete: true,
        verificationToken,
        buyerEmailAddress: order.customer_email || req.user?.email || undefined,
        ...(parsedShipping && {
          shippingAddress: {
            addressLine1: parsedShipping.address_line1,
            addressLine2: parsedShipping.address_line2 || undefined,
            locality: parsedShipping.city,
            administrativeDistrictLevel1: parsedShipping.state,
            postalCode: parsedShipping.postal_code,
            country: parsedShipping.country,
          },
        }),
      });

      const squarePayment = squareResp?.payment || squareResp?.result?.payment;
      const providerPaymentId = squarePayment?.id || null;
      const normalizedStatus = normalizeSquarePaymentStatus(squarePayment?.status);
      const receiptUrl = squarePayment?.receiptUrl || null;

      const paymentId = `pay-${uuidv4()}`;
      db.prepare(
        `INSERT INTO payments
          (id, order_id, stripe_payment_intent_id, provider, provider_payment_id, amount, currency, status, payment_method, receipt_url, failure_reason)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        paymentId,
        orderId,
        null,
        'square',
        providerPaymentId,
        amountCents,
        PAYMENT_CURRENCY,
        normalizedStatus,
        squarePayment?.sourceType || 'card',
        receiptUrl,
        null
      );

      if (normalizedStatus === 'succeeded') {
        db.prepare(
          "UPDATE orders SET status = 'confirmed', updated_at = datetime('now') WHERE id = ? AND status = 'pending'"
        ).run(orderId);
        sendNotification(order.user_id, 'payment_succeeded', {
          order_id: order.id,
          total: order.total,
        }).catch(() => {});
        sendPaymentConfirmedEmail(order).catch(() => {});
      }

      return res.json(apiResponse({
        payment_id: paymentId,
        provider_payment_id: providerPaymentId,
        status: normalizedStatus,
        amount: amountCents,
        currency: PAYMENT_CURRENCY,
        receipt_url: receiptUrl,
      }));
    } catch (err) {
      console.error('Square payment create error:', err);
      const msg = extractSquareErrorMessage(err);
      const providerStatusCode = Number(err?.statusCode || 0);
      const providerCode = String(err?.errors?.[0]?.code || '').toUpperCase();
      if (providerStatusCode === 401 || providerCode === 'UNAUTHORIZED') {
        return res.status(503).json(apiResponse(null, {
          code: 'SQUARE_AUTH_ERROR',
          message: 'Square credentials are invalid or expired. Please update SQUARE_ACCESS_TOKEN.',
        }));
      }
      return res.status(500).json(apiResponse(null, { code: 'PAYMENT_ERROR', message: msg }));
    }
  });

  app.get('/api/v1/payments/order/:orderId', (req, res) => {
    try {
      const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(req.params.orderId);
      if (!order) {
        return res.status(404).json(apiResponse(null, { code: 'NOT_FOUND', message: 'Order not found' }));
      }
      if (order.user_id !== req.user.id && !isStaff(req.user)) {
        return res.status(403).json(apiResponse(null, { code: 'FORBIDDEN', message: 'Access denied' }));
      }
      const payment = db.prepare(
        'SELECT * FROM payments WHERE order_id = ? ORDER BY created_at DESC LIMIT 1'
      ).get(req.params.orderId);
      res.json(apiResponse(payment || null));
    } catch (err) {
      console.error('Payment status error:', err);
      res.status(500).json(apiResponse(null, { code: 'DB_ERROR', message: err.message }));
    }
  });

  // ── PayPal ──────────────────────────────────────────────────────────────────

  const isPayPalEnabled = Boolean(paypalClient && PAYPAL_CLIENT_ID);

  // Create a PayPal order — called when user clicks the PayPal button.
  app.post('/api/v1/payments/paypal/create-order', async (req, res) => {
    try {
      if (!ensureVerifiedForSensitive(req, res)) return;
      // Validate input and ownership first (before capability check) to return correct HTTP codes.
      const orderId = req.body?.order_id;
      if (!orderId) {
        return res.status(400).json(apiResponse(null, { code: 'VALIDATION', message: 'order_id is required' }));
      }
      const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId);
      if (!order) {
        return res.status(404).json(apiResponse(null, { code: 'NOT_FOUND', message: 'Order not found' }));
      }
      if (order.user_id !== req.user?.id && !isStaff(req.user)) {
        return res.status(403).json(apiResponse(null, { code: 'FORBIDDEN', message: 'Access denied' }));
      }
      if (order.status !== 'pending') {
        return res.status(400).json(apiResponse(null, { code: 'ORDER_NOT_PAYABLE', message: `Order is already ${order.status}` }));
      }
      if (!isPayPalEnabled) {
        return res.status(503).json(apiResponse(null, { code: 'PAYPAL_NOT_CONFIGURED', message: 'PayPal is not configured.' }));
      }

      const amountStr = Number(order.total || 0).toFixed(2);
      const currency = String(PAYMENT_CURRENCY || 'usd').toUpperCase();

      const { OrdersController } = require('@paypal/paypal-server-sdk');
      const ordersController = new OrdersController(paypalClient);

      const ppResp = await ordersController.ordersCreate({
        body: {
          intent: 'CAPTURE',
          purchaseUnits: [{
            referenceId: orderId,
            amount: { currencyCode: currency, value: amountStr },
            description: `UnforgettableRides order ${orderId}`,
          }],
        },
      });

      const ppOrder = ppResp?.result || ppResp;
      return res.json(apiResponse({ paypal_order_id: ppOrder.id }));
    } catch (err) {
      console.error('PayPal create-order error:', err);
      return res.status(500).json(apiResponse(null, { code: 'PAYPAL_ERROR', message: err?.message || 'Failed to create PayPal order' }));
    }
  });

  // Capture a PayPal order after the buyer approves it.
  app.post('/api/v1/payments/paypal/capture-order', async (req, res) => {
    try {
      if (!ensureVerifiedForSensitive(req, res)) return;
      const { order_id: ridesOrderId, paypal_order_id: paypalOrderId } = req.body || {};
      if (!ridesOrderId || !paypalOrderId) {
        return res.status(400).json(apiResponse(null, { code: 'VALIDATION', message: 'order_id and paypal_order_id are required' }));
      }

      const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(ridesOrderId);
      if (!order) return res.status(404).json(apiResponse(null, { code: 'NOT_FOUND', message: 'Order not found' }));
      if (order.user_id !== req.user?.id && !isStaff(req.user)) {
        return res.status(403).json(apiResponse(null, { code: 'FORBIDDEN', message: 'Access denied' }));
      }

      // Idempotency: if already succeeded, return existing record (before capability check).
      const existing = db.prepare(
        "SELECT * FROM payments WHERE order_id = ? AND provider = 'paypal' AND status = 'succeeded' LIMIT 1"
      ).get(ridesOrderId);
      if (existing) {
        return res.json(apiResponse({ payment_id: existing.id, status: 'succeeded', amount: existing.amount, currency: existing.currency }));
      }

      // Reject capture on non-pending orders to prevent double-payment or accounting inconsistencies.
      if (order.status !== 'pending') {
        return res.status(400).json(apiResponse(null, { code: 'ORDER_NOT_PAYABLE', message: `Order is already ${order.status}` }));
      }

      if (!isPayPalEnabled) {
        return res.status(503).json(apiResponse(null, { code: 'PAYPAL_NOT_CONFIGURED', message: 'PayPal is not configured.' }));
      }

      const { OrdersController } = require('@paypal/paypal-server-sdk');
      const ordersController = new OrdersController(paypalClient);
      const captureResp = await ordersController.ordersCapture({ id: paypalOrderId });
      const captured = captureResp?.result || captureResp;
      const captureStatus = String(captured?.status || '').toUpperCase();

      const normalizedStatus = captureStatus === 'COMPLETED' ? 'succeeded' : 'pending';
      const captureDetail = captured?.purchaseUnits?.[0]?.payments?.captures?.[0];
      const providerPaymentId = captureDetail?.id || paypalOrderId;
      const amountCents = Math.round(Number(captureDetail?.amount?.value || order.total) * 100);
      const currency = String(captureDetail?.amount?.currencyCode || PAYMENT_CURRENCY || 'usd').toLowerCase();

      const paymentId = `pay-${uuidv4()}`;
      db.prepare(
        `INSERT INTO payments
          (id, order_id, stripe_payment_intent_id, provider, provider_payment_id, amount, currency, status, payment_method, receipt_url, failure_reason)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(paymentId, ridesOrderId, null, 'paypal', providerPaymentId, amountCents, currency, normalizedStatus, 'paypal', null, null);

      if (normalizedStatus === 'succeeded') {
        db.prepare(
          "UPDATE orders SET status = 'confirmed', updated_at = datetime('now') WHERE id = ? AND status = 'pending'"
        ).run(ridesOrderId);
        sendNotification(order.user_id, 'payment_succeeded', { order_id: order.id, total: order.total }).catch(() => {});
        sendPaymentConfirmedEmail(order).catch(() => {});
      }

      return res.json(apiResponse({ payment_id: paymentId, status: normalizedStatus, amount: amountCents, currency }));
    } catch (err) {
      console.error('PayPal capture-order error:', err);
      return res.status(500).json(apiResponse(null, { code: 'PAYPAL_ERROR', message: err?.message || 'Failed to capture PayPal payment' }));
    }
  });

  // Stripe webhook retained for legacy payments already in flight.
  app.post('/api/v1/payments/webhook', async (req, res) => {
    if (!stripe) {
      return res.status(503).send('Stripe not configured');
    }
    const allowUnsafeWebhook = NODE_ENV === 'development' || NODE_ENV === 'test';
    if (!STRIPE_WEBHOOK_SECRET && !allowUnsafeWebhook) {
      console.error('Stripe webhook rejected: STRIPE_WEBHOOK_SECRET is not configured');
      return res.status(503).send('Webhook signing secret is required');
    }

    let event;
    try {
      if (STRIPE_WEBHOOK_SECRET) {
        const sig = req.headers['stripe-signature'];
        event = stripe.webhooks.constructEvent(req.body, sig, STRIPE_WEBHOOK_SECRET);
      } else {
        const raw = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : req.body;
        event = typeof raw === 'string' ? JSON.parse(raw) : raw;
      }
    } catch (err) {
      console.error('Webhook signature verification failed:', err.message);
      return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    switch (event.type) {
      case 'payment_intent.succeeded': {
        const pi = event.data.object;
        const payment = db.prepare(
          'SELECT * FROM payments WHERE stripe_payment_intent_id = ?'
        ).get(pi.id);
        if (payment) {
          const receiptUrl = pi.charges?.data?.[0]?.receipt_url || pi.latest_charge?.receipt_url || null;
          db.prepare(
            "UPDATE payments SET provider = 'stripe', provider_payment_id = ?, status = 'succeeded', payment_method = ?, receipt_url = ?, updated_at = datetime('now') WHERE id = ?"
          ).run(pi.id, pi.payment_method_types?.[0] || 'card', receiptUrl, payment.id);
          db.prepare(
            "UPDATE orders SET status = 'confirmed', updated_at = datetime('now') WHERE id = ? AND status = 'pending'"
          ).run(payment.order_id);
          const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(payment.order_id);
          if (order) {
            sendNotification(order.user_id, 'payment_succeeded', {
              order_id: order.id,
              total: order.total,
            }).catch(() => {});
            sendPaymentConfirmedEmail(order).catch(() => {});
          }
        }
        break;
      }
      case 'payment_intent.payment_failed': {
        const pi = event.data.object;
        const payment = db.prepare(
          'SELECT * FROM payments WHERE stripe_payment_intent_id = ?'
        ).get(pi.id);
        if (payment) {
          const failureReason = pi.last_payment_error?.message || 'Payment failed';
          db.prepare(
            "UPDATE payments SET provider = 'stripe', provider_payment_id = ?, status = 'failed', failure_reason = ?, updated_at = datetime('now') WHERE id = ?"
          ).run(pi.id, failureReason, payment.id);
        }
        break;
      }
    }

    res.json({ received: true });
  });
}

module.exports = {
  registerPaymentsRoutes,
};

