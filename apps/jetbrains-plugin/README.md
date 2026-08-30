# Envpilot for JetBrains IDEs

[![JetBrains Marketplace](https://img.shields.io/jetbrains/plugin/v/33346-Envpilot?label=version)](https://plugins.jetbrains.com/plugin/33346-envpilot)
[![Downloads](https://img.shields.io/jetbrains/plugin/dt/33346-Envpilot)](https://plugins.jetbrains.com/plugin/33346-envpilot)
[![Rating](https://img.shields.io/jetbrains/plugin/rating/33346-Envpilot)](https://plugins.jetbrains.com/plugin/33346-envpilot)
[![Users](https://img.shields.io/jetbrains/plugin/users/33346-Envpilot)](https://plugins.jetbrains.com/plugin/33346-envpilot)
[![Build](https://github.com/rafay99-epic/envpilot.dev/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/rafay99-epic/envpilot.dev/actions/workflows/ci.yml)
[![Platform](https://img.shields.io/badge/platform-IntelliJ%20%7C%20Android%20Studio%20%7C%20PyCharm%20%7C%20GoLand%20%7C%20WebStorm-3574f0)](https://plugins.jetbrains.com/plugin/33346-envpilot)

Envpilot keeps environment variables and secret files in one secure, central place, and this plugin brings them straight into IntelliJ IDEA, Android Studio, PyCharm, GoLand, WebStorm, Rider and every other IntelliJ-based IDE.

## Features

- **Sign in** once with the WorkOS AuthKit device flow; sessions live in the IDE password store with multi-account support.
- **Browse** organizations and projects from the Envpilot tool window and link any directory to a project plus environment (development, staging, production).
- **Pull** decrypted variables into your target `.env` file and materialize secret files with correct POSIX permissions. Fetch happens before any write and decrypt failures abort loudly, never partially.
- **Real-time sync** over a Convex WebSocket with interval fallback; pulls the moment a server-side change lands or you return to the IDE.
- **Protect** secrets locally: value cloaking in editors, clipboard copy/cut guard, drift detection, timed and permission-checked reveals, and an optional git commit guard.
- **Request** new variables through the existing approval flow, driven by Envpilot's role capability registry.

## Install

From the Marketplace: **Settings → Plugins → Marketplace → search "Envpilot"**, or from any IDE open https://plugins.jetbrains.com/plugin/33346-envpilot and hit Install.

From disk: download the signed zip from a [release](https://plugins.jetbrains.com/plugin/33346-envpilot/versions), then **Settings → Plugins → ⚙ → Install Plugin from Disk**.

## Building from source

```bash
cd apps/jetbrains-plugin

# Production values are embedded at build time; CI pulls them from Envpilot
export WORKOS_CLIENT_ID=<client id>
export NEXT_PUBLIC_CONVEX_URL=<convex deployment url>
export SENTRY_DSN=<sentry dsn>            # optional
export CERTIFICATE_CHAIN=<pem chain>      # marketplace signing
export PRIVATE_KEY=<pem key>
export PRIVATE_KEY_PASSWORD=<password>

./gradlew build verifyPlugin   # build + run the plugin verifier
./gradlew signPlugin           # marketplace-signed zip in build/distributions
```

Build-time values come from environment variables, never files; CI exports them from Envpilot at deploy time. Bump `pluginVersion` in `gradle.properties` for every release — the Marketplace rejects duplicate versions.

## Platform compatibility

`since-build 251` (IDE 2025.1+) with no upper bound. Verified against IntelliJ IDEA 2025.1–2026.2 and Android Studio 2025.1; report anything else and the plugin verifier gates every release in CI.
