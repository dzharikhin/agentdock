package agentdock.acp

import com.agentclientprotocol.model.EnvVariable
import com.agentclientprotocol.model.HttpHeader
import com.agentclientprotocol.model.McpServer
import agentdock.mcp.McpConfigStore
import agentdock.mcp.McpServerConfig

internal fun buildMcpServers(): List<McpServer> =
    McpConfigStore.loadEnabled().mapNotNull { it.toSdkMcpServer() }

private fun McpServerConfig.toSdkMcpServer(): McpServer? = when (transport) {
    "stdio" -> {
        val cmd = command?.takeIf { it.isNotBlank() } ?: return null
        McpServer.Stdio(
            name = name,
            command = cmd,
            args = args ?: emptyList(),
            env = env?.map { EnvVariable(it.name, it.value) } ?: emptyList()
        )
    }
    "http" -> {
        val urlValue = url?.takeIf { it.isNotBlank() } ?: return null
        McpServer.Http(
            name = name,
            url = urlValue,
            headers = headers?.map { HttpHeader(it.name, it.value) } ?: emptyList()
        )
    }
    "sse" -> {
        val urlValue = url?.takeIf { it.isNotBlank() } ?: return null
        McpServer.Sse(
            name = name,
            url = urlValue,
            headers = headers?.map { HttpHeader(it.name, it.value) } ?: emptyList()
        )
    }
    else -> null
}
