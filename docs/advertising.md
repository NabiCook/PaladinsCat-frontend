# Dashboard advertising

The dashboard inserts the six publisher-supplied standard Adsterra banners at
their native dimensions. No publisher iframe wrapper, scaling or cropping is
used. The tag's `format: iframe` creates the provider's own advertising frame.
Embed keys are public identifiers, not account/API credentials.

| Placement | Native unit | Behavior |
| --- | --- | --- |
| Homepage right card | 300×250 / 32203487; narrow fallback 160×300 / 32203489 | Card dimensions match the selected unit, between streams and esports. |
| Homepage hero | 300×250 / 32203487 | Third carousel slide when it fits; carousel controls remain separate. |
| Search rail | 160×600 / 32203488; 160×300 / 32203489 | Tallest unit that clears the dock; hidden when width/height is insufficient. |
| Universal banner | 728×90 / 32203491; 468×60 / 32203486; 320×50 / 32203490 | Centered native-size banner on every route, independent of footer. Desktop uses a bottom dock; mobile uses a top dock. Hidden when the smallest unit cannot fit. |

Cards use the existing glass/border/radius tokens and have no visible advertising
title. Accessible names remain available. Close sits within the dock's upper-right
corner with a minimum 44px touch target. Mobile reserves space above page content,
including the top safe area; desktop reserves bottom space. Mobile navigation
stays clear, and the dock hides during native dialogs, the mobile More menu and a
keyboard-reduced visual viewport. Session dismissal persists across reloads.

Slots load near the viewport and retain completed creatives across carousel
rotations or unchanged dock units. Leaving a route removes its own ads. There is
no timer-driven ad refresh. The carousel pauses offscreen, in hidden tabs, for
reduced motion and on hover/focus. Native Banner, Smartlink and Social Bar remain
outside these placements.

## Direct tag insertion and policy

The integrity-pinned Postscribe 2.0.8 browser build preserves parser-order and
`document.write` behavior when inserting the supplied tag into the SPA. Its queue
sets the unit's original `atOptions` immediately before the corresponding provider
script executes. Each attempt writes into its own element. Route/size changes and
timeouts detach that element and invalidate queued writes; an active parser stream
finishes normally so Postscribe can restore `document.write`. Its 2.0.8 active-stream
cancel method calls an unavailable abort API and must not be used. Failed or empty
loaders settle to a reserved fallback; a failed hero leaves
the rotation. A loaded state proves a provider frame was inserted, not billable
viewability or revenue.

The standalone dashboard CSP admits only the supplied `https://bauval.org` ad
origin and the exact pinned writer URL. Other application policies keep their
existing script sources. No arbitrary HTTPS script/frame wildcard or inline-script
permission is introduced. Provider redirects or additional origins require observed
source evidence and a reviewed allowlist update.

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
