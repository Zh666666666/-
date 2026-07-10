#!/usr/bin/env bash
set -euo pipefail

project_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
output_dir="$project_root/app/build/outputs/apk/release"
unsigned_apk="$output_dir/app-release-unsigned.apk"
aligned_apk="$output_dir/app-release-aligned.apk"
signed_apk="${SIGNED_APK:-$output_dir/TKA-Gateway-v0.2.0.apk}"

for variable in ANDROID_SDK_ROOT SIGNING_KEYSTORE SIGNING_KEY_ALIAS SIGNING_STORE_PASSWORD SIGNING_KEY_PASSWORD; do
    if [[ -z "${!variable:-}" ]]; then
        echo "$variable is required." >&2
        exit 1
    fi
done

if [[ "${1:-}" != "--skip-build" ]]; then
    (cd "$project_root" && ./gradlew --no-daemon clean assembleRelease)
fi
if [[ ! -f "$unsigned_apk" ]]; then
    echo "Unsigned release APK not found: $unsigned_apk" >&2
    exit 1
fi

build_tools="$(find "$ANDROID_SDK_ROOT/build-tools" -mindepth 1 -maxdepth 1 -type d | sort -V | tail -1)"
zipalign="$build_tools/zipalign"
apksigner="$build_tools/apksigner"
if [[ ! -x "$zipalign" || ! -x "$apksigner" ]]; then
    echo "zipalign or apksigner was not found under $ANDROID_SDK_ROOT/build-tools." >&2
    exit 1
fi

rm -f "$aligned_apk" "$signed_apk" "$signed_apk.idsig" "$signed_apk.verify.txt"
"$zipalign" -p -f 4 "$unsigned_apk" "$aligned_apk"
"$apksigner" sign \
    --ks "$SIGNING_KEYSTORE" \
    --ks-key-alias "$SIGNING_KEY_ALIAS" \
    --ks-pass env:SIGNING_STORE_PASSWORD \
    --key-pass env:SIGNING_KEY_PASSWORD \
    --min-sdk-version 24 \
    --v1-signing-enabled false \
    --v2-signing-enabled true \
    --v3-signing-enabled true \
    --v4-signing-enabled true \
    --out "$signed_apk" \
    "$aligned_apk"

"$zipalign" -c -p 4 "$signed_apk"
"$apksigner" verify --verbose --print-certs "$signed_apk" | tee "$signed_apk.verify.txt"
grep -Fq 'Verified using v2 scheme (APK Signature Scheme v2): true' "$signed_apk.verify.txt"
grep -Fq 'Verified using v3 scheme (APK Signature Scheme v3): true' "$signed_apk.verify.txt"
test -s "$signed_apk.idsig"
sha256sum "$signed_apk" "$signed_apk.idsig"
rm -f "$aligned_apk"

echo "Signed APK ready: $signed_apk"
echo "APK Signature Scheme v4 sidecar: $signed_apk.idsig"
