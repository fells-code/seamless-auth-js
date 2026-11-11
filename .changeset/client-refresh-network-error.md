---
'@seamless-auth/client': minor
---

Keep the session when `refreshSession` cannot reach the server. A request that never got an answer (offline, DNS, timeout, aborted), or one answered with a `5xx`, `408` or `429`, no longer clears the user or marks the session signed out. The session state's new `networkError` field carries the failure instead, and the next successful refresh or a sign-out clears it. Only a refusal from the server, such as a `401`, signs the user out. In bearer transport, a `/refresh` that fails the same way keeps the stored tokens and rejects as an unreachable server would, instead of clearing them. `isNetworkError(error)` tells such a failure apart from a refusal on any result error.
