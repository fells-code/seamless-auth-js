---
'@seamless-auth/client': minor
'@seamless-auth/react': minor
'@seamless-auth/react-native': minor
'@seamless-auth/angular': minor
'@seamless-auth/vue': minor
'@seamless-auth/svelte': minor
---

Add `hasPermission`, `hasAllPermissions`, `hasRole` and `hasOrganizationRole`, which read the permissions and roles the `/users/me` user carries, and a `usePermissions` hook in `@seamless-auth/react`. A permission is held if the instance or the active organization grants it, and `{ organization: true }` counts only the active organization, matching the server's `requirePermission`. Permission and organization role matching is exact, instance roles keep their scoped matching, and an organization role never satisfies an instance role check. Fields an older API leaves out answer false. These are for showing and hiding UI only: the server must still enforce. They reflect the last `/users/me` read, so a change reaches the client when the user is next refreshed.
