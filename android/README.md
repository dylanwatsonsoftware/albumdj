# Album DJ for Android

This is the first native Album DJ and Android Auto prototype. The phone app previews a fixture Current Stack, while a Media3 `MediaLibraryService` exposes Current Stack, Favourite Albums, and Recent Releases to Android Auto.

The prototype intentionally does not authenticate with Spotify or Firebase yet. Its next milestone is to replace the fixture library with the signed-in user's Firestore library and resolve album selections through Spotify playback.

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
