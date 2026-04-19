# App Store Submission Checklist — UnforgettableRides

*Last updated: 2026-04-19 · Status: Phase 4 not yet started*

---

## App Identity

- [ ] App name: **UnforgettableRides**
- [ ] Bundle ID: `com.unforgettablerides.app`
- [ ] Version: `1.0.0`
- [ ] Build number incremented

## Required Assets

- [ ] App icon 1024×1024 PNG (no alpha)
- [ ] Screenshots for iPhone 6.5" (1284×2778)
- [ ] Screenshots for iPad 12.9" (2048×2732) if iPad supported
- [ ] App preview video (optional)

## app.json / expo Config

- [ ] `expo.name` = `"UnforgettableRides"`
- [ ] `expo.slug` = `"unforgettable-rides"`
- [ ] `expo.ios.bundleIdentifier` = `"com.unforgettablerides.app"`
- [ ] `expo.ios.buildNumber` set
- [ ] No `expo-camera` plugin (removed in Phase 0)
- [ ] `expo-image-picker` photo library permission string is accurate

## App Store Connect

- [ ] App description written (no references to UnforgettableRides or dog grooming)
- [ ] Keywords set (classic cars, wedding car hire, vintage car, etc.)
- [ ] Privacy policy URL set
- [ ] Age rating completed
- [ ] Category: Travel or Lifestyle

## Before Submission

- [ ] Phase 4 (mobile app transformation) is complete
- [ ] All pet/dog/wash references removed from UI strings
- [ ] All 4 tabs work: Home, Cars, Messages, Profile
- [ ] Booking flow works end-to-end on a real device
- [ ] Messaging works (send/receive)
- [ ] No hardcoded localhost URLs remain

## Android (Google Play)

- [ ] `expo.android.package` = `"com.unforgettablerides.app"`
- [ ] Signing keystore configured in EAS
- [ ] Store listing completed in Google Play Console

