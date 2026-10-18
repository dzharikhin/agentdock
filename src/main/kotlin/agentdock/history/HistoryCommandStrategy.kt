package agentdock.history

import agentdock.acp.AcpExecutionMode
import agentdock.acp.buildAdapterCliCommandParts
import agentdock.acp.wrapWindowsBatchCommand
import java.io.File
import java.util.concurrent.TimeoutException
import kotlin.time.Duration.Companion.milliseconds

private const val HISTORY_CLI_COMMAND_TIMEOUT_MS = 25_000L

internal fun runAgentHistoryCliCommand(
    adapterId: String,
    projectPath: String,
    args: List<String>,
    timeoutMillis: Long = HISTORY_CLI_COMMAND_TIMEOUT_MS
): String {
    require(timeoutMillis > 0L) { "History command timeout must be positive" }
    val (_, commandParts) = buildAdapterCliCommandParts(adapterId, args)
        ?: throw IllegalStateException("Unable to build history command for adapter '$adapterId'")
    val result = AcpExecutionMode.runCommand(
        command = wrapWindowsBatchCommand(commandParts),
        workingDirectory = File(projectPath),
        redirectErrorStream = true,
        timeout = timeoutMillis.milliseconds
    )
    if (result.timedOut) {
        throw TimeoutException("History command for adapter '$adapterId' timed out after ${timeoutMillis}ms")
    }
    check(result.exitCode == 0) { "History command for adapter '$adapterId' exited with code ${result.exitCode}" }
    return result.stdout.trim()
}
