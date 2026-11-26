#!/usr/bin/env bash
# Build Melodix from its GitHub sources inside the cloud session (no local PC involved).
# Melodix is an apktool project (smali/res): apktool b -> zipalign -> apksigner with a TEST key.
# Usage: cloud/build-melodix.sh [git-ref]  or  cloud/build-melodix.sh --dir /path/to/melodix
#        -> prints the APK path on the last line.
set -euo pipefail
# --dir DIR: build a local Melodix checkout (same as MELODIX_DIR=DIR); an argument keeps the command matchable by allow rules.
[ "${1:-}" = "--dir" ] && { MELODIX_DIR=${2:?--dir needs a path}; set -- ; }
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

# Sources: a local Melodix checkout (MELODIX_DIR, e.g. the session's repo: builds its current state, uncommitted
# changes included, without touching it) or else the public repo fetched fresh at REF.
if [ -n "${MELODIX_DIR:-}" ]; then
  [ -f "$MELODIX_DIR/apktool.yml" ] && [ -d "$MELODIX_DIR/smali" ] || { echo "MELODIX_DIR is not a Melodix checkout: $MELODIX_DIR" >&2; exit 1; }
  SRC=$MELODIX_DIR; REF=$(git -C "$SRC" rev-parse --abbrev-ref HEAD 2>/dev/null || echo local)
  [ -z "$(git -C "$SRC" status --porcelain 2>/dev/null)" ] || echo "note: building uncommitted changes of $SRC"
elif [ -d "$SRC/.git" ]; then git -C "$SRC" fetch -q --depth 1 origin "$REF" && git -C "$SRC" checkout -q -f FETCH_HEAD
else GIT_LFS_SKIP_SMUDGE=1 git clone -q --depth 1 --branch "$REF" https://github.com/Souxch06/Melodix "$SRC"; fi
SHA=$(git -C "$SRC" rev-parse --short HEAD)

# Same project layout as Melodix's release-apk.yml.
PROJ=$WORK/proj; rm -rf "$PROJ"; mkdir -p "$PROJ"
for i in AndroidManifest.xml META-INF apktool.yml assets kotlin lib original res smali unknown; do [ -e "$SRC/$i" ] && cp -r "$SRC/$i" "$PROJ/"; done
# Melodix verifies its own signing certificate at startup (AndBridge.isSignatureValid) and refuses foreign
# signatures. Like Melodix's scripts/build_preview_apk.sh, put the test key's fingerprint in the TEMP copy only.
KS=$WORK/test.keystore
[ -f "$KS" ] || keytool -genkeypair -keystore "$KS" -storepass android -keypass android -alias test -keyalg RSA -keysize 2048 -validity 3650 -dname "CN=Melodix cloud test" > /dev/null 2>&1
FP=$(keytool -exportcert -keystore "$KS" -storepass android -alias test 2>/dev/null | sha256sum | awk '{print toupper($1)}' | fold -w 2 | paste -sd ':' -)
[[ "$FP" =~ ^([A-F0-9]{2}:){31}[A-F0-9]{2}$ ]] || { echo "invalid fingerprint" >&2; exit 1; }
python3 - "$PROJ/res/values/strings.xml" "$FP" <<'PY'
import pathlib, re, sys
p = pathlib.Path(sys.argv[1]); t = p.read_text(encoding="utf-8")
pat = r'(<string name="expected_signature_sha256">)[^<]*(</string>)'
assert len(re.findall(pat, t)) == 1, "expected_signature_sha256 not found once"
p.write_text(re.sub(pat, lambda m: m.group(1) + sys.argv[2] + m.group(2), t), encoding="utf-8")
PY
java -jar "$TOOLS/apktool.jar" if --frame-path "$WORK/fw" "$SRC/android/apktool-framework/1.apk" > /dev/null
java -jar "$TOOLS/apktool.jar" b "$PROJ" --frame-path "$WORK/fw" -o "$OUT/unsigned.apk" > "$OUT/apktool.log" 2>&1 || { tail -30 "$OUT/apktool.log"; exit 1; }

# Signed with the session's TEST key (above), never the production key (a Melodix CI secret).
APK=$OUT/Melodix-$SHA-cloudtest.apk
"$TOOLS/bt/zipalign" -f 4 "$OUT/unsigned.apk" "$OUT/aligned.apk"
"$TOOLS/bt/apksigner" sign --ks "$KS" --ks-pass pass:android --out "$APK" "$OUT/aligned.apk"
"$TOOLS/bt/apksigner" verify "$APK"
echo "built $REF@$SHA"
echo "$APK"
