const PRESENTATION_TOKEN = 'eyJhbGciOiJkaXIiLCJlbmMiOiJBMjU2R0NNIiwia2lkIjoiMGpwTEJBLlJSMUJIZyJ9..e4fCUF1UZZfMZW-x.i1pz60z8oEjeUDjVkW7it6xK6t8ECVGr7sY-pJ_JCTToNCS8IVPp20kvipp-2KduHWoNEl50LxexeQZ7OQcJQku9fNZ6fiG9zwn1VMNaYacdHRbbMxXY81lfMBpwRRrsbaPDeKbkT7ze0WkmNLz4vCNIGMkPraJWGtGEdPGT.k3fvy2HZ2E6q7_DuNdgWFA';
const REMOTE_TOKEN = 'eyJhbGciOiJkaXIiLCJlbmMiOiJBMjU2R0NNIiwia2lkIjoiMGpwTEJBLmdyNHFqQSJ9..Dm-fDBrfEJhfdZAI.r3MRycLJy2u4NArAvshpj97OV9EcORCua7C1f_xmp5JlzDxbZLU_qEccHAn6WrCfQGh8boQWpd6sH_tIRS7zp2brNIk5SBe724xGshmreJ7Yp3920U_MbtpmSZlZTtCAKGS_87cdM7qwFo9VGF6lcYj1HmOBxVlodpPd1g.fm4WOuZkjn2wYvDkSf6zKg';
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
    if (feedbackElement) feedbackElement.textContent = 'Canal indisponible.';
    return;
  }

  channel.publish(eventName, payload, (error) => {
    if (!feedbackElement) return;
    feedbackElement.textContent = error ? `Échec d’envoi : ${error.message || error}` : `Envoyé : ${payload.action}`;
  });
}

function syncMapPinsToFragments(deck) {
  const pins = Array.from(document.querySelectorAll('.map-pin'));
  const callouts = Array.from(document.querySelectorAll('.map-callout.fragment'));
  if (!pins.length || !callouts.length) return;

  const currentFragment = deck.getCurrentSlide()?.querySelector('.map-callout.fragment.current-fragment');
  const activeIndex = currentFragment ? Number.parseInt(currentFragment.dataset.fragmentIndex || '-1', 10) : -1;

  pins.forEach((pin, index) => {
    pin.classList.toggle('is-active', index === activeIndex);
    pin.classList.toggle('is-muted', activeIndex !== -1 && index !== activeIndex);
    pin.classList.toggle('is-overview', activeIndex === -1);
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

  updateStatus('Jeton expiré ou connexion Ably échouée', 'error');

  syncMapPinsToFragments(deck);
  deck.on('fragmentshown', () => syncMapPinsToFragments(deck));
  deck.on('fragmenthidden', () => syncMapPinsToFragments(deck));
  deck.on('slidechanged', () => syncMapPinsToFragments(deck));
  deck.on('ready', () => syncMapPinsToFragments(deck));

  if (!PRESENTATION_TOKEN) {
    return;
  }

  const client = new Ably.Realtime({ token: PRESENTATION_TOKEN });
  const channel = client.channels.get(`${CHANNEL_PREFIX}${sessionId}`);

  client.connection.on('connected', () => updateStatus('connecté', 'ok'));
  client.connection.on('connecting', () => updateStatus('connexion...', 'pending'));
  client.connection.on('disconnected', () => updateStatus('déconnecté', 'warn'));
  client.connection.on('suspended', () => updateStatus('connexion suspendue', 'warn'));
  client.connection.on('failed', () => updateStatus('Jeton expiré ou connexion Ably échouée', 'error'));

  channel.subscribe('presence', (message) => {
    const data = (message && message.data) || {};

    if (data.action === 'remote-connected') {
      setOverlayCollapsed(true);
      showToast('Télécommande connectée');
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
          deck.slide(data.h, 0);
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
  const gotoSlide = document.getElementById('goto-slide');

  if (!sessionId) {
    if (feedback) feedback.textContent = 'Session manquante dans l’URL.';
    return;
  }

  if (sessionEl) sessionEl.textContent = sessionId;

  if (!REMOTE_TOKEN) {
    if (feedback) feedback.textContent = 'Jeton manquant ou expiré.';
    return;
  }

  let channel = null;

  try {
    const client = new Ably.Realtime({ token: REMOTE_TOKEN });
    channel = client.channels.get(`${CHANNEL_PREFIX}${sessionId}`);

    client.connection.on('connected', () => {
      if (feedback) feedback.textContent = 'Connectée. Prête à envoyer des commandes.';
      publishCommand(channel, { action: 'remote-connected', connectedAt: new Date().toISOString() }, null, 'presence');
    });

    client.connection.on('failed', () => {
      if (feedback) feedback.textContent = 'Connexion échouée ou jeton expiré.';
    });
  } catch (error) {
    if (feedback) feedback.textContent = 'Initialisation Ably échouée.';
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
    const slideNumber = Number.parseInt(gotoSlide.value, 10);

    if (Number.isNaN(slideNumber) || slideNumber < 1) {
      if (feedback) feedback.textContent = 'Entrez un numéro de slide valide.';
      return;
    }

    publishCommand(channel, { action: 'goto', h: slideNumber - 1 }, feedback);
  });
}

if (document.body.classList.contains('presentation-page')) {
  initializePresentation();
}

if (document.body.classList.contains('remote-page')) {
  initializeRemote();
}
