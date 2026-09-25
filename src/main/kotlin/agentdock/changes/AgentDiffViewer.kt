package agentdock.changes

import com.github.difflib.DiffUtils
import com.intellij.diff.DiffContentFactory
import com.intellij.diff.DiffManager
import com.intellij.diff.requests.SimpleDiffRequest
import com.intellij.openapi.fileTypes.FileTypeManager
import com.intellij.openapi.fileTypes.FileTypes
import com.intellij.openapi.project.Project
import com.intellij.openapi.vfs.LocalFileSystem
import java.io.File

/**
 * Shows a read-only diff of what the agent changed: left = before agent, right = after agent.
 * Uses operations to rebuild "before" content (no git diff).
 */
object AgentDiffViewer {

    private data class LineChange(val position: Int, val sourceSize: Int, val target: List<String>)

    /**
     * Rebuild content before edits by reverse-applying operations (last to first).
     */
    fun rebuildBeforeContent(currentContent: String, operations: List<UndoOperation>): String? {
        var content = currentContent
        for (op in operations.reversed()) {
            content = reverseOperation(content, op) ?: return null
        }
        return content
    }

    private fun reverseOperation(content: String, op: UndoOperation): String? {
        val current = normalize(content)
        val after = normalize(op.newText)
        val before = normalize(op.oldText)
        if (after == before || current == before) return content

        // Short ACP diffs can be applied directly when their location is unambiguous.
        if (after.isNotEmpty()) {
            val index = current.indexOf(after)
            if (index >= 0) {
                if (current.indexOf(after, index + 1) >= 0) return null
                return current.replaceRange(index, index + after.length, before)
            }
        } else if (current.isEmpty()) {
            return before
        }

        // A full-file diff need not match after later edits elsewhere in the file.
        // Merge those edits with the inverse agent diff, rejecting overlapping changes.
        val base = after.split('\n')
        val userChanges = DiffUtils.diff(base, current.split('\n')).deltas.map { delta ->
            LineChange(delta.source.position, delta.source.lines.size, delta.target.lines)
        }
        val agentChanges = DiffUtils.diff(base, before.split('\n')).deltas.map { delta ->
            LineChange(delta.source.position, delta.source.lines.size, delta.target.lines)
        }
        if (agentChanges.any { agent -> userChanges.any { user -> overlaps(agent, user) } }) return null

        val merged = base.toMutableList()
        for (change in (userChanges + agentChanges).sortedWith(
            compareByDescending<LineChange> { it.position }.thenByDescending { it.sourceSize }
        )) {
            merged.subList(change.position, change.position + change.sourceSize).clear()
            merged.addAll(change.position, change.target)
        }
        return merged.joinToString("\n")
    }

    private fun overlaps(first: LineChange, second: LineChange): Boolean {
        val firstEnd = first.position + first.sourceSize
        val secondEnd = second.position + second.sourceSize
        if (first.sourceSize == 0 && second.sourceSize == 0) return first.position == second.position
        if (first.sourceSize == 0) return first.position > second.position && first.position < secondEnd
        if (second.sourceSize == 0) return second.position > first.position && second.position < firstEnd
        return first.position < secondEnd && second.position < firstEnd
    }

    private fun normalize(text: String): String = text.replace("\r\n", "\n").replace("\r", "\n")

    /**
     * Show agent diff (before vs after) in IDE diff viewer.
     * NOTE: Must be called on EDT (callers use runOnEdt).
     */
    fun showAgentDiff(
        project: Project,
        filePath: String,
        status: String,
        operations: List<UndoOperation>
    ) {
        val resolvedPath = UndoFileHandler.resolveFilePath(project, filePath)
        if (!UndoFileHandler.isRestorablePath(resolvedPath)) return

        try {
            val file = File(resolvedPath)
            val vf = LocalFileSystem.getInstance().refreshAndFindFileByIoFile(file)
            val snapshot = AgentChangeCalculator.buildSnapshot(project, filePath, status, operations) ?: return

            val fileName = file.name
            val fileType = (if (vf != null && vf.exists()) vf.fileType else null)?.takeIf { it != FileTypes.UNKNOWN }
                ?: FileTypeManager.getInstance().getFileTypeByFileName(fileName)

            val contentFactory = DiffContentFactory.getInstance()
            val leftContent = contentFactory.create(project, snapshot.beforeContent, fileType)
            val rightContent = contentFactory.create(project, snapshot.afterContent, fileType)
            val leftTitle = if (status == "A") "(empty)" else "Before (agent edit)"
            val rightTitle = "After (agent edit)"
            val request = SimpleDiffRequest("Agent changes: $fileName", leftContent, rightContent, leftTitle, rightTitle)
            DiffManager.getInstance().showDiff(project, request)
        } catch (e: Exception) {
        }
    }
}
