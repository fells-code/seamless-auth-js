---
'@seamless-auth/client': patch
---

Cookie transport now sends `x-seamless-auth-transport: cookie` on every unsafe request (`POST`, `PUT`, `PATCH`, `DELETE`) to the server adapter, including `POST /refresh` and requests `authorizedFetch` sends under the adapter's mount. Server adapters from v0.23 refuse a body-less unsafe auth request that carries neither a JSON content type nor this header with `415 unsupported_media_type`, so body-less calls such as recovery code generation and sign-out keep working. Safe methods and requests to the application's own routes are unchanged. A web app whose API is on another origin must allow the header in its CORS configuration; the starters already mirror requested headers.
