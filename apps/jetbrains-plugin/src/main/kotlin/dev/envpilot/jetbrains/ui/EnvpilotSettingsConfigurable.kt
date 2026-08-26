package dev.envpilot.jetbrains.ui

import com.intellij.openapi.options.BoundConfigurable
import com.intellij.openapi.ui.DialogPanel
import com.intellij.ui.dsl.builder.AlignX
import com.intellij.ui.dsl.builder.bindIntValue
import com.intellij.ui.dsl.builder.bindSelected
import com.intellij.ui.dsl.builder.bindText
import com.intellij.ui.dsl.builder.panel
import dev.envpilot.jetbrains.BuildConfig
import dev.envpilot.jetbrains.auth.AuthService
import dev.envpilot.jetbrains.config.EnvpilotSettings
import dev.envpilot.jetbrains.version.VersionCheck

class EnvpilotSettingsConfigurable : BoundConfigurable("Envpilot") {
    private val settings get() = EnvpilotSettings.getInstance()
    private val state get() = settings.state

    override fun createPanel(): DialogPanel =
        panel {
            group("Connection") {
                row("Server URL:") {
                    textField()
                        .bindText(state::serverUrl)
                        .comment("Leave empty to use the default: ${BuildConfig.DEFAULT_SERVER_URL}")
                        .align(com.intellij.ui.dsl.builder.AlignX.FILL)
                }
                row("Signed in as:") {
                    val email = AuthService.getInstance().email
                    label(email ?: "Not signed in")
                }
            }
            group("Sync") {
                row {
                    checkBox("Auto-sync linked projects")
                        .bindSelected(state::autoSync)
                }
                row("Sync interval (seconds):") {
                    spinner(60..3600)
                        .bindIntValue(state::syncIntervalSeconds)
                }
                row("Target file:") {
                    textField()
                        .bindText(state::targetFile)
                        .comment("File variables are written to inside linked directories")
                }
            }
            group("Real-time") {
                row("Convex URL:") {
                    textField()
                        .bindText(state::convexUrl)
                        .comment("Leave empty to use the build-baked default.")
                        .align(com.intellij.ui.dsl.builder.AlignX.FILL)
                }.comment("Realtime updates use the same connection as pulls and fall back to interval polling.")
            }
            group("Editor & security") {
                row("Pause sync when idle (minutes):") {
                    spinner(0..120, 5)
                        .bindIntValue(state::idlePauseMinutes)
                }.comment("0 = never pause. While the IDE is idle longer than this, background sync waits.")
                row {
                    checkBox("Cloak managed values in editors")
                        .bindSelected(state::cloakValues)
                }
                row {
                    checkBox("Autocomplete env keys in .env files")
                        .bindSelected(state::autocompleteEnabled)
                }
                row {
                    checkBox("Commit guard (block commits of managed env files)")
                        .bindSelected(state::commitGuardEnabled)
                }
                row {
                    checkBox("Auto-install commit-guard git hook when linking")
                        .bindSelected(state::commitGuardAutoInstall)
                }
                row {
                    checkBox("Remove pulled env files when the IDE closes")
                        .bindSelected(state::autoUnsyncOnClose)
                }.comment("Decrypted secrets on disk defeat the point of the vault — delete them on close.")
            }
            group("Version") {
                row {
                    label(
                        "Installed: v${VersionCheck.currentVersion()}" +
                            (VersionCheck.latestKnown?.let { "  ·  Latest on server: v$it" } ?: ""),
                    )
                }
            }
        }
}
