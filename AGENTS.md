# Repository instructions

- At the end of every completed task, create a Git commit containing the task's changes.
- Before committing, run the relevant tests or checks and confirm they pass.
- Do not include unrelated user changes in the commit.
- When making Android app changes, build and install the debug APK via `adb install -r android/app/build/outputs/apk/debug/app-debug.apk`.
- If debugging on a physical device is required, use the Pixel 7 (not the Pixel 8). Target the Pixel 7 via `adb -s` when multiple devices are connected.
