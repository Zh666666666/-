#!/usr/bin/env bash
set -euo pipefail

project_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
destination="$project_root/vendor/WitSDK"
source_repository="https://github.com/WITMOTION/WitBluetooth_BWT901BLE5_0.git"
source_commit="9efaab0fdd6a06dc807bf80402e58aa91b431c6f"
source_module="Android_Java/wit-example-ble5/WitSDK"
temporary_root="$(mktemp -d)"
trap 'rm -rf "$temporary_root"' EXIT

git -C "$temporary_root" init --quiet
git -C "$temporary_root" remote add origin "$source_repository"
git -C "$temporary_root" fetch --quiet --depth 1 origin "$source_commit"
git -C "$temporary_root" checkout --quiet --detach FETCH_HEAD

rm -rf "$destination"
mkdir -p "$(dirname "$destination")"
cp -R "$temporary_root/$source_module" "$destination"

device_model="$destination/src/main/java/com/wit/witsdk/Device/DeviceModel.java"
if [[ ! -f "$device_model" ]] || ! grep -q 'class DeviceModel' "$device_model"; then
    echo "Official WitSDK verification failed at $destination" >&2
    exit 1
fi

echo "Official WitSDK prepared at pinned commit $source_commit"
