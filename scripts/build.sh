#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")/.."
if [ "$(uname -s)" != Darwin ]; then echo 'Native builds require macOS 14+ and Xcode Command Line Tools.' >&2; exit 1; fi
ARCH="$(uname -m)"
case "$ARCH" in arm64|x86_64) ;; *) echo "Unsupported architecture: $ARCH" >&2; exit 1 ;; esac
APP="build/Agent Islands.app"
# Remove only generated products; keep runtime caches and local research.
rm -rf "$APP" build/dmg build/AppIcon.iconset
mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources" build/AppIcon.iconset dist
node scripts/locales.mjs --write
node scripts/vendor.mjs
node scripts/package-qa.mjs
clang -Wall -Wextra -O2 -arch "$ARCH" -mmacosx-version-min=14.0 native/pty.c -o "$APP/Contents/MacOS/islands-pty"
swiftc -swift-version 5 -O -target "$ARCH-apple-macosx14.0" native/main.swift native/Conversations.swift native/Intelligence.swift native/Workspace.swift native/Operations.swift native/ProjectWorkspaces.swift native/Browser.swift native/AgentState.swift native/QAClient.swift native/AIConfiguration.swift native/Localization.swift -o "$APP/Contents/MacOS/Agent Islands" -framework Cocoa -framework WebKit -framework UserNotifications -framework AVFoundation -framework Speech -framework Security -framework LocalAuthentication -lsqlite3
cp native/Info.plist "$APP/Contents/Info.plist"
cp -R native/es.lproj native/en.lproj "$APP/Contents/Resources/"
cp -R ui "$APP/Contents/Resources/"
mkdir -p "$APP/Contents/Resources/licenses"
cp LICENSE NOTICE THIRD_PARTY_NOTICES.md "$APP/Contents/Resources/licenses/"
cp config/runtime.json "$APP/Contents/Resources/qa/runtime/manifest.json"
swift native/icon.swift build/AppIcon.png
for n in 16 32 128 256 512; do
  sips -z "$n" "$n" build/AppIcon.png --out "build/AppIcon.iconset/icon_${n}x${n}.png" >/dev/null
  double=$((n * 2))
  sips -z "$double" "$double" build/AppIcon.png --out "build/AppIcon.iconset/icon_${n}x${n}@2x.png" >/dev/null
done
iconutil -c icns build/AppIcon.iconset -o "$APP/Contents/Resources/AppIcon.icns"
codesign --force --sign - "$APP/Contents/MacOS/islands-pty"
codesign --force --sign - "$APP/Contents/Resources/qa/runtime/bin/node"
codesign --force --sign - "$APP"
codesign --verify --deep --strict "$APP"
mkdir -p build/dmg
ditto "$APP" "build/dmg/Agent Islands.app"
if [ ! -L build/dmg/Applications ]; then ln -s /Applications build/dmg/Applications; fi
IMAGE="dist/.Agent Islands.build.dmg"
hdiutil create -volname "Agent Islands" -srcfolder build/dmg -ov -fs HFS+ -size 512m -format UDZO "$IMAGE" >/dev/null
mv -f "$IMAGE" "dist/Agent Islands.dmg"
printf 'Built: %s\n' "$PWD/dist/Agent Islands.dmg"
