@file:Suppress("UnstableApiUsage")

import org.jetbrains.intellij.platform.gradle.extensions.intellijPlatform

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

// ---------------------------------------------------------------------------
// .repo provisioning: makes `git clone && ./gradlew buildPlugin` self-contained.
//
// .repo/idea  local IDE (OpenIDE build tracking IntelliJ IDEA 2026.2.3)
// .repo/m2    local Maven mirror of the code-instrumentation jars,
//             synthesized from jars shipped inside the IDE distribution
// .repo/node  Node.js for the webview build (only when npm is not on PATH)
//
// OpenIDE comes from download.openide.ru: plain fast HTTP that works where
// JetBrains CDNs are blocked (HTTP 451) or throttled. Skip provisioning with
// -Popenide.provision=false to build against the official IntelliJ IDEA
// distribution instead (requires access to JetBrains CDN).
// ---------------------------------------------------------------------------

val repoDir: java.nio.file.Path = rootDir.toPath().resolve(".repo")

// Read (but do not require) the provisioning marker so the configuration cache
// is invalidated when .repo/idea appears or disappears.
providers.fileContents(layout.settingsDirectory.file(".repo/idea/product-info.json"))
    .asText
    .orElse("")
    .get()

fun deleteRecursively(path: java.nio.file.Path) {
    if (!java.nio.file.Files.exists(path)) return
    java.nio.file.Files.walk(path).use { stream ->
        stream.sorted(java.util.Comparator.reverseOrder<java.nio.file.Path>()).forEach {
            java.nio.file.Files.deleteIfExists(it)
        }
    }
}

fun digestHex(algorithm: String, path: java.nio.file.Path): String {
    val md = java.security.MessageDigest.getInstance(algorithm)
    java.nio.file.Files.newInputStream(path).use { input ->
        val buf = ByteArray(1 shl 16)
        while (true) {
            val n = input.read(buf)
            if (n < 0) break
            md.update(buf, 0, n)
        }
    }
    return md.digest().joinToString("") { "%02x".format(it) }
}

fun httpGet(url: String, timeoutMinutes: Long): java.net.http.HttpResponse<java.io.InputStream> {
    val http = java.net.http.HttpClient.newBuilder()
        .followRedirects(java.net.http.HttpClient.Redirect.NORMAL)
        .connectTimeout(java.time.Duration.ofSeconds(30))
        .build()
    return http.send(
        java.net.http.HttpRequest.newBuilder(java.net.URI(url)).GET()
            .timeout(java.time.Duration.ofMinutes(timeoutMinutes)).build(),
        java.net.http.HttpResponse.BodyHandlers.ofInputStream(),
    )
}

fun fetchText(url: String, attempts: Int = 5): String {
    var last: Exception? = null
    repeat(attempts) { attempt ->
        try {
            val resp = httpGet(url, 1)
            check(resp.statusCode() == 200) { "HTTP ${resp.statusCode()} for $url" }
            return resp.body().use { it.bufferedReader().readText() }
        } catch (e: Exception) {
            last = e
            Thread.sleep(500L * (attempt + 1))
        }
    }
    throw IllegalStateException("failed to fetch $url", last)
}

fun downloadFile(url: String, dest: java.nio.file.Path, expectedSha256: String) {
    if (java.nio.file.Files.exists(dest) && digestHex("SHA-256", dest) == expectedSha256) return
    val tmp = dest.resolveSibling(dest.fileName.toString() + ".tmp")
    java.nio.file.Files.createDirectories(dest.parent)
    var last: Exception? = null
    repeat(3) { attempt ->
        try {
            val resp = httpGet(url, 60)
            check(resp.statusCode() == 200) { "HTTP ${resp.statusCode()} for $url" }
            resp.body().use { body ->
                java.nio.file.Files.newOutputStream(tmp).use { out ->
                    val buf = ByteArray(1 shl 16)
                    var total = 0L
                    var lastLog = 0L
                    val t0 = System.nanoTime()
                    while (true) {
                        val n = body.read(buf)
                        if (n < 0) break
                        out.write(buf, 0, n)
                        total += n
                        if (total - lastLog >= 256L shl 20) {
                            lastLog = total
                            println("provision: ${total shr 20} MB downloaded")
                        }
                    }
                    println("provision: ${total shr 20} MB in ${(System.nanoTime() - t0) / 1_000_000_000}s")
                }
            }
            val actual = digestHex("SHA-256", tmp)
            check(actual == expectedSha256) { "sha256 mismatch for $dest: $actual != $expectedSha256" }
            java.nio.file.Files.move(tmp, dest, java.nio.file.StandardCopyOption.REPLACE_EXISTING)
            last = null
            return
        } catch (e: Exception) {
            last = e
            println("provision: download attempt ${attempt + 1} failed: $e")
        }
    }
    throw IllegalStateException("failed to download $url", last)
}

// ------------------------------------------------------------- tar (ustar/GNU)

/** Extracts a gzip-compressed tar into targetDir (files, dirs, symlinks, hardlinks, long names). */
fun extractTarGz(archive: java.nio.file.Path, targetDir: java.nio.file.Path): Int {
    var entries = 0
    java.nio.file.Files.newInputStream(archive).use { fis ->
        java.util.zip.GZIPInputStream(fis, 1 shl 20).use { input ->
            val header = ByteArray(512)
            var pendingLongName: String? = null
            var pendingLongLink: String? = null
            while (true) {
                if (!readBlock(input, header)) break
                if (header.all { it.toInt() == 0 }) break // end-of-archive
                var name = pendingLongName ?: tarString(header, 0, 100)
                val linkName = pendingLongLink ?: tarString(header, 157, 100)
                pendingLongName = null
                pendingLongLink = null
                val prefix = tarString(header, 345, 155)
                if (prefix.isNotEmpty()) name = "$prefix/$name"
                val size = tarOctal(header, 124, 12)
                val type = header[100].toInt().toChar()
                val mode = tarOctal(header, 100, 8)
                val path = targetDir.resolve(name).normalize()
                require(path.startsWith(targetDir)) { "unsafe tar entry: $name" }
                when (type) {
                    'L' -> pendingLongName = readTarString(input, size)
                    'K' -> pendingLongLink = readTarString(input, size)
                    '5' -> java.nio.file.Files.createDirectories(path)
                    '2' -> { // symlink
                        java.nio.file.Files.createDirectories(path.parent)
                        try {
                            java.nio.file.Files.deleteIfExists(path)
                            java.nio.file.Files.createSymbolicLink(path, java.nio.file.Paths.get(linkName))
                        } catch (_: java.nio.file.FileAlreadyExistsException) {
                        } catch (_: UnsupportedOperationException) {
                        } catch (_: java.security.PrivilegedActionException) {
                        }
                        entries++
                    }
                    '0', 0.toChar(), '7' -> {
                        java.nio.file.Files.createDirectories(path.parent)
                        val tmp = path.resolveSibling("." + path.fileName + ".tmp")
                        java.nio.file.Files.newOutputStream(tmp).use { out -> copyExactly(input, out, size) }
                        applyTarMode(tmp, mode)
                        java.nio.file.Files.move(tmp, path, java.nio.file.StandardCopyOption.REPLACE_EXISTING)
                        entries++
                    }
                    '1' -> { // hardlink: copy the referenced file (earlier entry)
                        val src = targetDir.resolve(linkName).normalize()
                        if (java.nio.file.Files.exists(src)) {
                            java.nio.file.Files.createDirectories(path.parent)
                            java.nio.file.Files.copy(src, path, java.nio.file.StandardCopyOption.REPLACE_EXISTING)
                            entries++
                        }
                    }
                    else -> skipExactly(input, size) // pax headers, etc.
                }
            }
        }
    }
    return entries
}

private fun applyTarMode(path: java.nio.file.Path, mode: Int) {
    val exec = (mode and 0x49) != 0 // 0o111
    try {
        java.nio.file.Files.setPosixFilePermissions(
            path,
            java.nio.file.attribute.PosixFilePermissions.fromString(if (exec) "rwxr-xr-x" else "rw-r--r--"),
        )
    } catch (_: UnsupportedOperationException) {
    }
}

private fun tarString(b: ByteArray, off: Int, len: Int): String {
    var end = off
    while (end < off + len && b[end].toInt() != 0) end++
    return String(b, off, end - off, Charsets.UTF_8)
}

private fun tarOctal(b: ByteArray, off: Int, len: Int): Int {
    var v = 0
    for (i in off until off + len) {
        val c = b[i].toInt()
        if (c == 0 || c == ' '.code) break
        if (c in '0'.code..'7'.code) v = v * 8 + (c - '0'.code)
    }
    return v
}

private fun readBlock(input: java.io.InputStream, buf: ByteArray): Boolean {
    var got = 0
    while (got < buf.size) {
        val n = input.read(buf, got, buf.size - got)
        if (n < 0) return false
        got += n
    }
    return true
}

private fun readTarString(input: java.io.InputStream, len: Int): String {
    val b = ByteArray(len)
    var got = 0
    while (got < len) {
        val n = input.read(b, got, len - got)
        if (n < 0) throw java.io.EOFException("truncated long-name entry")
        got += n
    }
    skipExactly(input, (512 - len % 512) % 512)
    var end = 0
    while (end < len && b[end].toInt() != 0) end++
    return String(b, 0, end, Charsets.UTF_8)
}

private fun copyExactly(input: java.io.InputStream, out: java.io.OutputStream, exact: Int) {
    val buf = ByteArray(1 shl 16)
    var copied = 0
    while (copied < exact) {
        val want = minOf(buf.size, exact - copied)
        val n = input.read(buf, 0, want)
        if (n < 0) throw java.io.EOFException("tar entry truncated at $copied/$exact")
        out.write(buf, 0, n)
        copied += n
    }
    skipExactly(input, (512 - exact % 512) % 512)
}

private fun skipExactly(input: java.io.InputStream, count: Int) {
    var skipped = 0
    val buf = ByteArray(1 shl 16)
    while (skipped < count) {
        val n = input.read(buf, 0, minOf(buf.size, count - skipped))
        if (n < 0) throw java.io.EOFException("tar padding truncated")
        skipped += n
    }
}

// ------------------------------------------------------------- OpenIDE + m2

fun readBuildNumber(ideDir: java.nio.file.Path): String {
    val json = java.nio.file.Files.readString(ideDir.resolve("product-info.json"))
    return Regex("\"buildNumber\"\\s*:\\s*\"([^\"]+)\"").find(json)?.groupValues?.get(1)
        ?: throw IllegalStateException("buildNumber not found in ${ideDir.resolve("product-info.json")}")
}

fun pomXml(group: String, artifact: String, version: String) =
    """<?xml version="1.0" encoding="UTF-8"?>
<project xmlns="http://maven.apache.org/POM/4.0.0">
    <modelVersion>4.0.0</modelVersion>
    <groupId>$group</groupId>
    <artifactId>$artifact</artifactId>
    <version>$version</version>
</project>
"""

fun metadataXml(group: String, artifact: String, version: String) =
    """<?xml version="1.0" encoding="UTF-8"?>
<metadata>
    <groupId>$group</groupId>
    <artifactId>$artifact</artifactId>
    <versioning>
        <versions>
            <version>$version</version>
        </versions>
    </versioning>
</metadata>
"""

/** Synthesizes the local Maven mirror from jars shipped inside the IDE distribution. */
fun synthesizeM2(ideDir: java.nio.file.Path, m2Dir: java.nio.file.Path, version: String) {
    val deps = listOf(
        Triple("com.jetbrains.intellij.java", "java-compiler-ant-tasks", version) to "plugins/java/lib/intellij.java.compiler.antTasks.jar",
        Triple("com.jetbrains.intellij.java", "java-gui-forms-compiler", version) to "plugins/java/lib/intellij.java.guiForms.compiler.jar",
        Triple("com.jetbrains.intellij.java", "java-compiler-instrumentation-util", version) to "plugins/java/lib/intellij.java.compiler.instrumentationUtil.jar",
        Triple("com.jetbrains.intellij.java", "java-compiler-instrumentation-util-java8", version) to "plugins/java/lib/intellij.java.compiler.instrumentationUtil.java8.jar",
        Triple("com.jetbrains.intellij.java", "java-gui-forms-rt", version) to "lib/forms_rt.jar",
        Triple("com.jetbrains.intellij.platform", "util-jdom", version) to "lib/util-8.jar",
        Triple("org.jetbrains.intellij.deps", "asm-all", "9.6.1") to "lib/intellij.libraries.asm.jar",
        Triple("com.jgoodies", "forms", "1.1-preview") to "lib/intellij.libraries.jgoodies.forms.jar",
    )
    for ((coord, src) in deps) {
        val (group, artifact, ver) = coord
        val srcPath = ideDir.resolve(src)
        check(java.nio.file.Files.exists(srcPath)) { "cannot synthesize $group:$artifact: $src missing from IDE distribution" }
        val artifactDir = m2Dir.resolve(group.replace('.', '/')).resolve(artifact)
        val dir = artifactDir.resolve(ver)
        java.nio.file.Files.createDirectories(dir)
        val jar = dir.resolve("$artifact-$ver.jar")
        java.nio.file.Files.copy(srcPath, jar, java.nio.file.StandardCopyOption.REPLACE_EXISTING)
        val pom = dir.resolve("$artifact-$ver.pom")
        java.nio.file.Files.writeString(pom, pomXml(group, artifact, ver))
        java.nio.file.Files.writeString(jar.resolveSibling(jar.fileName.toString() + ".sha1"), digestHex("SHA-1", jar))
        java.nio.file.Files.writeString(pom.resolveSibling(pom.fileName.toString() + ".sha1"), digestHex("SHA-1", pom))
        val metadata = artifactDir.resolve("maven-metadata.xml")
        java.nio.file.Files.writeString(metadata, metadataXml(group, artifact, ver))
        java.nio.file.Files.writeString(metadata.resolveSibling("maven-metadata.xml.sha1"), digestHex("SHA-1", metadata))
    }
}

fun provisionOpenIde() {
    // OpenIDE build tracking IntelliJ IDEA 2026.2.3 (platform 262.10968.63)
    val build = "262.10968.63.2"
    val base = "https://download.openide.ru"
    val url = "$base/$build/openIDE-$build.tar.gz"

    val archive = repoDir.resolve("openide-$build.tar.gz")
    downloadFile(url, archive, fetchText("$url.sha256").substringBefore(' ').trim().lowercase())

    val ideDir = repoDir.resolve("idea")
    val workDir = repoDir.resolve(".idea.tmp")
    deleteRecursively(workDir)
    java.nio.file.Files.createDirectories(workDir)
    println("provision: extracting OpenIDE...")
    val entries = extractTarGz(archive, workDir)

    val ideRoot = java.nio.file.Files.walk(workDir, 3).use { s ->
        s.filter { it.fileName.toString() == "product-info.json" }.findFirst().orElse(null)?.parent
    } ?: throw IllegalStateException("product-info.json not found in OpenIDE tarball")
    check(java.nio.file.Files.exists(ideRoot.resolve("jbr/bin/java"))) {
        "OpenIDE tarball does not bundle a JBR - cannot use it as the build IDE"
    }
    deleteRecursively(ideDir)
    java.nio.file.Files.createDirectories(ideDir.parent)
    java.nio.file.Files.move(ideRoot, ideDir)
    deleteRecursively(workDir)
    java.nio.file.Files.deleteIfExists(archive)

    val version = readBuildNumber(ideDir)
    println("provision: OpenIDE $version installed at $ideDir ($entries tar entries)")
    synthesizeM2(ideDir, repoDir.resolve("m2"), version)
    println("provision: local m2 mirror synthesized at ${repoDir.resolve("m2")}")
}

fun systemNpmAvailable(): Boolean {
    val name = if (org.gradle.internal.os.OperatingSystem.current().isWindows) "npm.cmd" else "npm"
    return (System.getenv("PATH") ?: "")
        .split(java.io.File.pathSeparatorChar)
        .any { java.io.File(it, name).canExecute() }
}

fun provisionNode() {
    if (org.gradle.internal.os.OperatingSystem.current().isWindows) return
    val os = if (org.gradle.internal.os.OperatingSystem.current().isMacOsX) "darwin" else "linux"
    val arch = if (System.getProperty("os.arch") in setOf("aarch64", "arm64")) "arm64" else "x64"
    val version = "22.20.0"
    val dir = repoDir.resolve("node")
    if (java.nio.file.Files.exists(dir.resolve("bin/node"))) return

    val name = "node-v$version-$os-$arch"
    val url = "https://nodejs.org/dist/v$version/$name.tar.gz"
    println("provision: downloading Node.js v$version from $url")
    val archive = repoDir.resolve("$name.tar.gz")
    val expected = fetchText("https://nodejs.org/dist/v$version/SHASUMS256.txt")
        .lineSequence()
        .firstOrNull { it.endsWith(" $name.tar.gz") }
        ?.substringBefore(' ')?.trim()?.lowercase()
        ?: throw IllegalStateException("$name.tar.gz not found in SHASUMS256.txt")
    downloadFile(url, archive, expected)

    val work = repoDir.resolve(".node.tmp")
    deleteRecursively(work)
    java.nio.file.Files.createDirectories(work)
    extractTarGz(archive, work)
    java.nio.file.Files.deleteIfExists(archive)
    deleteRecursively(dir)
    java.nio.file.Files.createDirectories(dir.parent)
    java.nio.file.Files.move(work.resolve(name), dir)
    deleteRecursively(work)
    println("provision: Node.js installed at $dir")
}

val provisioningDisabled = providers.gradleProperty("openide.provision")
    .map { it.trim().equals("false", ignoreCase = true) }
    .getOrElse(false)

// An explicit absolute openide.home that already exists means the user manages
// the IDE distribution themselves - do not download another one.
val explicitIdeHome = providers.gradleProperty("openide.home")
    .orElse(providers.environmentVariable("OPENIDE_HOME"))
    .orNull?.trim()
val userManagedIde = !explicitIdeHome.isNullOrBlank() &&
    java.io.File(explicitIdeHome).isAbsolute &&
    java.io.File(explicitIdeHome).isDirectory

if (!provisioningDisabled && !userManagedIde) {
    if (!repoDir.resolve("idea/product-info.json").toFile().isFile) {
        provisionOpenIde()
    } else if (!repoDir.resolve("m2").toFile().isDirectory) {
        // IDE present but the instrumentation mirror is missing - heal it.
        val ideDir = repoDir.resolve("idea")
        synthesizeM2(ideDir, repoDir.resolve("m2"), readBuildNumber(ideDir))
        println("provision: local m2 mirror synthesized at ${repoDir.resolve("m2")}")
    }
}
if (!systemNpmAvailable()) {
    provisionNode()
}

// Ant's Path.addJavaRuntime() treats any "Microsoft" java.vendor as the ancient
// MS JVM layout and scans <java.home>/Packages; with Microsoft OpenJDK builds
// that directory is absent and code instrumentation fails. An empty one is inert.
if (System.getProperty("java.vendor", "").lowercase().contains("microsoft")) {
    val packagesDir = java.nio.file.Paths.get(System.getProperty("java.home"), "Packages")
    try {
        java.nio.file.Files.createDirectories(packagesDir)
    } catch (e: Exception) {
        println("provision: could not create $packagesDir (required by Ant with Microsoft OpenJDK): ${e.message}")
    }
}

dependencyResolutionManagement {
    repositories {
        if (rootDir.resolve(".repo/m2").isDirectory) {
            maven(rootDir.resolve(".repo/m2"))
            mavenCentral()
            maven("https://packages.jetbrains.team/maven/p/ij/intellij-dependencies/")
            intellijPlatform {
                localPlatformArtifacts()
            }
        } else {
            mavenCentral()
            intellijPlatform {
                defaultRepositories()
            }
        }
    }
}

include("shared")
include("frontend")
include("backend")
include("backend-libraries")
include("frontend-terminal")
