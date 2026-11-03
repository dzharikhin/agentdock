@file:Suppress("UnstableApiUsage")

import org.jetbrains.intellij.platform.gradle.extensions.intellijPlatform
import java.io.File

pluginManagement {
    repositories {
        mavenCentral()
        gradlePluginPortal()
        maven("https://packages.jetbrains.team/maven/p/ij/intellij-dependencies/")
    }
    plugins {
        id("rpc") version "2.3.20-0.1"
        id("org.jetbrains.kotlin.jvm") version "2.3.20"
        id("org.jetbrains.kotlin.plugin.serialization") version "2.3.20"
    }
}

plugins {
    id("org.jetbrains.intellij.platform.settings") version "2.18.1"
    id("org.gradle.toolchains.foojay-resolver-convention") version "1.0.0"
}

rootProject.name = "agent-dock"

dependencyResolutionManagement {
    repositories {
        mavenCentral()
        intellijPlatform {
            defaultRepositories()
        }
        // See the matching block in build.gradle.kts: instrumentation modules synthesized
        // by `provisionSandboxIde` for restricted-network builds. Inert without .repo/m2.
        val sandboxRepoProp = providers.gradleProperty("sandboxRepoDir").getOrElse(".repo")
        val sandboxDir = File(sandboxRepoProp).let { if (it.isAbsolute) it else settingsDir.resolve(it) }
        val sandboxM2 = sandboxDir.resolve("m2")
        if (sandboxM2.resolve("com/jetbrains/intellij/java/java-compiler-ant-tasks").exists()) {
            exclusiveContent {
                forRepositories(maven(sandboxM2))
                filter {
                    includeModule("com.jetbrains.intellij.java", "java-compiler-ant-tasks")
                    includeModule("com.jetbrains.intellij.java", "java-gui-forms-compiler")
                    includeModule("com.jetbrains.intellij.java", "java-gui-forms-rt")
                    includeModule("com.jetbrains.intellij.java", "java-compiler-instrumentation-util")
                    includeModule("com.jetbrains.intellij.java", "java-compiler-instrumentation-util-java8")
                    includeModule("com.jetbrains.intellij.platform", "util-jdom")
                    includeModule("org.jetbrains.intellij.deps", "asm-all")
                }
            }
        }
    }
}

include("shared")
include("frontend")
include("backend")
include("backend-libraries")
include("frontend-terminal")
