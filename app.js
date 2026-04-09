const PRESENTATION_TOKEN = 'eyJhbGciOiJkaXIiLCJlbmMiOiJBMjU2R0NNIiwia2lkIjoiMGpwTEJBLlJSMUJIZyJ9..2babjWI6yVhM75e6.Q0DIwLEeelvqWRHQYXZyHol9Pv98pEBkjbYrz_Hz-t43AY0u18fMpKubHNEJ0eqPlcespP5F2urfgSn2Lf6uSTVOWJ71YXDjurbi0Vpzg7k7RknQ6hhyBH3_HHYg8-84Z4OzDLWz86WbQTLVMv15MTy_v6NAFng_buzEv4UR.n5cdlQhQZQs70ZYTcAuPQQ';
const REMOTE_TOKEN = 'eyJhbGciOiJkaXIiLCJlbmMiOiJBMjU2R0NNIiwia2lkIjoiMGpwTEJBLmdyNHFqQSJ9..ANXAVQmCtk843Kh9.c24ILpIma0k9oOaS0dN5_5yumpOXrpbVBEqKlRyZchqZLQHimnbRb_rsc8M7cXoOtCKkCQFL7dvTvRdBLarBZ3cwy3CKmtZyh4czkO3TQN5karop-vBu190MxPSwqawoUfoXT4AKcrwMPR6_FPO-PWOZRTCRBqJ5JFiCQg.r0Xxb6kaohwVWKbP-QEcOw';
const CHANNEL_PREFIX = 'montreal-fireworks:';

function getSessionId() {
  const url = new URL(window.location.href);
  let sessionId = url.searchParams.get('session');

  if (!sessionId) {
    sessionId = Math.random().toString(36).slice(2, 10);
    url.searchParams.set('session', sessionId);
    window.history.replaceState({}, '', url);
  }

  return sessionId;
}

function getRemoteUrl(sessionId) {
  const url = new URL('remote.html', window.location.href);
  url.searchParams.set('session', sessionId);
  return url.toString();
}

function updateStatus(text, state) {
  const element = document.getElementById('ably-status');
  if (!element) return;
  element.textContent = text;
  element.dataset.state = state || '';
}

function showToast(message) {
  const toast = document.getElementById('remote-toast');
  if (!toast) return;

  toast.textContent = message;
  toast.classList.add('is-visible');

  window.clearTimeout(showToast.timeoutId);
  showToast.timeoutId = window.setTimeout(() => {
    toast.classList.remove('is-visible');
  }, 2600);
}

function setOverlayCollapsed(collapsed) {
  const overlay = document.getElementById('remote-overlay');
  const toggle = document.getElementById('remote-toggle');
  if (!overlay || !toggle) return;

  overlay.classList.toggle('is-collapsed', collapsed);
  toggle.setAttribute('aria-expanded', String(!collapsed));
}

function publishCommand(channel, payload, feedbackElement, eventName = 'command') {
  if (!channel) {
    if (feedbackElement) feedbackElement.textContent = 'Remote channel is unavailable.';
    return;
  }

  channel.publish(eventName, payload, (error) => {
    if (!feedbackElement) return;
    feedbackElement.textContent = error ? `Send failed: ${error.message || error}` : `Sent: ${payload.action}`;
  });
}

function initializePresentation() {
  const deck = new Reveal({
    hash: true,
    slideNumber: true,
    transition: 'slide',
    backgroundTransition: 'fade'
  });

  deck.initialize();

  const sessionId = getSessionId();
  const remoteUrl = getRemoteUrl(sessionId);
  document.getElementById('session-id').textContent = sessionId;
  document.getElementById('remote-link').href = remoteUrl;
  document.getElementById('remote-link').textContent = remoteUrl;

  document.getElementById('remote-toggle')?.addEventListener('click', () => {
    const overlay = document.getElementById('remote-overlay');
    const collapsed = overlay ? overlay.classList.contains('is-collapsed') : true;
    setOverlayCollapsed(!collapsed);
  });

  document.getElementById('remote-close')?.addEventListener('click', () => {
    setOverlayCollapsed(true);
  });

  const qrContainer = document.getElementById('remote-qr');
  if (qrContainer) {
    qrContainer.replaceChildren();
    try {
      const canvas = document.createElement('canvas');
      qrContainer.appendChild(canvas);
      new QRious({
        element: canvas,
        value: remoteUrl,
        size: 200,
        foreground: '#111827',
        background: '#ffffff',
        level: 'M'
      });
    } catch (error) {
      qrContainer.textContent = 'QR generation failed';
      console.error(error);
    }
  }

  updateStatus('token expired, waiting for fresh test tokens', 'error');

  if (!PRESENTATION_TOKEN) {
    return;
  }

  const client = new Ably.Realtime({ token: PRESENTATION_TOKEN });
  const channel = client.channels.get(`${CHANNEL_PREFIX}${sessionId}`);

  client.connection.on('connected', () => updateStatus('connected', 'ok'));
  client.connection.on('connecting', () => updateStatus('connecting...', 'pending'));
  client.connection.on('disconnected', () => updateStatus('disconnected', 'warn'));
  client.connection.on('suspended', () => updateStatus('suspended', 'warn'));
  client.connection.on('failed', () => updateStatus('failed or token expired', 'error'));

  channel.subscribe('presence', (message) => {
    const data = (message && message.data) || {};

    if (data.action === 'remote-connected') {
      setOverlayCollapsed(true);
      showToast('Remote connected');
    }
  });

  channel.subscribe('command', (message) => {
    const data = (message && message.data) || {};

    switch (data.action) {
      case 'next':
        deck.next();
        break;
      case 'prev':
        deck.prev();
        break;
      case 'goto':
        if (typeof data.h === 'number') {
          deck.slide(data.h, typeof data.v === 'number' ? data.v : 0);
        }
        break;
      default:
        console.warn('Unknown remote action', data);
    }
  });
}

function initializeRemote() {
  const sessionId = new URL(window.location.href).searchParams.get('session');
  const feedback = document.getElementById('remote-feedback');
  const sessionEl = document.getElementById('remote-session-id');
  const gotoH = document.getElementById('goto-h');
  const gotoV = document.getElementById('goto-v');

  if (!sessionId) {
    if (feedback) feedback.textContent = 'Missing session id in URL';
    return;
  }

  if (sessionEl) sessionEl.textContent = sessionId;

  if (!REMOTE_TOKEN) {
    if (feedback) feedback.textContent = 'Remote token missing or expired.';
    return;
  }

  let channel = null;

  try {
    const client = new Ably.Realtime({ token: REMOTE_TOKEN });
    channel = client.channels.get(`${CHANNEL_PREFIX}${sessionId}`);

    client.connection.on('connected', () => {
      if (feedback) feedback.textContent = 'Connected. Ready to send commands.';
      publishCommand(channel, { action: 'remote-connected', connectedAt: new Date().toISOString() }, null, 'presence');
    });

    client.connection.on('failed', () => {
      if (feedback) feedback.textContent = 'Connection failed or token expired.';
    });
  } catch (error) {
    if (feedback) feedback.textContent = 'Ably initialization failed.';
    console.error(error);
    return;
  }

  document.getElementById('btn-next')?.addEventListener('click', () => {
    publishCommand(channel, { action: 'next' }, feedback);
  });

  document.getElementById('btn-prev')?.addEventListener('click', () => {
    publishCommand(channel, { action: 'prev' }, feedback);
  });

  document.getElementById('btn-goto')?.addEventListener('click', () => {
    const h = Number.parseInt(gotoH.value, 10);
    const v = Number.parseInt(gotoV.value || '0', 10);

    if (Number.isNaN(h)) {
      if (feedback) feedback.textContent = 'Horizontal slide index is required.';
      return;
    }

    publishCommand(channel, { action: 'goto', h, v: Number.isNaN(v) ? 0 : v }, feedback);
  });
}

if (document.body.classList.contains('presentation-page')) {
  initializePresentation();
}

if (document.body.classList.contains('remote-page')) {
  initializeRemote();
}
