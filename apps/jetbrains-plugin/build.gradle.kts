import org.jetbrains.intellij.platform.gradle.IntelliJPlatformType
import org.jetbrains.kotlin.gradle.dsl.JvmDefaultMode
import org.jetbrains.kotlin.gradle.dsl.KotlinVersion

plugins {
    id("java")
    id("org.jetbrains.kotlin.jvm") version "2.2.20"
    id("org.jetbrains.intellij.platform") version "2.18.1"
    id("io.gitlab.arturbosch.detekt") version "1.23.7"
    id("org.jlleitschuh.gradle.ktlint") version "12.1.2"
}

group = "dev.envpilot"
version = providers.gradleProperty("pluginVersion").get()

val workosClientId: String = System.getenv("WORKOS_CLIENT_ID") ?: ""
val defaultServerUrl: String =
    System.getenv("ENVPILOT_SERVER_URL") ?: "https://www.envpilot.dev"
val sentryDsn: String = System.getenv("SENTRY_DSN") ?: ""
val convexUrl: String = System.getenv("NEXT_PUBLIC_CONVEX_URL") ?: ""

val generatedSrcDir = layout.buildDirectory.dir("generated/src/kotlin")

val generateBuildConfig =
    tasks.register("generateBuildConfig") {
        val outFile = generatedSrcDir.get().file("dev/envpilot/jetbrains/BuildConfig.kt").asFile
        inputs.property("pluginVersion", version.toString())
        inputs.property("workosClientId", workosClientId)
        inputs.property("defaultServerUrl", defaultServerUrl)
        inputs.property("sentryDsn", sentryDsn)
        inputs.property("convexUrl", convexUrl)
        outputs.file(outFile)
        doLast {
            fun raw(value: String): String {
                require("\"\"\"" !in value) { "Build values must not contain triple quotes" }
                return "\"\"\"" + value.replace("$", "\${'$'}") + "\"\"\""
            }
            val fields =
                mapOf(
                    "PLUGIN_VERSION" to version.toString(),
                    "WORKOS_CLIENT_ID" to workosClientId,
                    "DEFAULT_SERVER_URL" to defaultServerUrl,
                    "SENTRY_DSN" to sentryDsn,
                    "CONVEX_URL" to convexUrl,
                )
            outFile.parentFile.mkdirs()
            outFile.writeText(
                "package dev.envpilot.jetbrains\n\nobject BuildConfig {\n" +
                    fields.entries.joinToString("") { (name, value) -> "    val $name = ${raw(value)}\n" } +
                    "}\n",
            )
        }
    }

kotlin {
    jvmToolchain(21)
    compilerOptions {
        jvmDefault = JvmDefaultMode.NO_COMPATIBILITY
        apiVersion = KotlinVersion.KOTLIN_2_1
    }
}

sourceSets.main {
    kotlin.srcDir(generatedSrcDir)
}

repositories {
    mavenCentral()
    intellijPlatform {
        defaultRepositories()
    }
}

dependencies {
    intellijPlatform {
        intellijIdeaCommunity("2025.1")
    }
    implementation("com.google.code.gson:gson:2.11.0")
    implementation("io.sentry:sentry:8.53.0")
    testImplementation(kotlin("test"))
    testImplementation("junit:junit:4.13.2")
}

intellijPlatform {
    pluginConfiguration {
        id = "dev.envpilot"
        name = "Envpilot"
        version = project.version.toString()
        changeNotes = layout.projectDirectory.file("change-notes.html").asFile.readText()
        ideaVersion {
            sinceBuild = "251"
            untilBuild = provider { null }
        }
    }
    signing {
        certificateChain = providers.environmentVariable("CERTIFICATE_CHAIN")
        privateKey = providers.environmentVariable("PRIVATE_KEY")
        password = providers.environmentVariable("PRIVATE_KEY_PASSWORD")
    }
    publishing {
        token = providers.environmentVariable("PUBLISH_TOKEN")
    }
    pluginVerification {
        ides {
            recommended()
            select {
                types = listOf(IntelliJPlatformType.AndroidStudio)
                sinceBuild = "251"
                untilBuild = "251.*"
            }
        }
    }
}

tasks {
    compileKotlin {
        dependsOn(generateBuildConfig)
    }

    buildSearchableOptions {
        enabled = false
    }
}

tasks.named("runKtlintCheckOverMainSourceSet") { dependsOn(generateBuildConfig) }
tasks.named("runKtlintFormatOverMainSourceSet") { dependsOn(generateBuildConfig) }
tasks.named("runKtlintCheckOverKotlinScripts") { dependsOn(generateBuildConfig) }

detekt {
    config.setFrom(files("detekt.yml"))
    buildUponDefaultConfig = true
}
