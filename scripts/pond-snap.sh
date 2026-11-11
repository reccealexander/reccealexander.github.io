#!/bin/bash
# A private copy of the tree to measure against.
#
# Another agent is editing this repo while the pond is being worked on, and a
# page loaded in the middle of one of those edits is a scene with no grass in
# it and a 500 in the console — which in a frame-time measurement is
# indistinguishable from the thing being measured. So the probe is pointed at a
# snapshot on its own port, and the snapshot is only refreshed when the tree
# type-checks.
set -e
SRC=/Users/alexanderrecce/personal_site/petal-three
SNAP=/Users/alexanderrecce/personal_site/petal-snap
cd "$SRC"
npx tsc --noEmit
rsync -a --delete "$SRC/src/" "$SNAP/src/"
rsync -a --delete "$SRC/public/" "$SNAP/public/"
for f in index.html vite.config.ts tsconfig.json tsconfig.app.json tsconfig.node.json package.json; do
  cp "$SRC/$f" "$SNAP/$f"
done
[ -e "$SNAP/node_modules" ] || ln -s "$SRC/node_modules" "$SNAP/node_modules"
echo "snapshot refreshed"
