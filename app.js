const PRESENTATION_TOKEN = 'eyJhbGciOiJkaXIiLCJlbmMiOiJBMjU2R0NNIiwia2lkIjoiMGpwTEJBLlJSMUJIZyJ9..HbNhw7psyDdG7ScW.oNe4iXtBKfglWSUIRogeQ4XrM5eD03nxdyoA3x0e6IwDh0g-b9H6ZP5GC5EK6rxGKemhkPWV85SBKW5xLp8pe_70ZT4MPHdbEKW4_nSwDl5tTq4vGtGFKk_C1Ajd7nYhHSn6NgigHOhanBZ9lQsjkCP1FFxJMUqpPtBO7GDy.SnTwb19aXFyDjB_9N6QPCQ';
const REMOTE_TOKEN = 'eyJhbGciOiJkaXIiLCJlbmMiOiJBMjU2R0NNIiwia2lkIjoiMGpwTEJBLmdyNHFqQSJ9..sPFjBmnc86b6wkYc.gMDPSWG0IWs0WxKTK_z73bCpJRjf8SOWv6UY4VUjtctUcXofICcrjmzKVKPMVTv1CphUuwRo34jL2KEfxGDZ32L9nncd_WIBE_wMJa6ngqPlCMzRvnmkEUwtY7hU5XhWDJ2FVjY2O60elGWpWMmCO9guI_NpYtzBoLD8rQ.IkbXZA6cdjHMTgsEJSq_NA';
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

  const qrContainer = document.getElementById('remote-qr');
  if (qrContainer) {
    qrContainer.replaceChildren();
    try {
      new QRCode(qrContainer, {
        text: remoteUrl,
        width: 200,
        height: 200,
        correctLevel: QRCode.CorrectLevel.M
      });
    } catch (error) {
      qrContainer.textContent = 'QR generation failed';
      console.error(error);
    }
  }

  const client = new Ably.Realtime({ token: PRESENTATION_TOKEN });
  const channel = client.channels.get(`${CHANNEL_PREFIX}${sessionId}`);

  client.connection.on('connected', () => updateStatus('connected', 'ok'));
  client.connection.on('connecting', () => updateStatus('connecting...', 'pending'));
  client.connection.on('disconnected', () => updateStatus('disconnected', 'warn'));
  client.connection.on('suspended', () => updateStatus('suspended', 'warn'));
  client.connection.on('failed', () => updateStatus('failed or token expired', 'error'));

  channel.subscribe('command', (message) => {
    const data = message.data || {};

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

function publishCommand(channel, payload, feedbackElement) {
  channel.publish('command', payload, (error) => {
    if (!feedbackElement) return;
    feedbackElement.textContent = error ? `Send failed: ${error.message || error}` : `Sent: ${payload.action}`;
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

  const client = new Ably.Realtime({ token: REMOTE_TOKEN });
  const channel = client.channels.get(`${CHANNEL_PREFIX}${sessionId}`);

  client.connection.on('connected', () => {
    if (feedback) feedback.textContent = 'Connected. Ready to send commands.';
  });

  client.connection.on('failed', () => {
    if (feedback) feedback.textContent = 'Connection failed or token expired.';
  });

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
