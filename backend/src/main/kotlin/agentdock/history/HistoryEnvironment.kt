package agentdock.history

internal object HistoryEnvironment {
    fun conversationId(adapterName: String, sessionId: String): String {
        return "conv_" + historyHashMd5("$adapterName:$sessionId")
    }
}
