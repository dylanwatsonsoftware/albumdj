# Album DJ for Android

This native Album DJ prototype connects to the hosted web app through a verified browser sign-in. It loads the signed-in Spotify account's Current Stack, Favourite Albums, and Recent Releases from the existing Firebase-backed API. Tapping a stack cover sends playback to the Spotify Connect destination selected in Album DJ.

The **Car preview** button renders the same browse hierarchy used by the Media3 `MediaLibraryService`, so the car experience can be explored without connecting to Android Auto. The most recently synced library is cached for Android Auto browsing.

The APK contains neither the Firebase service-account key nor Spotify access tokens. Browser authentication hands it a signed Album DJ session, which is encrypted at rest with an Android Keystore key. The debug build's signing certificate is registered in `public/.well-known/assetlinks.json`; replace that fingerprint with the release or Play App Signing certificate before distributing a release build.

## Build and test

Use JDK 17 and an Android SDK with API 36 installed:

```bash
export JAVA_HOME=/path/to/jdk-17
./gradlew testDebugUnitTest assembleDebug
```

The debug APK is written to `app/build/outputs/apk/debug/app-debug.apk`. Install it on a connected phone with:

```bash
adb install -r app/build/outputs/apk/debug/app-debug.apk
```

## Test with Android Auto

1. Enable Android developer options and USB debugging on the phone.
2. Install and open the Album DJ debug APK once.
3. Enable Android Auto developer mode and start its head unit server.
4. Start the [Desktop Head Unit](https://developer.android.com/training/cars/testing/dhu) on the development computer.
5. Choose Album DJ from the media apps list and browse Current Stack.

No Google approval is required for local Desktop Head Unit or a directly installed internal test build. Google Play review and the car app quality requirements apply before public distribution through Play.
