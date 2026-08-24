package dev.envpilot.jetbrains

import dev.envpilot.jetbrains.sync.EnvFiles
import org.junit.Assert.assertEquals
import org.junit.Test

class EnvFilesTest {
    @Test
    fun `merge into empty produces sorted key value lines`() {
        val out = EnvFiles.merge(null, linkedMapOf("B" to "2", "A" to "1"))
        assertEquals("B=2\nA=1\n", out)
    }

    @Test
    fun `merge updates existing keys in place and preserves comments`() {
        val existing = "# config\nA=old\nC=keep\n"
        val out = EnvFiles.merge(existing, mapOf("A" to "new", "D" to "4"))
        val lines = out.lines()
        assertEquals("# config", lines[0])
        assertEquals("A=new", lines[1])
        assertEquals("C=keep", lines[2])
        assertEquals(true, lines.contains("D=4"))
    }

    @Test
    fun `parse skips comments blanks and malformed lines`() {
        val entries =
            EnvFiles.parse(
                """
                # comment
                A=1

                not a pair
                B=2
                123bad=3
                export C=4
                """.trimIndent(),
            )
        assertEquals(listOf(EnvFiles.Entry("A", "1"), EnvFiles.Entry("B", "2")), entries)
    }

    @Test
    fun `overwrite mode replaces file with pulled set only`() {
        val out = EnvFiles.resolve("A=1\n# keep me\nC=3\n", mapOf("A" to "9"), EnvFiles.ConflictMode.OVERWRITE)
        org.junit.Assert.assertFalse(out.contains("# keep me"))
        org.junit.Assert.assertFalse(out.contains("C=3"))
        org.junit.Assert.assertTrue(out.contains("A=9"))
    }

    @Test
    fun `merge mode keeps comments and unknown keys`() {
        val out = EnvFiles.resolve("A=1\n# keep me\nC=3\n", mapOf("A" to "9"), EnvFiles.ConflictMode.MERGE)
        org.junit.Assert.assertTrue(out.contains("# keep me"))
        org.junit.Assert.assertTrue(out.contains("C=3"))
        org.junit.Assert.assertTrue(out.contains("A=9"))
    }

    @Test
    fun `backup mode merges and names the backup path`() {
        val target = java.nio.file.Files.createTempFile("env", ".local")
        java.nio.file.Files.writeString(target, "A=1\n")
        val out = EnvFiles.resolve("A=1\n", mapOf("A" to "2"), EnvFiles.ConflictMode.BACKUP)
        org.junit.Assert.assertTrue(out.contains("A=2"))
        assertEquals(
            target.resolveSibling(target.fileName.toString() + ".envpilot-bak"),
            EnvFiles.backupPath(target),
        )
    }

    @Test
    fun `conflict mode falls back to merge for unknown ids`() {
        assertEquals(EnvFiles.ConflictMode.MERGE, EnvFiles.ConflictMode.from("bogus"))
        assertEquals(EnvFiles.ConflictMode.OVERWRITE, EnvFiles.ConflictMode.from("overwrite"))
    }

    @Test
    fun `atomicWrite writes content`() {
        val dir = java.nio.file.Files.createTempDirectory("envpilot-test")
        val target = dir.resolve(".env.local")
        EnvFiles.atomicWrite(target, "K=V\n")
        assertEquals("K=V\n", java.nio.file.Files.readString(target))
    }
}
