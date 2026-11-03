package agentdock.sandbox

import java.io.ByteArrayInputStream
import java.io.InputStream
import java.io.OutputStream
import java.nio.file.FileVisitResult
import java.nio.file.Files
import java.nio.file.Path
import java.nio.file.Paths
import java.nio.file.SimpleFileVisitor
import java.nio.file.attribute.PosixFilePermissions
import java.nio.file.StandardCopyOption
import java.util.concurrent.Callable
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicLong
import java.util.zip.Inflater
import java.util.zip.InflaterInputStream

/**
 * Provisions the IntelliJ Platform build dependencies from Flathub for environments
 * where JetBrains distribution CDNs are blocked or throttled:
 *
 *   .repo/idea  - the IntelliJ IDEA Ultimate distribution (with bundled JBR), pulled
 *                 from the official flathub/com.jetbrains.IntelliJ-IDEA-Ultimate ostree
 *   .repo/m2    - a synthesized maven repository providing the code-instrumentation
 *                 toolchain (jars extracted from the IDE itself)
 *
 * Everything runs in-process on the JVM: no ostree CLI, no python, no shell.
 */
object FlathubProvisioner {
    const val REF = "app/com.jetbrains.IntelliJ-IDEA-Ultimate/x86_64/stable"
    private const val WORKERS = 12
    private const val IDE_SUBDIR = "files" // flatpak payload root; equals the IDE install root

    fun provision(repoDir: Path, log: (String) -> Unit = ::println) {
        val ideDir = repoDir.resolve("idea")
        if (Files.exists(ideDir.resolve("product-info.json"))) {
            // IDE present; re-synthesize the m2 mirror if it is missing or stale-marked
            val m2Dir = repoDir.resolve("m2")
            if (!Files.exists(m2Dir.resolve("com/jetbrains/intellij/java/java-compiler-ant-tasks/maven-metadata.xml"))) {
                synthesizeM2(ideDir, m2Dir, readBuildNumber(ideDir), log)
            }
            log("flathub: IDE already provisioned at $ideDir")
            return
        }
        val client = FlathubClient()
        val executor = Executors.newFixedThreadPool(WORKERS)
        try {
            val commit = client.refCommit(REF)
            log("flathub: ref $REF -> commit $commit")
            val commitBytes = client.withObject(commit, "commit") { it.readBytes() }
            val (rootTree, _) = GVariant.parseCommit(maybeInflate(commitBytes))
            val rootDirtree = parseDirtree(client, rootTree)
            val ideTree = rootDirtree.dirs.firstOrNull { it.name == IDE_SUBDIR }
                ?: throw IllegalStateException("flatpak payload dir '$IDE_SUBDIR' not found in $REF")
            log("flathub: walking tree (this downloads ~1.6 GB)...")

            // resumes are safe: files land via tmp+atomic-move, so an existing target is
            // complete; only never-started or failed objects are (re)fetched
            val workDir = repoDir.resolve(".idea.tmp")
            Files.createDirectories(workDir)

            val materialized = materializeTree(client, executor, ideTree.checksums[0], workDir, log)
            log("flathub: materialized $materialized files")

            val ideRoot = locateIdeRoot(workDir)
            deleteRecursively(ideDir)
            Files.createDirectories(ideDir.parent)
            Files.move(ideRoot, ideDir)
            deleteRecursively(workDir)

            val version = readBuildNumber(ideDir)
            log("flathub: IDEA $version installed at $ideDir")
            synthesizeM2(ideDir, repoDir.resolve("m2"), version, log)
            log("flathub: done")
        } finally {
            executor.shutdownNow()
        }
    }

    // ------------------------------------------------------------------ tree walk

    private class FileEnt(val path: String, val csum: String)

    private fun parseDirtree(client: FlathubClient, csum: String): GVariant.Dirtree =
        GVariant.parseDirtree(maybeInflate(client.withObject(csum, "dirtree") { it.readBytes() }))

    private fun materializeTree(
        client: FlathubClient,
        executor: ExecutorService,
        rootCsum: String,
        workDir: Path,
        log: (String) -> Unit,
    ): Long {
        // cache: dirtree csum -> (relative file entries, relative dir entries) so shared
        // subtrees are fetched once but materialized at every path that references them
        val cache = ConcurrentHashMap<String, Pair<List<Pair<String, String>>, List<Pair<String, String>>>>()
        val files = java.util.concurrent.ConcurrentLinkedQueue<FileEnt>()
        var queue = listOf("" to rootCsum)

        while (queue.isNotEmpty()) {
            val next = java.util.concurrent.ConcurrentLinkedQueue<Pair<String, String>>()
            val futures = queue.map { (prefix, csum) ->
                executor.submit(Callable {
                    val (relFiles, relDirs) = cache.computeIfAbsent(csum) {
                        try {
                            val dt = parseDirtree(client, csum)
                            dt.files.map { it.name to it.checksums[0] } to
                                dt.dirs.map { it.name to it.checksums[0] }
                        } catch (e: Exception) {
                            throw IllegalStateException("failed to parse dirtree ${csum.take(12)}... under '$prefix'", e)
                        }
                    }
                    relFiles.forEach { (name, fcsum) -> files.add(FileEnt("$prefix/$name", fcsum)) }
                    relDirs.forEach { (name, dcsum) -> next.add("$prefix/$name" to dcsum) }
                })
            }
            futures.forEach { it.get() }
            queue = next.toList()
        }

        // materialize files in parallel
        val done = AtomicLong()
        val bytes = AtomicLong()
        val failures = java.util.concurrent.ConcurrentLinkedQueue<Exception>()
        val jobs = files.map { ent ->
            executor.submit(Callable {
                try {
                    val target = resolveSafe(workDir, ent.path)
                    if (Files.exists(target)) {
                        done.incrementAndGet()
                        return@Callable
                    }
                    Files.createDirectories(target.parent)
                    val n = materializeFile(client, ent.csum, target)
                    val d = done.incrementAndGet()
                    val b = bytes.addAndGet(n)
                    if (d % 500 == 0L) {
                        log("flathub: $d files, ${b / 1_000_000} MB")
                    }
                } catch (e: Exception) {
                    failures.add(e)
                }
            })
        }
        jobs.forEach { it.get() }
        failures.firstOrNull()?.let { throw it }
        return done.get()
    }

    // ------------------------------------------------------------------ file objects

    /** Writes one file (following symlinks as symlinks); returns the inflated size. */
    private fun materializeFile(client: FlathubClient, csum: String, target: Path): Long {
        val tmp = target.resolveSibling("." + target.fileName + ".tmp")
        var inflated = 0L
        client.withObject(csum, "filez") { body ->
            val header = ByteArray(8 + 4)
            readFully(body, header, 0, 4)
            val l = beU32(header, 0)
            require(l in 26..1024) { "unexpected file object header length $l for ${target.fileName}" }
            val fullHeader = ByteArray(8 + l)
            System.arraycopy(header, 0, fullHeader, 0, 4)
            readFully(body, fullHeader, 4, 4 + l)
            val contentSize = beU32(fullHeader, 12).toLong().and(0xFFFFFFFFL)
            val mode = beU32(fullHeader, 24)
            inflated = contentSize
            when (mode and 0xF000) {
                0x8000 -> { // regular file: raw-deflate payload follows the header
                    val inflater = InflaterInputStream(body, Inflater(true), 1 shl 16)
                    Files.newOutputStream(tmp).use { out -> copyExactly(inflater, out, contentSize) }
                    inflater.close()
                    applyMode(tmp, mode)
                    Files.move(tmp, target, StandardCopyOption.REPLACE_EXISTING)
                }
                0xA000 -> { // symlink: no payload; the NUL-terminated target is inlined
                    // in the header at offset 32 (the header length L grows to fit it)
                    var end = 32
                    while (end < fullHeader.size && fullHeader[end].toInt() != 0) end++
                    check(end > 32) { "empty symlink target in ${csum.take(12)} for $target" }
                    val linkTarget = String(fullHeader, 32, end - 32, Charsets.UTF_8)
                    try {
                        Files.deleteIfExists(target)
                        Files.createSymbolicLink(target, Paths.get(linkTarget))
                    } catch (_: java.nio.file.FileAlreadyExistsException) {
                        // raced with a duplicate path; ignore
                    }
                }
                else -> throw IllegalStateException("unsupported file mode ${Integer.toOctalString(mode)} for $target")
            }
        }
        // contentSize is authoritative: copyExactly enforced it byte-for-byte
        return inflated
    }

    private fun applyMode(path: Path, mode: Int) {
        val exec = (mode and 0x49) != 0 // 0o111
        try {
            Files.setPosixFilePermissions(
                path,
                PosixFilePermissions.fromString(if (exec) "rwxr-xr-x" else "rw-r--r--"),
            )
        } catch (_: UnsupportedOperationException) {
            // non-posix filesystem; exec bits irrelevant there
        }
    }

    private fun copyExactly(input: InputStream, out: OutputStream, exact: Long) {
        val buf = ByteArray(1 shl 16)
        var copied = 0L
        while (copied < exact) {
            val want = minOf(buf.size.toLong(), exact - copied).toInt()
            val n = input.read(buf, 0, want)
            if (n < 0) throw java.io.EOFException("object body truncated at $copied/$exact")
            out.write(buf, 0, n)
            copied += n
        }
    }

    private fun readFully(input: InputStream, buf: ByteArray, off: Int, len: Int) {
        var got = 0
        while (got < len) {
            val n = input.read(buf, off + got, len - got)
            if (n < 0) throw java.io.EOFException("truncated read ($got/$len)")
            got += n
        }
    }

    private fun beU32(buf: ByteArray, off: Int): Int =
        ((buf[off].toInt() and 0xFF) shl 24) or ((buf[off + 1].toInt() and 0xFF) shl 16) or
            ((buf[off + 2].toInt() and 0xFF) shl 8) or (buf[off + 3].toInt() and 0xFF)

    private fun maybeInflate(bytes: ByteArray): ByteArray {
        if (bytes.isEmpty() || bytes[0].toInt() != 0x78) return bytes
        // the magic byte alone is not proof of zlib: an uncompressed GVariant may start
        // with 0x78 by chance, so fall back to the raw bytes when inflation rejects it
        return try {
            java.util.zip.InflaterInputStream(ByteArrayInputStream(bytes)).readBytes()
        } catch (_: Exception) {
            bytes
        }
    }

    private fun resolveSafe(root: Path, relative: String): Path {
        val p = root.resolve(relative.drop(1)).normalize()
        require(p.startsWith(root)) { "unsafe path in tree: $relative" }
        return p
    }

    private fun locateIdeRoot(workDir: Path): Path =
        FileWalker.findFirst(workDir, "product-info.json", 3)?.parent
            ?: throw IllegalStateException("product-info.json not found in flathub payload")

    private fun readBuildNumber(ideDir: Path): String {
        val json = Files.readString(ideDir.resolve("product-info.json"))
        val m = Regex(""""buildNumber"\s*:\s*"([^"]+)"""").find(json)
            ?: throw IllegalStateException("buildNumber missing from product-info.json")
        return m.groupValues[1]
    }

    // ------------------------------------------------------------------ m2 synthesis

    /**
     * Instrumentation toolchain shipped inside the IDE. The five java-compiler modules
     * and asm-all are copied verbatim; util-jdom is extracted from lib/util-8.jar.
     * Synthesizing these makes the fallback build independent of the (throttled or
     * geo-blocked) JetBrains distribution CDNs; only Maven Central remains external.
     */
    private val TOOLCHAIN = listOf(
        Triple("com.jetbrains.intellij.java", "java-compiler-ant-tasks", "plugins/java/lib/intellij.java.compiler.antTasks.jar"),
        Triple("com.jetbrains.intellij.java", "java-gui-forms-compiler", "plugins/java/lib/intellij.java.guiForms.compiler.jar"),
        Triple("com.jetbrains.intellij.java", "java-gui-forms-rt", "lib/forms_rt.jar"),
        Triple("com.jetbrains.intellij.java", "java-compiler-instrumentation-util", "plugins/java/lib/intellij.java.compiler.instrumentationUtil.jar"),
        Triple("com.jetbrains.intellij.java", "java-compiler-instrumentation-util-java8", "plugins/java/lib/intellij.java.compiler.instrumentationUtil.java8.jar"),
        Triple("org.jetbrains.intellij.deps", "asm-all", "lib/intellij.libraries.asm.jar"),
        // util-jdom has no jar of its own: extracted from util-8.jar in synthesizeM2
        Triple("com.jetbrains.intellij.platform", "util-jdom", "lib/util-8.jar"),
    )

    private fun synthesizeM2(ideDir: Path, m2Dir: Path, version: String, log: (String) -> Unit) {
        deleteRecursively(m2Dir)
        for ((group, artifact, jarPath) in TOOLCHAIN) {
            val src = ideDir.resolve(jarPath)
            require(Files.exists(src)) { "instrumentation jar missing from IDE: $jarPath" }
            val artifactDir = m2Dir.resolve(group.replace('.', '/')).resolve(artifact)
            val moduleDir = artifactDir.resolve(version)
            Files.createDirectories(moduleDir)
            if (artifact == "util-jdom") {
                extractJarSubset(src, moduleDir.resolve("$artifact-$version.jar"), "org/jdom/")
            } else {
                Files.copy(src, moduleDir.resolve("$artifact-$version.jar"), StandardCopyOption.REPLACE_EXISTING)
            }
            Files.writeString(moduleDir.resolve("$artifact-$version.pom"), pom(group, artifact, version))
            // Gradle resolves the plugin's [262,<build>] version range against this
            Files.writeString(artifactDir.resolve("maven-metadata.xml"), mavenMetadata(group, artifact, version))
        }
        log("flathub: synthesized m2 mirror for ${TOOLCHAIN.size} instrumentation modules (version $version)")
    }

    private fun mavenMetadata(group: String, artifact: String, version: String): String =
        """<?xml version="1.0" encoding="UTF-8"?>
<metadata>
  <groupId>$group</groupId>
  <artifactId>$artifact</artifactId>
  <versioning>
    <latest>$version</latest>
    <release>$version</release>
    <versions>
      <version>$version</version>
    </versions>
  </versioning>
</metadata>
"""

    /** Copies all entries under [prefix] of [src] into a new jar at [dest]. */
    private fun extractJarSubset(src: Path, dest: Path, prefix: String) {
        java.util.zip.ZipFile(src.toFile()).use { zip ->
            java.util.zip.ZipOutputStream(Files.newOutputStream(dest)).use { out ->
                val entries = zip.entries()
                while (entries.hasMoreElements()) {
                    val e = entries.nextElement()
                    if (!e.isDirectory && e.name.startsWith(prefix)) {
                        out.putNextEntry(java.util.zip.ZipEntry(e.name))
                        zip.getInputStream(e).use { it.copyTo(out) }
                        out.closeEntry()
                    }
                }
            }
        }
    }

    private fun pom(group: String, artifact: String, version: String): String {
        val deps = when (artifact) {
            "java-compiler-ant-tasks" -> listOf(
                dep(group, "java-gui-forms-compiler", version, runtime = true),
                dep(group, "java-gui-forms-rt", version, runtime = true),
                dep("org.jetbrains.intellij.deps", "asm-all", version, exclusions = true),
                dep(group, "java-compiler-instrumentation-util", version, runtime = true),
                dep(group, "java-compiler-instrumentation-util-java8", version, runtime = true),
            )
            "java-gui-forms-compiler" -> listOf(
                dep("com.jetbrains.intellij.platform", "util-jdom", version, runtime = true),
                dep(group, "java-gui-forms-rt", version, runtime = true),
                dep("org.jetbrains.intellij.deps", "asm-all", version, exclusions = true),
                dep("com.jgoodies", "forms", "1.1-preview"),
                dep(group, "java-compiler-instrumentation-util", version),
                dep("org.jetbrains", "annotations", "26.0.2", runtime = true),
            )
            "java-gui-forms-rt", "asm-all", "util-jdom" -> emptyList()
            "java-compiler-instrumentation-util" -> listOf(
                dep("org.jetbrains.intellij.deps", "asm-all", version, exclusions = true),
            )
            "java-compiler-instrumentation-util-java8" -> listOf(
                dep(group, "java-compiler-instrumentation-util", version, runtime = true),
            )
            else -> throw IllegalArgumentException(artifact)
        }
        val body = StringBuilder()
        for ((g, a, v, runtime, exclusions) in deps) {
            body.append("    <dependency>\n      <groupId>$g</groupId>\n      <artifactId>$a</artifactId>\n      <version>$v</version>\n")
            if (runtime) body.append("      <scope>runtime</scope>\n")
            if (exclusions) {
                body.append("      <exclusions>\n        <exclusion>\n          <groupId>*</groupId>\n          <artifactId>*</artifactId>\n        </exclusion>\n      </exclusions>\n")
            }
            body.append("    </dependency>\n")
        }
        return """<?xml version="1.0" encoding="UTF-8"?>
<project xmlns="http://maven.apache.org/POM/4.0.0">
  <modelVersion>4.0.0</modelVersion>
  <groupId>$group</groupId>
  <artifactId>$artifact</artifactId>
  <version>$version</version>
  <packaging>jar</packaging>
  <dependencies>
$body  </dependencies>
</project>
"""
    }

    private data class Dep(
        val group: String,
        val artifact: String,
        val version: String,
        val runtime: Boolean = false,
        val exclusions: Boolean = false,
    )

    private fun dep(g: String, a: String, v: String, runtime: Boolean = false, exclusions: Boolean = false) =
        Dep(g, a, v, runtime, exclusions)

    // ------------------------------------------------------------------ fs helpers

    private object FileWalker {
        fun findFirst(root: Path, fileName: String, maxDepth: Int): Path? =
            Files.walk(root, maxDepth).use { s ->
                s.filter { it.fileName.toString() == fileName }.findFirst().orElse(null)
            }
    }

    private fun deleteRecursively(dir: Path) {
        if (!Files.exists(dir)) return
        Files.walkFileTree(dir, object : SimpleFileVisitor<Path>() {
            override fun visitFile(file: Path, attrs: java.nio.file.attribute.BasicFileAttributes): FileVisitResult {
                Files.deleteIfExists(file)
                return FileVisitResult.CONTINUE
            }

            override fun postVisitDirectory(d: Path, e: java.io.IOException?): FileVisitResult {
                Files.deleteIfExists(d)
                return FileVisitResult.CONTINUE
            }
        })
    }
}
