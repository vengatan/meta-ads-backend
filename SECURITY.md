# Meta Ads bridge security

The Vercel `/api/meta` endpoint exposes only an unauthenticated health check. All Meta account reads beyond health and all mutations require a bridge credential supplied through `x-bridge-key` or `Authorization: Bearer`.

Mutation operations require POST and read their payload from the request body. Query-string mutation payloads are rejected. Newly created ads are always created PAUSED and must be activated with a separate authenticated status call after review.

If `META_BRIDGE_KEY` is not configured, the bridge derives an internal caller key from `META_ACCESS_TOKEN`; a dedicated `META_BRIDGE_KEY` is preferred for production.
