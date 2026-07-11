#!/bin/sh
# Neutralizes the mise/Go toolchain split in this repo: mise exports GOROOT
# for the repo-pinned go (1.25.x), but the `go` binary your PATH resolves may
# be a different version (e.g. homebrew 1.26.x). A go binary pointed at a
# foreign GOROOT fails every compile with:
#   compile: version "go1.25.5" does not match go tool version "go1.26.4"
# Unsetting GOROOT lets whichever go binary runs use its own standard library,
# which is always self-consistent. The module targets go 1.25.0 so both the
# mise-pinned and newer toolchains build it natively.
unset GOROOT
cd "$(dirname "$0")"
exec go run . "$@"
