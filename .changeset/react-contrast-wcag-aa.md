---
'@seamless-auth/react': patch
---

The built-in screens' default colours now meet WCAG 2.2 AA contrast. On the passkey enrollment screen the primary button is `#047857` (hover `#065f46`), the outlined button `#047857`, the skip link `#1d4ed8`, and the success and error messages `#047857` and `#b91c1c` against the light panel. On the recovery code, authenticator app, and account security screens the primary button is `#2563eb` (hover `#1d4ed8`) and outlined buttons such as Copy and Download are `#60a5fa`. The resend link's hover colour on the email and phone code screens is `#93c5fd`, and the code entry boxes have a `#9ca3af` border so they stand out from the card. These are fallbacks of the existing `--seamless-*` custom properties, so an app that sets those tokens sees no change. The theming section of the README now lists `--seamless-accent-muted` and the new defaults.
