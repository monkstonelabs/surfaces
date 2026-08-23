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
nothing to read and nothing to honour. We measured the floor directly:

- 6 seconds between requests — failed
- 15 seconds — failed
- 30 seconds — failed
- **60 seconds — succeeded, three times out of three**

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
