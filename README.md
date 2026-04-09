# Montreal Fireworks

Static Reveal.js presentation prepared for GitHub Pages.

GitHub Pages URL: https://jesjobom.github.io/montreal-fireworks/

## Files

- `index.html` - presentation
- `remote.html` - mobile remote control
- `app.js` - Reveal.js and Ably integration
- `styles.css`
- `vendor/qrcode.min.js`
- `.nojekyll`

No backend, no build step, no compilation required.

## Remote control MVP

- the presentation creates a random `session` in the URL
- the first screen shows a QR code for `remote.html`
- the remote control publishes commands through Ably
- the presentation subscribes and reacts to `next`, `prev` and `goto`

## Important note

The current Ably tokens are temporary test credentials embedded statically for quick validation. When they expire, the remote control stops working until fresh tokens are added and redeployed.
