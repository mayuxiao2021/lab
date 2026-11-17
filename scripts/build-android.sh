#!/usr/bin/env bash
set -euo pipefail

if [ -z "${JAVA_HOME:-}" ] || [ ! -d "${JAVA_HOME:-}" ]; then
  DETECTED_JDK="$(ls -d /usr/lib/jvm/java-*-openjdk* 2>/dev/null | sort -V | tail -n 1 || true)"
  if [ -n "$DETECTED_JDK" ]; then
    export JAVA_HOME="$DETECTED_JDK"
  fi
fi
export ANDROID_SDK_ROOT="${ANDROID_SDK_ROOT:-/opt/android-sdk}"
export ANDROID_HOME="${ANDROID_HOME:-$ANDROID_SDK_ROOT}"
if [ -n "${JAVA_HOME:-}" ]; then
  export PATH="$JAVA_HOME/bin:$ANDROID_SDK_ROOT/cmdline-tools/latest/bin:$ANDROID_SDK_ROOT/platform-tools:$PATH"
fi

KEYSTORE_PATH="android/app/rhine-lab-release.keystore"
KEYSTORE_PROPS="android/keystore.properties"
KEY_ALIAS="${RHINE_KEY_ALIAS:-rhinelab-release}"
KEY_PASS="${RHINE_KEYSTORE_PASSWORD:-RhineLabRLOS#42}"

if [ ! -f "$KEYSTORE_PATH" ]; then
  echo "[Rhine Lab Android] Generating release signing keystore..."
  keytool -genkeypair -v \
    -keystore "$KEYSTORE_PATH" \
    -storetype PKCS12 \
    -alias "$KEY_ALIAS" \
    -keyalg RSA \
    -keysize 2048 \
    -validity 10000 \
    -storepass "$KEY_PASS" \
    -keypass "$KEY_PASS" \
    -dname "CN=Rhine Lab LLC, OU=R.L.OS Mobile Division, O=Rhine Lab, L=Trimounts, S=Columbia, C=US"
fi

if [ ! -f "$KEYSTORE_PROPS" ]; then
  cat > "$KEYSTORE_PROPS" <<EOF
storeFile=rhine-lab-release.keystore
storePassword=$KEY_PASS
keyAlias=$KEY_ALIAS
keyPassword=$KEY_PASS
EOF
fi

npm run build

if [ ! -d "android" ]; then
  npx cap add android
fi

npx cap sync android

# Ensure Android launcher icons reflect Rhine Lab branding if generated
if [ -f "public/pwa-512x512.png" ]; then
  for dir in mipmap-mdpi mipmap-hdpi mipmap-xhdpi mipmap-xxhdpi mipmap-xxxhdpi; do
    mkdir -p "android/app/src/main/res/$dir"
    cp -f public/pwa-192x192.png "android/app/src/main/res/$dir/ic_launcher.png"
    cp -f public/pwa-maskable-512x512.png "android/app/src/main/res/$dir/ic_launcher_round.png"
    cp -f public/pwa-maskable-512x512.png "android/app/src/main/res/$dir/ic_launcher_foreground.png"
  done
fi

pushd android >/dev/null
chmod +x gradlew
./gradlew assembleRelease --no-daemon
popd >/dev/null

RELEASE_APK="android/app/build/outputs/apk/release/app-release.apk"
if [ ! -f "$RELEASE_APK" ]; then
  echo "ERROR: Signed release APK not produced at $RELEASE_APK"
  exit 1
fi

APKSIGNER="$(ls -d "$ANDROID_SDK_ROOT"/build-tools/*/apksigner 2>/dev/null | sort -V | tail -n 1 || true)"
if [ -n "$APKSIGNER" ] && [ -x "$APKSIGNER" ]; then
  echo "[Rhine Lab Android] Verifying APK cryptographic signature..."
  "$APKSIGNER" verify --verbose --print-certs "$RELEASE_APK"
fi

mkdir -p downloads
cp -f "$RELEASE_APK" downloads/rhine-lab-rlos.apk
ls -lh downloads/rhine-lab-rlos.apk
