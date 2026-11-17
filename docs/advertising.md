# Dashboard advertising

The dashboard inserts the six publisher-supplied standard Adsterra banners at
their native dimensions. No publisher iframe wrapper, scaling or cropping is
used. The tag's `format: iframe` creates the provider's own advertising frame.
Embed keys are public identifiers, not account/API credentials.

| Placement | Native unit | Behavior |
| --- | --- | --- |
| Homepage right card | 300×250 / 32203487; narrow fallback 160×300 / 32203489 | Card dimensions match the selected unit, between streams and esports. |
| Search rail | 160×600 / 32203488; 160×300 / 32203489 | Tallest unit that clears the dock; hidden when width/height is insufficient. |
| Universal banner | 728×90 / 32203491; 468×60 / 32203486; 320×50 / 32203490 | Centered native-size banner on every route, independent of footer. Desktop uses a bottom dock; mobile uses a top dock. Hidden when the smallest unit cannot fit. |

Cards use the existing glass/border/radius tokens. Every placement has a compact
`Advertisement` overlay inside its upper-left corner, with the shared text/glass
tokens and no pointer interception or added layout space. Accessible names remain
available. The homepage hero rotates only its two content pages. Close sits
within the dock's upper-right corner with a minimum 44px touch target. Mobile
reserves space above page content,
including the top safe area; desktop reserves bottom space. Mobile navigation
stays clear, and the dock hides during native dialogs, the mobile More menu and a
keyboard-reduced visual viewport. Session dismissal persists across reloads.

Slots load near the viewport and retain completed creatives for unchanged dock
units. Leaving a route removes its own ads. There is no timer-driven ad refresh.
The carousel pauses offscreen, in hidden tabs, for reduced motion and on
hover/focus. Native Banner, Smartlink and Social Bar remain
outside these placements.

## Direct tag insertion and policy

The integrity-pinned Postscribe 2.0.8 browser build preserves parser-order and
`document.write` behavior when inserting the supplied tag into the SPA. Its queue
sets the unit's original `atOptions` immediately before the corresponding provider
script executes. Each attempt writes into its own element. Route/size changes and
timeouts detach that element and invalidate queued writes; an active parser stream
finishes normally so Postscribe can restore `document.write`. Stream completion
does not complete the ad: the provider can append its frame asynchronously after
its loader finishes. A per-attempt observer waits for that frame until the existing
loading deadline, and disconnects on completion, teardown or failure. Its 2.0.8
active-stream cancel method calls an unavailable abort API and must not be used.
Failed or empty loaders settle to a reserved fallback. A loaded state proves a
provider frame was inserted, not billable viewability or revenue.

The standalone dashboard CSP admits the supplied `https://bauval.org` ad origin
and exact pinned writer URL. The unmodified provider tag creates an `about:blank`
frame that inherits the dashboard policy, then writes inline script elements and
evaluates its creative template scripts. Its compatibility permissions are
`script-src-elem 'unsafe-inline'` and `script-src 'unsafe-eval'`; inline event
handlers remain blocked by `script-src-attr 'none'`. These permissions also apply
to the parent standalone dashboard and reduce its protection against injected
scripts. They cannot be limited to the inherited frame with this native tag.
This includes signed-in views rendered in the dashboard shell. Non-dashboard
Next routes and operator/API policies keep their existing behavior.

Observed creative and tracking images are allowed from `https://bauval.org`,
`https://cdn.storageimagedisplay.com` and `https://static.nresystems.com` on the
standalone surface. There is no arbitrary HTTPS wildcard. Provider redirects or
additional origins require observed source evidence and a reviewed allowlist update.

Adsterra's current publisher terms require prior consent for an extra iframe
wrapper and restrict creative resizing. The owner selected standard unscaled
banners for production on 2026-11-15:
<https://adsterra.com/publishers-terms-managed/>. Postscribe's integration reference:
<https://github.com/krux/postscribe>.

## Local review

<http://localhost:3101/?adPreview=1> renders native-size placeholders without
advertising requests; the flag is loopback-only. Without it, the supplied tag
loaders are used. `window.DiscoveryAds.snapshot()` reports state and dimensions.
Automated checks intercept provider responses, preserve native frame sizes and
exercise script order, HTTP errors, timeouts, route changes and dismissal. Inspect
the real loader request separately: a reachable script and successful creative
response are both required for delivery. DNS filtering, ad-blocking and provider
HTTP refusals cannot be established as working delivery by an integration fixture.
Real creative inventory is verified separately from those integration fixtures.

`node test/discovery-ads-browser.mjs` exercises delayed frame insertion, timeout,
resize and failure recovery against controlled provider responses and the actual
integrity-pinned writer. It uses an ephemeral loopback server and isolated browser;
it sends no ad requests. Set `POSTSCRIBE_PATH` to an existing copy of the pinned
writer to run without its CDN download. Its integrity is checked in either case.

For real delivery diagnostics, record the loader response body and TLS peer as
well as its status. A local filtering proxy can synthesize a refusal, filtered DNS
can prevent the request entirely, and automated user agents can receive an empty
script. Compare the unchanged native snippet before attributing these outcomes
to the SPA. The current tag also writes inline scripts inside its provider-created
blank frame; verify CSP compatibility and actual creative content separately
from frame insertion.
