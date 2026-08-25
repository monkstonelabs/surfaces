# Reddit closed self-service API registration, and nobody announced it

_Last verified: 2026-08-23_

If you want programmatic access to Reddit today, the documented route no longer works. Reddit's
Responsible Builder Policy ended self-service app registration, so `client_credentials` now
requires an approved support ticket rather than a form. Unauthenticated JSON and OAuth both
return `403`.

This is not written down anywhere prominent. The developer documentation still describes the
old flow, and the failure it produces is a bare 403 with no explanation — which reads exactly
like a rate limit, a bad token, or a bug in your own code.

## What still works

The public `.rss` feeds. They need no credentials at all, and they carry enough for most
monitoring purposes: title, author, permalink and timestamp per post.

What they do **not** carry is the score. Reddit's Atom feed has no upvote count in it, so any
system that treats engagement as a signal has to either do without on Reddit or fetch each post
separately, which is a different rate-limit problem.

## The rate limit, measured rather than guessed

Reddit publishes no budget for the RSS endpoints and returns no rate-limit headers, so there is
nothing to read and nothing to honour. We measured the floor directly.

:::scrolly
:::figure s6
<svg viewBox="0 0 320 150" width="320" height="150" role="img" aria-label="6 seconds between requests: failed">
<rect x="0" y="0" width="320" height="150" fill="none"/>
<text x="8" y="30" font-family="ui-monospace,monospace" font-size="15" fill="currentColor">6s between requests</text>
<rect x="8" y="52" width="18" height="34" fill="#c0392b"/><rect x="34" y="52" width="18" height="34" fill="#c0392b"/>
<rect x="60" y="52" width="18" height="34" fill="#c0392b"/><rect x="86" y="52" width="18" height="34" fill="#c0392b"/>
<rect x="112" y="52" width="18" height="34" fill="#c0392b"/><rect x="138" y="52" width="18" height="34" fill="#c0392b"/>
<text x="8" y="118" font-family="ui-monospace,monospace" font-size="22" fill="#c0392b">403 · failed</text>
</svg>
:::figure s15
<svg viewBox="0 0 320 150" width="320" height="150" role="img" aria-label="15 seconds between requests: failed">
<text x="8" y="30" font-family="ui-monospace,monospace" font-size="15" fill="currentColor">15s between requests</text>
<rect x="8" y="52" width="18" height="34" fill="#c0392b"/><rect x="70" y="52" width="18" height="34" fill="#c0392b"/>
<rect x="132" y="52" width="18" height="34" fill="#c0392b"/><rect x="194" y="52" width="18" height="34" fill="#c0392b"/>
<text x="8" y="118" font-family="ui-monospace,monospace" font-size="22" fill="#c0392b">403 · failed</text>
</svg>
:::figure s30
<svg viewBox="0 0 320 150" width="320" height="150" role="img" aria-label="30 seconds between requests: failed">
<text x="8" y="30" font-family="ui-monospace,monospace" font-size="15" fill="currentColor">30s between requests</text>
<rect x="8" y="52" width="18" height="34" fill="#c0392b"/><rect x="130" y="52" width="18" height="34" fill="#c0392b"/>
<rect x="252" y="52" width="18" height="34" fill="#c0392b"/>
<text x="8" y="118" font-family="ui-monospace,monospace" font-size="22" fill="#c0392b">403 · failed</text>
</svg>
:::figure s60
<svg viewBox="0 0 320 150" width="320" height="150" role="img" aria-label="60 seconds between requests: succeeded three times out of three">
<text x="8" y="30" font-family="ui-monospace,monospace" font-size="15" fill="currentColor">60s between requests</text>
<rect x="8" y="52" width="18" height="34" fill="#1e8449"/><rect x="151" y="52" width="18" height="34" fill="#1e8449"/>
<rect x="294" y="52" width="18" height="34" fill="#1e8449"/>
<text x="8" y="118" font-family="ui-monospace,monospace" font-size="22" fill="#1e8449">200 · 3 of 3</text>
</svg>
:::step s6
**Six seconds between requests.** Every one came back `403`. No header said why, and nothing in
the response distinguished a rate limit from a bad token.
:::step s15
**Fifteen seconds.** Same answer. At this point the obvious conclusion is that the endpoint is
gone rather than throttled, which is the wrong conclusion and the expensive one.
:::step s30
**Thirty seconds.** Still `403`. Three failures in a row is where most measurements stop, and
stopping here would have produced a system that does not poll Reddit at all.
:::step s60
**Sixty seconds — and it worked, three times out of three.** The endpoint was never gone. It was
throttled at a floor nobody publishes, and the only way to find it was to keep halving the guess
until something came back `200`.
:::

Sixty seconds is therefore the working floor for this host, and it applies to no other host.
That distinction matters: a fixed sleep applied everywhere is both slower than necessary on
hosts that publish a budget and still wrong on hosts that do not.

## What this opens

Anything that needed Reddit data and assumed registration was a two-minute form now has a
support ticket in the way. That is a real barrier for a small team and a trivial one for anyone
already through it, which is the shape of a surface: the cost moved, and it moved unevenly.

## Terms worth knowing before you build on it

Reddit's terms forbid retaining User Content "beyond your approved use case", and they forbid
masking the user agent. Both are enforceable and both are easy to breach by accident when a
generic HTTP client is doing the fetching.

> This explainer exists because the research was done anyway. Most investigations here end in a
> decision not to build, and publishing them is what turns that into inventory rather than
> waste.
