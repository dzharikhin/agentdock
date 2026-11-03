import agentdock.sandbox.FlathubProvisioner
import agentdock.sandbox.ProvisionSandboxIdeTask
import org.jetbrains.intellij.platform.gradle.IntelliJPlatformType
import org.jetbrains.intellij.platform.gradle.tasks.InstrumentCodeTask
import org.jetbrains.intellij.platform.gradle.tasks.aware.SplitModeAware
import java.nio.file.Files
import java.nio.file.Paths

plugins {
    id("org.jetbrains.intellij.platform")
    id("org.jetbrains.kotlin.jvm")
    id("org.jetbrains.kotlin.plugin.serialization") apply false
    id("rpc") apply false
}

group = providers.gradleProperty("pluginGroup").get()
version = providers.gradleProperty("pluginVersion").get()

// IntelliJ Platform source selection (-PsandboxIde=...):
//   auto (default) - use .repo/idea when present, otherwise the JetBrains CDN
//   local          - require .repo/idea (fail with a hint if missing)
//   cdn            - always use the JetBrains CDN, ignore .repo/
// .repo/idea is provisioned purely in-JVM by the `provisionSandboxIde` task (or
// -PfetchSandboxIde=true at configuration time), pulling the official IDEA Ultimate
// flatpak from Flathub - for networks where JetBrains distribution CDNs are blocked
// (HTTP 451) or heavily throttled. Run bootstrap invocations with
// --no-configuration-cache when using -PfetchSandboxIde=true.
val sandboxRepoDir = providers.gradleProperty("sandboxRepoDir")
    .map { rootProject.file(it).toPath() }
    .getOrElse(rootProject.file(".repo").toPath())
val sandboxIdeDir = sandboxRepoDir.resolve("idea")
val sandboxMode = providers.gradleProperty("sandboxIde").getOrElse("auto").lowercase()
check(sandboxMode in setOf("auto", "local", "cdn")) { "sandboxIde must be one of: auto, local, cdn (got '$sandboxMode')" }
if (providers.gradleProperty("fetchSandboxIde").getOrElse("false").toBoolean() &&
    !Files.exists(sandboxIdeDir.resolve("product-info.json"))
) {
    FlathubProvisioner.provision(sandboxRepoDir) { println(it) }
}
val useSandboxIde = when (sandboxMode) {
    "local" -> {
        check(Files.exists(sandboxIdeDir.resolve("product-info.json"))) {
            "sandboxIde=local but $sandboxIdeDir is missing - bootstrap with ./gradlew provisionSandboxIde"
        }
        true
    }
    "auto" -> Files.exists(sandboxIdeDir.resolve("product-info.json"))
    else -> false
}

val provisionSandboxIde by tasks.registering(ProvisionSandboxIdeTask::class) {
    repoDir.set(sandboxRepoDir.toFile())
    group = "build setup"
    description = "Provisions .repo (IDE from Flathub + instrumentation m2 mirror) for restricted-network builds."
}

subprojects {
    group = rootProject.group
    version = rootProject.version
}

repositories {
    mavenCentral()
    intellijPlatform {
        defaultRepositories()
    }
    // Restricted-network environments: `provisionSandboxIde` synthesizes .repo/m2 with
    // exactly these five instrumentation modules (jars extracted from the Flathub IDE),
    // because they are not served by any reachable maven repository. When .repo/m2 is
    // absent this block is inert and everything resolves from official repositories
    // (intellij-repository, packages.jetbrains.team, Maven Central).
    val sandboxM2 = sandboxRepoDir.resolve("m2")
    if (Files.exists(sandboxM2.resolve("com/jetbrains/intellij/java/java-compiler-ant-tasks"))) {
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

dependencies {
    implementation("com.agentclientprotocol:acp:0.34.0") {
        exclude(group = "org.jetbrains.kotlin", module = "kotlin-stdlib")
        exclude(group = "org.jetbrains.kotlinx", module = "kotlinx-coroutines-bom")
        exclude(group = "org.jetbrains.kotlinx", module = "kotlinx-coroutines-core")
        exclude(group = "org.jetbrains.kotlinx", module = "kotlinx-coroutines-core-jvm")
        exclude(group = "org.jetbrains.kotlinx", module = "kotlinx-serialization-core")
        exclude(group = "org.jetbrains.kotlinx", module = "kotlinx-serialization-json")
    }
    implementation("io.github.java-diff-utils:java-diff-utils:4.15")

    intellijPlatform {
        if (useSandboxIde) {
            local(sandboxIdeDir)
            jetbrainsRuntimeLocal(sandboxIdeDir.resolve("jbr"))
        } else {
            intellijIdea("2026.2") {
                useInstaller = false
            }
            jetbrainsRuntime()
        }
        pluginModule(implementation(project(":shared")))
        pluginModule(implementation(project(":frontend")))
        pluginModule(implementation(project(":backend")))
        pluginModule(implementation(project(":backend-libraries")))
        pluginModule(implementation(project(":frontend-terminal")))
    }
}

kotlin {
    jvmToolchain(25)
}

sourceSets {
    main {
        resources {
            setSrcDirs(listOf("src/main/resources"))
            include("META-INF/plugin.xml")
            include("META-INF/pluginIcon.svg")
            include("META-INF/pluginIcon_dark.svg")
        }
    }
}

intellijPlatform {
    buildSearchableOptions = false
    splitMode = false
    pluginInstallationTarget = SplitModeAware.PluginInstallationTarget.BOTH

    pluginConfiguration {
        ideaVersion {
            sinceBuild = "262"
            untilBuild = provider { null }
        }
    }
    signing {
        privateKeyFile.set(layout.projectDirectory.file("signing/private.pem"))
        certificateChainFile.set(layout.projectDirectory.file("signing/chain.crt"))
    }
    pluginVerification {
        ides {
            create(IntelliJPlatformType.IntellijIdea, "2026.2")
        }
    }
}

val devMode = providers.gradleProperty("devMode").map { it.toBoolean() }.getOrElse(false)

tasks.register("generateBuildConfig") {
    description = "Generates the BuildConfig object with the dev mode flag and plugin version."
    val outputDir = layout.buildDirectory.dir("generated/buildConfig")
    val isDev = devMode
    val pluginVersion = project.version.toString()
    inputs.property("devMode", isDev)
    inputs.property("pluginVersion", pluginVersion)
    outputs.dir(outputDir)
    doLast {
        val file = outputDir.get().asFile.resolve("agentdock/BuildConfig.kt")
        file.parentFile.mkdirs()
        // Public rather than internal: both the frontend and the backend content module read it.
        file.writeText("package agentdock\n\nobject BuildConfig {\n    const val IS_DEV: Boolean = $isDev\n    const val PLUGIN_VERSION: String = \"$pluginVersion\"\n}\n")
    }
}

val npm = if (org.gradle.internal.os.OperatingSystem.current().isWindows) "npm.cmd" else "npm"

tasks.register<Exec>("npmCi") {
    description = "Installs frontend/node_modules from package-lock.json."
    workingDir = file("frontend")
    commandLine(npm, "ci", "--no-audit", "--no-fund")

    inputs.files("frontend/package.json", "frontend/package-lock.json")
    outputs.dir("frontend/node_modules")
}

tasks.register<Exec>("npmBuild") {
    description = "Builds the React UI into src/main/resources/webview."
    dependsOn("npmCi")
    workingDir = file("frontend")
    commandLine(npm, "run", "build")

    inputs.dir("frontend/src")
    inputs.files(
        "frontend/index.html",
        "frontend/package.json",
        "frontend/package-lock.json",
        "frontend/postcss.config.js",
        "frontend/tailwind.config.js",
        "frontend/tsconfig.json",
        "frontend/tsconfig.node.json",
        "frontend/vite.config.ts",
    )
    outputs.dir("src/main/resources/webview")
}

tasks.named<Delete>("clean") {
    delete(layout.projectDirectory.dir("src/main/resources/webview"))
}

// Ant's instrumentCode path treats Microsoft-built OpenJDKs as the ancient MS JVM and
// then requires <javaHome>/Packages to exist (see org.apache.tools.ant.types.Path
// addJavaRuntime()); create it once so instrumentation does not fail on such JDKs.
val ensureJdkAntCompat by tasks.registering {
    val javaHome = System.getProperty("java.home")
    onlyIf { System.getProperty("java.vendor", "").contains("Microsoft", ignoreCase = true) }
    outputs.upToDateWhen { Files.exists(Paths.get(javaHome, "Packages")) }
    doLast {
        Files.createDirectories(Paths.get(javaHome, "Packages"))
        logger.lifecycle("Created $javaHome/Packages (Microsoft JDK workaround for Ant instrumentCode)")
    }
}
tasks.withType<InstrumentCodeTask>().configureEach { dependsOn(ensureJdkAntCompat) }
subprojects {
    tasks.withType<InstrumentCodeTask>().configureEach { dependsOn(rootProject.tasks.named("ensureJdkAntCompat")) }
}
