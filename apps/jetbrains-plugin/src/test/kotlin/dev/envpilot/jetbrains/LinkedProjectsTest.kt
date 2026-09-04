package dev.envpilot.jetbrains

import dev.envpilot.jetbrains.sync.LinkedProject
import dev.envpilot.jetbrains.sync.LinkedProjectsService
import org.junit.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNotEquals
import kotlin.test.assertTrue

class LinkedProjectsTest {
    private fun link(
        projectId: String,
        environment: String,
    ) = LinkedProject(
        projectId = projectId,
        environment = environment,
        directoryPath = "/tmp/envpilot-shared",
        accountId = "acct",
    )

    private fun service(vararg links: LinkedProject) = LinkedProjectsService().also { svc -> links.forEach { svc.add(it) } }

    @Test
    fun `two projects sharing one directory get distinct target files`() {
        val a = link("p1", "development")
        val b = link("p2", "staging")
        service(a, b).normalize("acct")
        assertEquals(".env.local", a.targetFile)
        assertEquals(".env.staging", b.targetFile)
        assertTrue(a.includeSecretFiles)
        assertFalse(b.includeSecretFiles)
    }

    @Test
    fun `remove matches a copy taken before normalization`() {
        val a = link("p1", "development")
        val svc = service(a, link("p2", "staging"))
        val stale = a.copy()
        svc.normalize("acct")

        assertNotEquals(stale, a)
        assertTrue(svc.remove(stale))
        assertFalse(svc.remove(stale))
    }
}
