package agentdock.acp

import com.intellij.util.EnvironmentUtil
import java.io.File

internal object AcpProcessEnvironment {
    fun baseEnvironment(): Map<String, String> =
        mergedBaseEnvironment(
            current = System.getenv(),
            shell = EnvironmentUtil.getEnvironmentMap()
        )

    fun withPrependedPathEntries(extraEntries: List<File>): Map<String, String> =
        withPrependedPathEntries(baseEnvironment(), extraEntries)

    fun applyTo(builder: ProcessBuilder, extraPathEntries: List<File> = emptyList()) {
        val environment = builder.environment()
        val base = baseEnvironment()
        val merged = withPrependedPathEntries(
            source = environment,
            extraEntries = extraPathEntries,
            fallbackPath = base[pathKey(base)].orEmpty()
        )
        environment.putAll(merged)
    }

    internal fun enrichedEnvironment(
        source: Map<String, String>,
        commonExecutableDirs: List<File> = commonExecutableDirectories()
    ): Map<String, String> {
        return enrichedEnvironment(
            source = source,
            suffixPath = "",
            commonExecutableDirs = commonExecutableDirs
        )
    }

    internal fun mergedBaseEnvironment(
        current: Map<String, String>,
        shell: Map<String, String>,
        commonExecutableDirs: List<File> = commonExecutableDirectories()
    ): Map<String, String> {
        val env = current.toMutableMap()
        shell.forEach { (key, value) ->
            if (value.isNotBlank() && env.keys.none { it.equals(key, ignoreCase = true) }) {
                env[key] = value
            }
        }
        val shellPath = shell[pathKey(shell)].orEmpty()
        return enrichedEnvironment(
            source = env,
            suffixPath = shellPath,
            commonExecutableDirs = commonExecutableDirs
        )
    }

    private fun enrichedEnvironment(
        source: Map<String, String>,
        suffixPath: String,
        commonExecutableDirs: List<File>
    ): Map<String, String> {
        val env = source.toMutableMap()
        val key = pathKey(env)
        val merged = mergedPath(
            prefixEntries = emptyList(),
            existingPath = env[key].orEmpty(),
            suffixPath = suffixPath,
            suffixEntries = commonExecutableDirs
        )
        if (merged.isNotBlank()) {
            env[key] = merged
        }
        return env
    }

    internal fun withPrependedPathEntries(
        source: Map<String, String>,
        extraEntries: List<File>
    ): Map<String, String> =
        withPrependedPathEntries(source, extraEntries, fallbackPath = "")

    private fun withPrependedPathEntries(
        source: Map<String, String>,
        extraEntries: List<File>,
        fallbackPath: String
    ): Map<String, String> {
        val env = source.toMutableMap()
        val key = pathKey(env)
        val merged = mergedPath(
            prefixEntries = extraEntries,
            existingPath = env[key].orEmpty(),
            suffixPath = fallbackPath,
            suffixEntries = emptyList()
        )
        if (merged.isNotBlank()) {
            env[key] = merged
        }
        return env
    }

    internal fun pathKey(env: Map<String, String>): String =
        env.keys.firstOrNull { it.equals("PATH", ignoreCase = true) } ?: "PATH"

    internal fun mergedPath(
        prefixEntries: List<File>,
        existingPath: String,
        suffixPath: String = "",
        suffixEntries: List<File>
    ): String {
        val entries = mutableListOf<String>()

        fun addEntry(path: String) {
            val trimmed = path.trim()
            if (trimmed.isNotBlank()) entries += trimmed
        }

        prefixEntries
            .filter { it.isDirectory }
            .forEach { addEntry(it.absolutePath) }

        existingPath
            .split(File.pathSeparator)
            .forEach(::addEntry)

        suffixPath
            .split(File.pathSeparator)
            .forEach(::addEntry)

        suffixEntries
            .filter { it.isDirectory }
            .forEach { addEntry(it.absolutePath) }

        val seen = linkedSetOf<String>()
        return entries
            .filter { seen.add(normalizePathEntry(it)) }
            .joinToString(File.pathSeparator)
    }

    private fun commonExecutableDirectories(): List<File> {
        if (AcpExecutionMode.isWindowsHost()) return emptyList()
        val home = System.getProperty("user.home")?.takeIf { it.isNotBlank() }
        return buildList {
            home?.let {
                add(File(it, ".local/bin"))
                add(File(it, ".docker/bin"))
            }
            add(File("/opt/homebrew/bin"))
            add(File("/usr/local/bin"))
            add(File("/usr/bin"))
            add(File("/bin"))
            add(File("/usr/sbin"))
            add(File("/sbin"))
            add(File("/Applications/Docker.app/Contents/Resources/bin"))
        }
    }

    private fun normalizePathEntry(path: String): String =
        File(path).absoluteFile.normalize().path
}
