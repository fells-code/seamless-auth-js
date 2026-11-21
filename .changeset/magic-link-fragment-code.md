---
'@seamless-auth/client': minor
'@seamless-auth/react': minor
'@seamless-auth/vue': minor
'@seamless-auth/svelte': minor
'@seamless-auth/angular': minor
'@seamless-auth/react-native': minor
---

Support magic links that carry a code in their fragment (`?token=...#code=...`), ahead of the auth API release that requires it (fells-code/seamless-auth-api#594).

- `client.confirmMagicLink(token, code?)` sends the code, and `confirmMagicLinkSignIn` takes a `code`.
- `getMagicLinkConfirmation` reads the new `sameDevice` flag.
- New flows: `parseMagicLinkUrl(url)` reads `token` from the query and `code` from the fragment, `takeMagicLinkParams()` reads them from the page and strips both from the address bar, and `verifyMagicLinkSignIn({ client, token, code })` verifies the link and confirms at once when it was opened on the device that asked for it.
- The bundled verify screens in React, Vue, Svelte and Angular strip the link from the address as they start, confirm without asking on the requesting device, and send the code when the reader approves a link opened on another device.
- React Native re-exports these helpers. Read the incoming link with `Linking`, which keeps the fragment, rather than from route parameters.

Older APIs keep working: they ignore the code and still sign in a same-device link on the verify call.
