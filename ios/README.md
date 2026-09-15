# Astra Pool for iOS

A small UIKit + WKWebView app around the same Three.js/Rapier game shipped on the website. There is no Capacitor, package manager, or third-party Swift framework. Xcode uses only Apple SDKs.

## Build and run

Requirements: Xcode with an iOS SDK, Node 22.12+ (or a current Node 24), and the repository's npm dependencies. Deployment target: iOS 16.4; supports iPhone and iPad, portrait and landscape.

From the repository root:

```sh
npm ci
npm run ios:prepare
open ios/AstraPool.xcodeproj
```

Select the **AstraPool** scheme and an iPhone or iPad simulator, then Run. `npm run ios:build` prepares the shared game and performs an unsigned simulator build from the terminal. Run `npm run ios:prepare` after changing web code or assets, before building/archiving in Xcode. `ios/Web/` is generated and ignored by Git.

Signing is configured for **Darrin Massena**, team `HTBMTPEP6H`, with bundle identifier `com.darrinm.astrapool.ios`. Xcode manages provisioning automatically. For a fork, select your own team and unique bundle identifier in Signing & Capabilities, and update `ExportOptions.plist`. No signing identity or provisioning profile is stored in this repository.

To run native tests (choose an installed simulator):

```sh
npm run ios:prepare
xcodebuild -project ios/AstraPool.xcodeproj -scheme AstraPool \
  -destination 'platform=iOS Simulator,name=iPhone 17' \
  -derivedDataPath ios/build CODE_SIGNING_ALLOWED=NO test
```

The tests exercise the actual bundled game and a Rapier shot in its prediction worker, secure-context APIs, path traversal rejection, and invite validation. `npm test` covers the browser/native transport adapters and existing game behavior.

## How it works

- `AssetServer.swift` serves bundled files on **127.0.0.1:49173 only**. Simulator builds derive a stable port from the simulator device ID because simulators share the Mac’s network. A stable HTTP origin preserves WebKit storage and supports standard module workers, WebAssembly, fetch, and Web Crypto. The listener exposes no writable files or proxy endpoints. If the port is occupied, the app shows a retry screen rather than silently switching origins and losing settings.
- `GameViewController.swift` owns WKWebView and a restricted main-frame script bridge. It permits only room creation, game analytics, and room sockets to `https://astrapool.darrinm.com`. URLSession handles the remote connections; the server's browser-origin protection is unchanged.
- `src/platform.js` selects that bridge only when the native handler exists. The website continues using normal fetch and WebSocket. Room protocol and physics remain shared, including browser/app multiplayer.
- All game environments, sounds, planet textures and branding are bundled. Google Fonts are removed from the iOS HTML; the existing system-serif fallback works offline. Private head photographs are never included in the iOS asset build.
- Backgrounding cancels the active pointer gesture, pauses the game loop and audio, and closes room sockets. Foregrounding resumes without simulating the elapsed background interval and reconnects/resynchronizes online rooms. WebKit process termination reloads the game; an unfinished local rack is not persisted across process termination in this first version.
- External HTTPS links open outside the embedded game. Existing confirmation dialogs use UIKit alerts. The in-game **Share invite** button opens the native share sheet; **Join an invite link** accepts a browser invite.

## Invitations

Shared links keep the public HTTPS form, so browser players can join without installing the app. Inside the app, use Settings → Join an invite link. The app also accepts `astra-pool://room/<room UUID>`.

Universal Links are a separate distribution step: they require the final Apple Team ID, an Associated Domains entitlement, and an `apple-app-site-association` file on the production domain. This implementation does not pretend those are configured. Until then, tapping an HTTPS invite opens the website; paste it into the app to join there.

## TestFlight and App Store

1. Prepare web assets. The project and `ExportOptions.plist` use the Darrin Massena signing team.
2. Test on real iPhones and iPads: touch aiming, rotation, audio/mute and interruptions, airplane-mode local play, long sessions/temperature, Clairvoyant on a full break, room reconnects, native sharing and invite joining.
3. Set the version/build number, select **Any iOS Device**, and use Product → Archive. Distribute through Xcode Organizer to App Store Connect/TestFlight.
4. Complete the store listing, screenshots, age rating, support and privacy-policy URLs, and App Privacy answers. The app retains the game's anonymous gameplay analytics; the included privacy manifest declares unlinked product-interaction analytics plus gameplay content and per-room user IDs for app functionality, not tracking. Review the final disclosures against the production backend and any later integrations.

Regenerate the native icon with `python3 pipeline/brand/build-icons.py --ios` (Pillow). The 1024px app icon uses the approved planetary-rack artwork from `public/brand/app-icon.png` on an opaque charcoal background; `PrivacyInfo.xcprivacy` is bundled with the app. No account creation, ads, purchases, push notifications, or background execution capabilities are added.

### Reproducible signed archive

```sh
npm run ios:prepare
xcodebuild -project ios/AstraPool.xcodeproj -scheme AstraPool \
  -configuration Release -destination 'generic/platform=iOS' \
  -archivePath ios/build/AstraPool.xcarchive -allowProvisioningUpdates archive
xcodebuild -exportArchive -archivePath ios/build/AstraPool.xcarchive \
  -exportPath ios/build/AppStore -exportOptionsPlist ios/ExportOptions.plist \
  -allowProvisioningUpdates
```

The export produces a signed App Store IPA locally; it does not publish the app. The iOS app record is [Astra Pool in App Store Connect](https://appstoreconnect.apple.com/apps/6812220821/distribution), under Darrin Massena. Upload through Xcode Organizer using that account. The initial version/build is 1.0 (1); increment the build number for subsequent uploads.

### Verified build (September 14, 2026)

- Based on main `866b332`; all 357 JavaScript tests passed.
- Three native tests passed on iPhone 17/iOS 26.5 and iPad Pro/iOS 18.6 simulators, and on the connected physical iPhone.
- Darrin Massena-signed Release archive and App Store export succeeded; Release installed and launched on the phone.
- App Store Connect app record: `6812220821`, bundle ID `com.darrinm.astrapool.ios`, SKU `astrapool-ios`, English (U.S.), limited team access.
- Version **1.0 (1)** uploaded successfully to App Store Connect on September 14, 2026. Apple processing and TestFlight tester assignment follow upload; no App Store release has been submitted.
- Manual touch/audio checks and longer device play sessions remain to be completed.

### Distribution setup (September 15, 2026)

- Updated native worktree to main `c729fd3`, which publishes the approved privacy policy and settings link (PR #56).
- Build **1.0 (2)** archived with Darrin Massena signing, uploaded successfully, processed by Apple, and selected in the distribution draft. The archive contains the approved three-category privacy manifest and settings link.
- Store text, review contact, iPhone/iPad screenshots, free pricing, 144-country availability, content rights, and privacy disclosures are saved. See `app-store/README.md` for the reproducible screenshot workflow and remaining pre-submission checks.
- No App Review submission or release has been made.

### Release candidate 1.0 (3)

- Prepares the audio graph and all 15 sound samples in the background, decoding one take at a time before first playback.
- JavaScript regression suite: 360 tests passed. Native tests also verify that startup prepares every bundled sound and first playback performs no additional decoding; scheduling timings are retained in the Xcode test report.
- Reviewer instructions are preserved in `app-store/review-notes.txt`.
- Release tag: `ios-v1.0-build3`. Archive and upload from this source using the commands above, with a distinct archive path for build 3.
