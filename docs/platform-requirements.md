# Platform baseline

Baseline reviewed 5 October 2026; Google export integration rechecked 19 October 2026. Applicable products: **Unity User Acquisition playables** and **Google Ads App campaign HTML5/playables**. Do not substitute Google display-banner specifications or Unity Exchange specifications.

## Official references

- [Current Unity creative specifications](https://docs.unity.com/en-us/user-acquisition/creatives/creative-specifications). The older Grow/Acquire docs are for the previous dashboard experience. Current requirements include one minified index.html under 5 MB, inline assets, both orientations, MRAID 3.0, viewability gating, mraid.open, and unobstructed container close UI. The initialization example also handles an already-viewable ad through isViewable.
- [Unity Ad Testing app](https://docs.unity.com/en-us/user-acquisition/creatives/preview-creative-packs). Real mobile QA requires an accessible .html URL, HTTPS on iOS, or dashboard hosting.
- [Google App campaign playable specifications](https://support.google.com/google-ads/answer/9981650?hl=en). ZIP up to 5 MB/512 files, responsive orientation metadata, UTF-8, explicit closing tags, packaged assets, gesture-activated sound, and the documented ExitAPI custom CTA integration.
- [Google App campaign troubleshooting](https://support.google.com/google-ads/answer/12771973). The ExitAPI script must appear literally in the head. Test without allow-same-origin; images used on canvas need anonymous cross-origin loading. Preview can suppress outbound clicks.
- [IAB MRAID 3.0](https://www.iab.com/wp-content/uploads/2017/07/MRAID_3.0_FINAL.pdf). Unity still explicitly requires viewableChange, despite the event being deprecated but retained by MRAID 3.0.

## Our stricter shared profile

Use both orientations; all gameplay code/assets embedded; memory-only state; no tracking or remote gameplay dependencies; Canvas 2D; explicit non-void closing tags; no autoplay sound; no first-touch or automatic exits. The Google SDK is the only network dependency and is added only to its profile. Unity relies on host-injected MRAID. Google uses document visibility and additionally MRAID when the container provides it. SDK navigation is isolated from games, with no direct browser-navigation fallback.

The release ceiling is 4,500,000 bytes for HTML and ZIP. Google's troubleshooting page also mentions 5.2 MB, but we deliberately use the stricter main specification with extra headroom. HTML is capped even when ZIP compression is effective. Archives contain just a root index.html and no source/config/report files.

Production is ES5 classic inline JavaScript, with no CDN engines or runtime module loading. This targets a broad browser range; old Android/iOS support stays unverified until tested on the actual relevant WebViews. Do not infer certification from Playwright's modern browser engines or from a successful upload alone.

Track documentation changes through an explicit review of these sources when modifying the exporter. No recurring monitoring or scheduled automation has been configured.

## Export targets

The toolkit compiles one Google ZIP per game, without an embedded OS or store destination. Google documents `ExitApi.exit()` as using the configured final URL; the shared ZIP is our implementation choice for OS-independent gameplay, not a claim that campaign/device checks are interchangeable. Configure and verify the advertised app, OS and destination in each Google campaign. Unity retains separate OS exports because its adapter embeds each configured store URL.
