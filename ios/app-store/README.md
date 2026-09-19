# App Store listing assets

App: Astra Pool (`6812220821`), Darrin Massena team, bundle `com.darrinm.astrapool.ios`.

## Screenshots

Actual native Simulator captures, without device frames or compositing:

- `screenshots/iphone-gameplay.png`: iPhone 17 Pro Max, iOS 26.5, 1320 × 2868; uploaded to the 6.9-inch slot.
- `screenshots/ipad-gameplay.png`: iPad Pro 13-inch (M5), iOS 26.5, 2064 × 2752; uploaded to the 13-inch slot.

To reproduce: prepare shared assets, build and launch the app on these simulators, choose Vs Computer, wait for the new rack to settle, and use Simulator → File → Save Screen… with Apply device mask unchecked. Upload through App Store Connect Media Manager. Keep gameplay screenshots accurate to the submitted build.

## Saved distribution configuration (September 15, 2026)

- English (U.S.), subtitle: Play with the Solar System.
- Games → Sports and Simulation; Apple-calculated age rating 13+ in most regions.
- Price: free ($0.00), approved by the owner.
- Availability: 144 storefronts; excludes the 27 EU countries, mainland China, Vietnam, Afghanistan, and Morocco. Future storefronts are not automatically enabled.
- Public App Store distribution; manual release selected. Nothing submitted for App Review.
- Review contact is stored only in App Store Connect, not this repository.
- Support: https://github.com/darrinm/astrapool/issues
- Marketing: https://astrapool.darrinm.com
- Privacy policy: https://astrapool.darrinm.com/privacy.html
- Content rights confirmed by the owner for third-party assets, including generated sounds.
- Privacy: Product Interaction for Analytics; Gameplay Content and User ID for App Functionality. All unlinked to identity, no tracking. User ID is the random per-room reconnect credential, not a personal account.

Build 1 was processed and attached to version 1.0. Build 2 uploaded successfully on September 15, 2026; it updates the privacy manifest to match these disclosures and adds the settings link. Apple processing completed, and build 2 is selected in the saved version 1.0 distribution draft. The approved privacy disclosures are published in App Store Connect. The privacy policy and settings link were merged in PR #56 and deployed successfully to the website.

## Before submission

Confirm the latest build is selected and the published privacy URL/disclosures are saved. Complete manual device testing. Apple may still request an account-level trader-status declaration even for distribution outside the EU; no trader classification or legal attestation has been invented. Mac and Vision Pro availability retain Apple's existing defaults; compatibility has not been manually verified.

Sources for country exclusions: [Apple app information](https://developer.apple.com/help/app-store-connect/reference/app-information/app-information), [EU trader requirements](https://developer.apple.com/help/app-store-connect/manage-compliance-information/manage-european-union-digital-services-act-trader-requirements), and App Store Connect's calculated age-rating availability.
