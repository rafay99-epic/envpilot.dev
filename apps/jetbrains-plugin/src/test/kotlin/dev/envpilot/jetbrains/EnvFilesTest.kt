package dev.envpilot.jetbrains

import dev.envpilot.jetbrains.sync.EnvFiles
import dev.envpilot.jetbrains.sync.conventionalTargetFileFor
import org.junit.Assert.assertEquals
import org.junit.Test

class EnvFilesTest {
    @Test
    fun `multi environment links use separate conventional files`() {
        assertEquals(".env.local", conventionalTargetFileFor("development", 2))
        assertEquals(".env.staging", conventionalTargetFileFor("staging", 2))
        assertEquals(".env.production", conventionalTargetFileFor("production", 3))
    }

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
        assertEquals(
            listOf(EnvFiles.Entry("A", "1"), EnvFiles.Entry("B", "2"), EnvFiles.Entry("C", "4")),
            entries,
        )
    }

    @Test
    fun `values needing quoting are quoted and escaped`() {
        assertEquals("plain", EnvFiles.quote("plain"))
        assertEquals("\"a b\"", EnvFiles.quote("a b"))
        assertEquals("\"line1\\nline2\"", EnvFiles.quote("line1\nline2"))
        assertEquals("\"say \\\"hi\\\"\"", EnvFiles.quote("say \"hi\""))
        assertEquals("\"c:\\\\tmp\"", EnvFiles.quote("c:\\tmp"))
        assertEquals("\"# not a comment\"", EnvFiles.quote("# not a comment"))
        val bell = "\u0007"
        assertEquals("\"$bell\"", EnvFiles.quote(bell))
    }

    @Test
    fun `quote and parse round trip hostile values`() {
        val values =
            mapOf(
                "MULTI" to "line1\nline2",
                "HASH" to "pa#ss",
                "QUOTED" to "say \"hi\"",
                "BACKSLASH" to "c:\\tmp\\x",
                "SPACED" to "  padded  ",
                "DOLLAR" to "\$HOME`x`",
                "CR" to "a\rb",
            )
        assertEquals(values.entries.map { EnvFiles.Entry(it.key, it.value) }, EnvFiles.parse(EnvFiles.merge(null, values)))
    }

    @Test
    fun `merge in place quotes values and keeps the export prefix`() {
        val out = EnvFiles.merge("export A=old\nB=old\n", mapOf("A" to "a b", "B" to "plain"))
        assertEquals(listOf("export A=\"a b\"", "B=plain", ""), out.lines())
    }

    @Test
    fun `single quoted values are read literally`() {
        assertEquals(listOf(EnvFiles.Entry("A", "a\\nb")), EnvFiles.parse("A='a\\nb'"))
    }

    @Test
    fun `crlf line endings survive a merge`() {
        val out = EnvFiles.merge("A=old\r\nB=keep\r\n", mapOf("A" to "new", "C" to "3"))
        assertEquals("A=new\r\nB=keep\r\n\r\nC=3", out)
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
