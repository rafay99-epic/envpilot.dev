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
    fun `remove matches a link taken before normalization`() {
        val a = link("p1", "development")
        val svc = service(a, link("p1", "staging"))
        svc.normalize("acct")

        assertNotEquals(a, svc.getState().links.first())
        assertTrue(svc.remove(a))
        assertFalse(svc.remove(a))
    }

    @Test
    fun `a state handed to the serializer is never mutated by later writes`() {
        val svc = service(link("p1", "development"))
        val saved = svc.getState()
        val before = saved.links.toList()

        svc.add(link("p1", "staging"))
        svc.normalize("acct")
        svc.recordDevice(before.first(), "device_1")

        assertEquals(before, saved.links)
        assertEquals("device_1", svc.getState().links.first().deviceId)
    }
}
