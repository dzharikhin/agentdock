package agentdock.acp

import com.agentclientprotocol.model.AuthMethod
import java.io.File
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.runInterruptible
import kotlinx.coroutines.withContext
import kotlinx.coroutines.withTimeout
import kotlinx.coroutines.withTimeoutOrNull
import kotlin.time.Duration.Companion.milliseconds

internal object AcpAuthenticationService {
    private const val AUTH_TIMEOUT_MS = 300_000L
    private const val AUTH_STATUS_POLL_INTERVAL_MS = 1_000L
    private const val LOGOUT_TIMEOUT_MS = 15_000L

    @OptIn(com.agentclientprotocol.annotations.UnstableApi::class)
    suspend fun login(
        adapterId: String,
        methodId: String,
        service: AcpClientService,
        openTerminalAuth: (String, List<String>, Map<String, String>) -> Unit
    ) {
        val adapterInfo = AcpAdapterConfig.getAdapterInfo(adapterId)
        when (adapterInfo.loginMethod) {
            "acp" -> acpLogin(adapterId, methodId, service, openTerminalAuth)
            "cli" -> cliLogin(adapterInfo)
            else -> throw IllegalStateException("Login is not configured for '$adapterId'")
        }
    }

    @OptIn(com.agentclientprotocol.annotations.UnstableApi::class)
    private suspend fun acpLogin(
        adapterId: String,
        methodId: String,
        service: AcpClientService,
        openTerminalAuth: (String, List<String>, Map<String, String>) -> Unit
    ) {
        val adapterInfo = AcpAdapterConfig.getAdapterInfo(adapterId)
        val sharedProcess = initializedProcess(adapterId, service)
        val method = sharedProcess.authMethods.firstOrNull { it.id.value == methodId }
            ?: throw IllegalStateException(
                "Adapter '$adapterId' did not advertise ACP auth method '$methodId'"
            )

        when (method) {
            is AuthMethod.AgentAuth -> {
                val client = sharedProcess.client
                    ?: throw IllegalStateException("ACP client is not initialized for '$adapterId'")
                withTimeout(AUTH_TIMEOUT_MS) {
                    client.authenticate(method.id)
                }
            }

            is AuthMethod.TerminalAuth -> {
                openTerminalAuth(method.name, method.args.orEmpty(), method.env.orEmpty())
                if (!adapterInfo.isCustom) {
                    waitForLogin(adapterInfo)
                }
            }

            else -> throw IllegalStateException(
                "ACP auth method '${method.name}' has an unsupported type"
            )
        }
    }

    private suspend fun waitForLogin(adapterInfo: AcpAdapterConfig.AdapterInfo) {
        check(adapterInfo.loginStatusMethod != null) {
            "Authentication status is not configured for '${adapterInfo.id}'"
        }
        val authenticated = withTimeoutOrNull(AUTH_TIMEOUT_MS) {
            while (true) {
                if (withContext(Dispatchers.IO) { AcpLoginStatus.resolve(adapterInfo) } == true) {
                    return@withTimeoutOrNull true
                }
                delay(AUTH_STATUS_POLL_INTERVAL_MS)
            }
        }
        check(authenticated == true) { "Authentication timed out" }
    }

    private suspend fun cliLogin(adapterInfo: AcpAdapterConfig.AdapterInfo) {
        val adapterRoot = AcpAdapterPaths.getDownloadPath(adapterInfo.id)
        val command = buildAdapterLaunchCommand(
            adapterRootPath = adapterRoot,
            adapterInfo = adapterInfo.copy(args = emptyList())
        ) + adapterInfo.loginArgs
        runCommand(
            command = command,
            workingDirectory = File(adapterRoot),
            timeoutMs = AUTH_TIMEOUT_MS,
            actionName = "Login"
        )
    }

    suspend fun logout(adapterId: String, service: AcpClientService): Boolean {
        val adapterInfo = AcpAdapterConfig.getAdapterInfo(adapterId)
        return when (adapterInfo.logoutMethod) {
            "acp" -> {
                acpLogout(adapterId, service)
                false
            }
            "cli" -> {
                cliLogout(adapterInfo)
                true
            }
            "copilotRpc" -> {
                AcpCopilotAuthenticationRpc.logout(adapterId)
                true
            }
            null -> throw IllegalStateException("Logout is not configured for '$adapterId'")
            else -> throw IllegalStateException(
                "Unsupported logout method '${adapterInfo.logoutMethod}' for '$adapterId'"
            )
        }
    }

    @OptIn(com.agentclientprotocol.annotations.UnstableApi::class)
    private suspend fun acpLogout(adapterId: String, service: AcpClientService) {
        val sharedProcess = initializedProcess(adapterId, service)
        if (!sharedProcess.logoutAvailable) {
            throw IllegalStateException("Adapter '$adapterId' did not advertise ACP logout")
        }
        val client = sharedProcess.client
            ?: throw IllegalStateException("ACP client is not initialized for '$adapterId'")
        withTimeout(AUTH_TIMEOUT_MS) {
            client.logout()
        }
    }

    private suspend fun cliLogout(adapterInfo: AcpAdapterConfig.AdapterInfo) {
        check(adapterInfo.logoutArgs.isNotEmpty()) {
            "Adapter '${adapterInfo.id}' does not define logoutArgs for CLI logout"
        }
        val adapterRoot = AcpAdapterPaths.getDownloadPath(adapterInfo.id)
        val command = buildAdapterLaunchCommand(
            adapterRootPath = adapterRoot,
            adapterInfo = adapterInfo.copy(args = emptyList())
        ) + adapterInfo.logoutArgs
        runCommand(
            command = command,
            workingDirectory = File(adapterRoot),
            timeoutMs = LOGOUT_TIMEOUT_MS,
            actionName = "Logout"
        )
    }

    private suspend fun initializedProcess(
        adapterId: String,
        service: AcpClientService
    ): AcpClientService.SharedProcess {
        val adapterInfo = AcpAdapterConfig.getAdapterInfo(adapterId)
        val sharedProcess = service.activeProcesses.computeIfAbsent(adapterId) {
            service.createSharedProcess(adapterId)
        }
        service.ensureSharedProcessStarted(sharedProcess, adapterInfo)
        return sharedProcess
    }

    /** Cancelling the coroutine interrupts the command, which kills its process tree. */
    private suspend fun runCommand(
        command: List<String>,
        workingDirectory: File,
        timeoutMs: Long,
        actionName: String
    ) {
        val result = runInterruptible(Dispatchers.IO) {
            AcpExecutionMode.runCommand(
                command = command,
                closeStdin = false,
                extraPathEntries = AcpNodeRuntimeResolver.resolveAvailable()?.pathEntries.orEmpty(),
                workingDirectory = workingDirectory,
                redirectErrorStream = true,
                timeout = timeoutMs.milliseconds
            )
        }
        check(!result.timedOut) { "$actionName timed out" }
        if (result.exitCode != 0) {
            val details = result.stdout.trim().takeLast(240)
                .takeIf { it.isNotBlank() }
                ?.let { ": $it" }
                .orEmpty()
            throw IllegalStateException("$actionName command failed (exit ${result.exitCode})$details")
        }
    }
}
