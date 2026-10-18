package agentdock.acp

internal object AcpAgentVersionCommand {
    fun buildAgentVersionCommand(adapterInfo: AcpAdapterConfig.AdapterInfo): List<String>? {
        val versionConfig = adapterInfo.agentVersionConfig ?: return null
        val downloadPath = AcpAdapterPaths.getDownloadPath(adapterInfo.id)
        if (downloadPath.isEmpty()) return null
        val baseCommand = when (versionConfig.command) {
            "adapter" -> buildAdapterLaunchCommand(
                adapterRootPath = downloadPath,
                adapterInfo = adapterInfo.copy(args = emptyList())
            )
            "cli" -> buildAdapterCliCommandParts(adapterInfo.id)?.second ?: return null
            else -> return null
        }
        return baseCommand + versionConfig.args
    }
}
