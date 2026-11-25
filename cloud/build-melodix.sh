#!/usr/bin/env bash
# Build Melodix from its GitHub sources inside the cloud session (no local PC involved).
# Melodix is an apktool project (smali/res): apktool b -> zipalign -> apksigner with a TEST key.
# Usage: cloud/build-melodix.sh [git-ref]   -> prints the APK path on the last line.
set -euo pipefail
REF=${1:-main}
WORK=${ANDROID_CLOUD_WORK:-$HOME/.android-cloud/work}
TOOLS=$WORK/tools; SRC=$WORK/melodix; OUT=$WORK/out
mkdir -p "$TOOLS" "$OUT"

# Toolchain (cached): apktool 2.9.3 (same as Melodix CI) + Android build-tools 35 (zipalign, apksigner).
[ -f "$TOOLS/apktool.jar" ] || curl -fsSL -o "$TOOLS/apktool.jar" https://github.com/iBotPeaches/Apktool/releases/download/v2.9.3/apktool_2.9.3.jar
if [ ! -x "$TOOLS/bt/zipalign" ]; then
  curl -fsSL -o "$TOOLS/bt.zip" https://dl.google.com/android/repository/build-tools_r35_linux.zip
  rm -rf "$TOOLS/bt" "$TOOLS/android-15"; (cd "$TOOLS" && unzip -q bt.zip && mv android-15 bt); rm "$TOOLS/bt.zip"
fi

# Sources: public repo, fetched fresh every build so each correction is picked up.
if [ -d "$SRC/.git" ]; then git -C "$SRC" fetch -q --depth 1 origin "$REF" && git -C "$SRC" checkout -q -f FETCH_HEAD
else GIT_LFS_SKIP_SMUDGE=1 git clone -q --depth 1 --branch "$REF" https://github.com/Souxch06/Melodix "$SRC"; fi
SHA=$(git -C "$SRC" rev-parse --short HEAD)

# Same project layout as Melodix's release-apk.yml.
PROJ=$WORK/proj; rm -rf "$PROJ"; mkdir -p "$PROJ"
for i in AndroidManifest.xml META-INF apktool.yml assets kotlin lib original res smali unknown; do [ -e "$SRC/$i" ] && cp -r "$SRC/$i" "$PROJ/"; done
java -jar "$TOOLS/apktool.jar" if --frame-path "$WORK/fw" "$SRC/android/apktool-framework/1.apk" > /dev/null
java -jar "$TOOLS/apktool.jar" b "$PROJ" --frame-path "$WORK/fw" -o "$OUT/unsigned.apk" > "$OUT/apktool.log" 2>&1 || { tail -30 "$OUT/apktool.log"; exit 1; }

# Test signing key: generated once, kept in the session only. NOT the production key (that one is a Melodix CI secret).
KS=$WORK/test.keystore
[ -f "$KS" ] || keytool -genkeypair -keystore "$KS" -storepass android -keypass android -alias test -keyalg RSA -keysize 2048 -validity 3650 -dname "CN=Melodix cloud test" > /dev/null 2>&1
APK=$OUT/Melodix-$SHA-cloudtest.apk
"$TOOLS/bt/zipalign" -f 4 "$OUT/unsigned.apk" "$OUT/aligned.apk"
"$TOOLS/bt/apksigner" sign --ks "$KS" --ks-pass pass:android --out "$APK" "$OUT/aligned.apk"
"$TOOLS/bt/apksigner" verify "$APK"
echo "built $REF@$SHA"
echo "$APK"
