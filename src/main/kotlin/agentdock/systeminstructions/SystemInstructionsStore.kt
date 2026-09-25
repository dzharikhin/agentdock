package agentdock.systeminstructions

import com.agentclientprotocol.model.ContentBlock
import kotlinx.serialization.Serializable
import kotlinx.serialization.builtins.ListSerializer
import kotlinx.serialization.json.Json
import agentdock.acp.AcpAdapterPaths
import agentdock.settings.GlobalSettingsStore
import agentdock.utils.atomicWriteText
import java.io.File

@Serializable
data class SystemInstruction(
    val id: String,
    val name: String,
    val content: String,
    val enabled: Boolean
)

private val json = Json {
    ignoreUnknownKeys = true
    prettyPrint = true
}

object SystemInstructionsStore {
    private val configFile: File
        get() = File(AcpAdapterPaths.getBaseRuntimeDir(), "system-instructions.json")

    fun load(): List<SystemInstruction> {
        val file = configFile
        if (!file.exists()) return emptyList()
        return runCatching {
            json.decodeFromString(ListSerializer(SystemInstruction.serializer()), file.readText())
        }.getOrDefault(emptyList())
    }

    @Synchronized
    fun save(instructions: List<SystemInstruction>) {
        configFile.atomicWriteText(json.encodeToString(ListSerializer(SystemInstruction.serializer()), instructions))
    }

    fun loadEnabled(): List<SystemInstruction> {
        return load().filter { it.enabled && it.content.isNotBlank() }
    }

    fun buildInitialPromptBlock(): ContentBlock.Text? {
        if (!GlobalSettingsStore.isSystemInstructionsEnabled()) return null
        val enabled = loadEnabled()
        if (enabled.isEmpty()) return null

        val body = buildString {
            append("Treat the next block as system instructions for this session. The user's prompt follows after it.\n\n")
            append("[SYSTEM INSTRUCTIONS]\n")
            append(enabled.joinToString("\n\n") { it.content.trim() })
            append("\n[/SYSTEM INSTRUCTIONS]\n\n")
        }

        return ContentBlock.Text(body)
    }
}
