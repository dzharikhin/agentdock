package agentdock.acp

import kotlinx.coroutines.CancellationException
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.atomic.AtomicBoolean

internal class AcpAdapterInstallCancellation {
    private val cancelled = AtomicBoolean(false)
    private val processes = ConcurrentHashMap.newKeySet<Process>()

    fun cancel() {
        cancelled.set(true)
        processes.forEach { destroyProcessTree(it) }
    }

    fun throwIfCancelled() {
        if (cancelled.get()) {
            throw CancellationException("Adapter installation cancelled")
        }
    }

    fun register(process: Process) {
        processes.add(process)
        if (cancelled.get()) {
            destroyProcessTree(process)
            throwIfCancelled()
        }
    }

    fun unregister(process: Process) {
        processes.remove(process)
    }

    private fun destroyProcessTree(process: Process) =
        AcpProcessUtils.destroyProcessTrees(listOf(process.toHandle()), awaitExit = false)
}
