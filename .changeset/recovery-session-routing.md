---
'@seamless-auth/vue': minor
'@seamless-auth/svelte': minor
'@seamless-auth/angular': minor
---

Send a recovery session to factor enrolment, as the React package already does. A recovery session (after a recovery code or a completed account recovery) can do nothing but enroll a new factor. The bundled login screen now goes straight to `register-passkey` when the session is one, and `requireAuth` redirects it to the new `enrollmentPath` config option (default `/register-passkey`) instead of admitting it, before any role check. The new `enrollmentRedirectTo` guard option overrides that per route, and a guard on the enrolment route itself admits the session rather than looping. Angular's `SeamlessAuth` service gains `redeemRecoveryCode` and `completeAccountRecovery`, which refresh the session afterwards like the other frameworks, so `recoverySession` reflects the new session without calling the client directly.
