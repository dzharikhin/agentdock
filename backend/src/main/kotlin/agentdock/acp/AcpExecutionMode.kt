package agentdock.acp

import com.intellij.execution.configurations.GeneralCommandLine
import java.io.File
import java.util.concurrent.TimeUnit
import kotlin.time.Duration
import kotlin.time.Duration.Companion.seconds

internal fun quoteUnixShellArg(value: String): String =
    "'" + value.replace("'", "'\"'\"'") + "'"

internal data class CommandResult(
    val exitCode: Int,
    val stdout: String,
    val stderr: String,
    val timedOut: Boolean
)

internal object AcpExecutionMode {

    fun isWindowsHost(): Boolean = hostPlatform() == "windows"

    fun hostPlatform(): String {
        val os = System.getProperty("os.name").lowercase()
        return when {
            os.contains("win") -> "windows"
            os.contains("mac") -> "macos"
            else -> "linux"
        }
    }

    /**
     * Runs a short-lived command to completion. On timeout or thread interruption the whole process
     * tree is killed; start failures and interruptions propagate to the caller. [closeStdin] = false
     * leaves stdin open for commands that treat end of input as a request to quit.
     */
    fun runCommand(
        command: List<String>,
        closeStdin: Boolean = true,
        environmentOverrides: Map<String, String> = emptyMap(),
        extraPathEntries: List<File> = emptyList(),
        workingDirectory: File? = null,
        redirectErrorStream: Boolean = false,
        timeout: Duration = 30.seconds
    ): CommandResult {
        // Use the same process launcher as regular ACP processes for headless commands.
        val process = GeneralCommandLine(command)
            .withWorkDirectory(workingDirectory)
            .withRedirectErrorStream(redirectErrorStream)
            .withEnvironment(AcpProcessEnvironment.withPrependedPathEntries(extraPathEntries) + environmentOverrides)
            .createProcess()
        try {
            if (closeStdin) process.outputStream.close()

            val stdout = StringBuilder()
            val stderr = StringBuilder()
            val outThread = Thread {
                process.inputStream.bufferedReader().useLines { lines ->
                    lines.forEach { line -> stdout.appendLine(line) }
                }
            }.apply { isDaemon = true; start() }
            val errThread = Thread {
                process.errorStream.bufferedReader().useLines { lines ->
                    lines.forEach { line -> stderr.appendLine(line) }
                }
            }.apply { isDaemon = true; start() }

            val finished = process.waitFor(timeout.inWholeMilliseconds, TimeUnit.MILLISECONDS)
            if (!finished) AcpProcessUtils.destroyProcessTree(process.toHandle())
            outThread.join(1000)
            errThread.join(1000)
            return CommandResult(
                exitCode = if (finished) process.exitValue() else -1,
                stdout = stdout.toString(),
                stderr = stderr.toString(),
                timedOut = !finished
            )
        } catch (error: Exception) {
            if (process.isAlive) AcpProcessUtils.destroyProcessTree(process.toHandle())
            throw error
        }
    }
}
