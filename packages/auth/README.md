# @aevryn/auth

Framework-agnostic Supabase auth helpers (replaces the legacy better-auth setup).

## Exports

| Subpath | Contents |
|---|---|
| `.` | re-exports everything below |
| `./server` | `createServerSupabase(cookies)` SSR client, `createAdminClient()` service-role client, `CookieMethodsServer` type |
| `./client` | `getBrowserSupabase()` browser singleton |
| `./user` | `getCurrentUser(supabase)`, `requireUser(supabase)` |

## Usage

Server route:

```ts
import { createServerSupabaseForNext } from "@/lib/supabase-server";
import { requireUser } from "@aevryn/auth";

const supabase = await createServerSupabaseForNext();
const user = await requireUser(supabase);
```

Browser component:

```ts
import { supabaseClient } from "@/lib/supabase-client";
const { data } = await supabaseClient.auth.getUser();
```

## Rules

- `createAdminClient()` bypasses RLS — server-only (Storage uploads, triggers).
- Always create a fresh server client per request — never share across requests.
- Token refresh writes land in the proxy (`src/proxy.ts`).