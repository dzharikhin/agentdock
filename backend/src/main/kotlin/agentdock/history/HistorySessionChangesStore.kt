package agentdock.history

import java.time.Instant

internal object HistorySessionChangesStore {
    fun loadSessionChanges(projectPath: String, sessionId: String, adapterName: String): HistorySessionChangesEntry? {
        if (projectPath.isBlank() || sessionId.isBlank() || adapterName.isBlank()) return null
        val indexFile = HistoryStorage.ensureProjectIndexFile(projectPath)
        val conversations = HistoryStorage.readProjectIndex(indexFile)
        return conversations.asSequence()
            .flatMap { it.sessions.asSequence() }
            .firstOrNull { it.sessionId == sessionId && it.adapterName == adapterName }
            ?.changes
    }

    fun saveSessionChanges(
        projectPath: String,
        sessionId: String,
        adapterName: String,
        keptToolCallIds: List<String>,
        processedFileStates: List<ProcessedFileState>
    ): Boolean {
        val updatedAt = Instant.now().toEpochMilli()
        return updateSessionEntry(projectPath, sessionId, adapterName) { session ->
            session.copy(
                changes = HistorySessionChangesEntry(
                    keptToolCallIds = keptToolCallIds,
                    processedFileStates = processedFileStates,
                    updatedAt = updatedAt
                )
            )
        }
    }

    private fun updateSessionEntry(
        projectPath: String,
        sessionId: String,
        adapterName: String,
        transform: (HistorySessionIndexEntry) -> HistorySessionIndexEntry
    ): Boolean {
        if (projectPath.isBlank()) return false

        val indexFile = HistoryStorage.ensureProjectIndexFile(projectPath)
        val synced = HistoryStorage.readProjectIndex(indexFile)

        var updated = false
        val rewritten = synced.map { conversation ->
            val sessions = conversation.sessions.map { session ->
                if (session.sessionId == sessionId && session.adapterName == adapterName) {
                    updated = true
                    transform(session)
                } else {
                    session
                }
            }
            conversation.copy(sessions = sessions)
        }

        if (!updated) return false
        HistoryStorage.writeProjectIndex(indexFile, rewritten)
        return true
    }
}
