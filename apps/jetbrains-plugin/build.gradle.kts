plugins {
    id("java")
    id("org.jetbrains.kotlin.jvm") version "2.2.20"
    id("org.jetbrains.intellij.platform") version "2.18.1"
    id("io.gitlab.arturbosch.detekt") version "1.23.7"
    id("org.jlleitschuh.gradle.ktlint") version "12.1.2"
}

group = "dev.envpilot"
version = providers.gradleProperty("pluginVersion").get()

// Build-time constants, mirroring how the VS Code extension embeds
// __WORKOS_CLIENT_ID__ / __DEFAULT_SERVER_URL__ at bundle time.
val workosClientId: String = System.getenv("WORKOS_CLIENT_ID") ?: ""
val defaultServerUrl: String =
    System.getenv("ENVPILOT_SERVER_URL") ?: "https://www.envpilot.dev"
val sentryDsn: String = System.getenv("SENTRY_JETBRAINS_DSN") ?: ""
val convexUrl: String = System.getenv("NEXT_PUBLIC_CONVEX_URL") ?: ""

val generatedSrcDir = layout.buildDirectory.dir("generated/src/kotlin")

val generateBuildConfig by tasks.registering {
    val outFile = generatedSrcDir.get().file("dev/envpilot/jetbrains/BuildConfig.kt").asFile
    inputs.property("workosClientId", workosClientId)
    inputs.property("defaultServerUrl", defaultServerUrl)
    inputs.property("sentryDsn", sentryDsn)
    inputs.property("convexUrl", convexUrl)
    outputs.file(outFile)
    doLast {
        outFile.parentFile.mkdirs()
        outFile.writeText(
            """
            package dev.envpilot.jetbrains

            object BuildConfig {
                val WORKOS_CLIENT_ID = "${workosClientId.replace("\"", "\\\"")}"
                val DEFAULT_SERVER_URL = "${defaultServerUrl.replace("\"", "\\\"")}"
                val SENTRY_DSN = "${sentryDsn.replace("\"", "\\\"")}"
                val CONVEX_URL = "${convexUrl.replace("\"", "\\\"")}"
            }
            """.trimIndent() + "\n",
        )
    }
}

kotlin {
    jvmToolchain(21)
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
        // Build target only — runtime compatibility comes from sinceBuild in
        // plugin.xml (251.*), which keeps Android Studio builds on 2025.1+
        // platform bases in range. Community carries all platform APIs the
        // plugin uses; no need for the much larger Ultimate download.
        intellijIdeaCommunity("2025.1")
    }
    implementation("com.google.code.gson:gson:2.11.0")
    implementation("io.sentry:sentry:7.14.0")
    testImplementation(kotlin("test"))
    testImplementation("junit:junit:4.13.2")
}

intellijPlatform {
    pluginConfiguration {
        id = "dev.envpilot"
        name = "Envpilot"
        version = project.version.toString()
        ideaVersion {
            sinceBuild = "251"
            untilBuild = provider { null }
        }
    }
}

tasks {
    compileKotlin {
        dependsOn(generateBuildConfig)
    }

    // Not needed until publishing; saves minutes on every local build.
    buildSearchableOptions {
        enabled = false
    }
}

// ktlint scans the generated source dir too — declare the ordering.
tasks.named("runKtlintCheckOverMainSourceSet") { dependsOn(generateBuildConfig) }
tasks.named("runKtlintCheckOverKotlinScripts") { dependsOn(generateBuildConfig) }

// Quality gate: detekt (lint) + ktlint (format checks) run as part of
// `build`/`check`, so CI's existing Gradle job enforces them.
detekt {
    config.setFrom(files("detekt.yml"))
    buildUponDefaultConfig = true
}
