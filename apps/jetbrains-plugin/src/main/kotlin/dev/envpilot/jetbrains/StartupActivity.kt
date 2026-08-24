package dev.envpilot.jetbrains

import com.intellij.openapi.project.Project
import com.intellij.openapi.startup.ProjectActivity
import com.intellij.openapi.util.Disposer
import dev.envpilot.jetbrains.auth.AuthService
import dev.envpilot.jetbrains.sync.SyncScheduler
import dev.envpilot.jetbrains.version.VersionCheck
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch

/**
 * Per project open: initialize auth, run the version check, start auto-sync.
 * The scheduler loop is cancelled when the project closes.
 */
class StartupActivity : ProjectActivity {

    override suspend fun execute(project: Project) {
        AuthService.getInstance().initialize()

        CoroutineScope(SupervisorJob() + Dispatchers.IO).launch {
            VersionCheck.currentVersion()?.let { current ->
                VersionCheck.check(current)
            }
        }

        SyncScheduler.getInstance().startFor(project)
        Disposer.register(project) {
            SyncScheduler.getInstance().stopFor(project)
        }
    }
}
