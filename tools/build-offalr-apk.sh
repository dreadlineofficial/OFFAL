#!/usr/bin/env bash
# Builds dist/OFFAL-REMASTERED.apk with no Gradle and no Android Studio, from Ubuntu's own Android packages:
#   sudo apt-get install aapt apksigner dalvik-exchange android-sdk-platform-23 zipalign
# Run `node tools/build-offalr.mjs` first: the APK is a WebView around dist/offalr.html. Signed with the debug key in
# offalr-android/debug.keystore (made on first use), so it sideloads; a store build needs your own key.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BT=/usr/lib/android-sdk/build-tools/debian
JAR=/usr/lib/android-sdk/platforms/android-23/android.jar
SRC="$ROOT/offalr-android"
VERSION_NAME="${VERSION_NAME:-1.0.0}"
VERSION_CODE="${VERSION_CODE:-$(date +%y%j%H%M)}"   # rises with every build, so a new APK installs over the last
OUT="$ROOT/dist/OFFAL.apk"
[ -f "$ROOT/dist/offalr.html" ] || { echo "dist/offalr.html not found: run node tools/build-offalr.mjs first"; exit 1; }
W="$(mktemp -d)"; trap 'rm -rf "$W"' EXIT
mkdir -p "$W/classes" "$W/assets"
cp "$ROOT/dist/offalr.html" "$W/assets/offal.html"
javac --release 8 -nowarn -Xlint:-options -classpath "$JAR" -d "$W/classes" "$SRC"/src/games/offal/remastered/*.java
"$BT/dx" --dex --min-sdk-version=26 --output="$W/classes.dex" "$W/classes"
aapt package -f -M "$SRC/AndroidManifest.xml" -S "$SRC/res" -A "$W/assets" -I "$JAR" \
  --min-sdk-version 26 --target-sdk-version 34 --version-code "$VERSION_CODE" --version-name "$VERSION_NAME" -F "$W/unsigned.apk"
(cd "$W" && aapt add -f unsigned.apk classes.dex > /dev/null)
zipalign -f -p 4 "$W/unsigned.apk" "$W/aligned.apk"
KS="$SRC/debug.keystore"
[ -f "$KS" ] || keytool -genkeypair -keystore "$KS" -storepass android -keypass android -alias androiddebugkey \
  -keyalg RSA -keysize 2048 -validity 10000 -dname "CN=OFFAL REMASTERED Debug,O=Hollow Pines Meatworks" > /dev/null 2>&1
apksigner sign --ks "$KS" --ks-pass pass:android --key-pass pass:android --ks-key-alias androiddebugkey --out "$OUT" "$W/aligned.apk"
apksigner verify "$OUT"
echo "$OUT  $(du -h "$OUT" | cut -f1)  versionCode $VERSION_CODE"
