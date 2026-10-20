package agentdock.changes

import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.application.EDT
import com.intellij.openapi.application.readAction
import com.intellij.openapi.command.WriteCommandAction
import com.intellij.openapi.fileEditor.FileDocumentManager
import com.intellij.openapi.project.Project
import com.intellij.openapi.util.Computable
import com.intellij.openapi.vfs.LocalFileSystem
import com.intellij.openapi.vfs.VirtualFile
import agentdock.utils.LocalFilePathPolicy
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.io.File
import java.nio.charset.StandardCharsets

data class UndoOperation(val oldText: String, val newText: String)

data class UndoFileResult(val filePath: String, val success: Boolean, val message: String, val reason: String? = null)

data class UndoResult(
    val success: Boolean,
    val message: String,
    val fileResults: List<UndoFileResult> = emptyList()
)

object UndoFileHandler {

    /**
     * Resolve a local file path. Absolute paths and relative traversal outside the project
     * are intentionally supported plugin behavior.
     */
    fun resolveFilePath(project: Project, filePath: String): String {
        return LocalFilePathPolicy.resolve(project, filePath).resolvedPath
    }

    /**
     * Undo a single file according to the same reconstructed "before agent" snapshot used by the diff view.
     */
    suspend fun undoSingleFile(
        project: Project,
        filePath: String,
        status: String,
        operations: List<UndoOperation>
    ): UndoResult {
        val resolvedPath = resolveFilePath(project, filePath)
        if (!isRestorablePath(resolvedPath)) {
            return UndoResult(
                success = false,
                message = "Invalid file path: $filePath",
                fileResults = listOf(UndoFileResult(filePath = filePath, success = false, message = "Invalid file path"))
            )
        }

        val fileResult = try {
            restoreBeforeSnapshot(project, resolvedPath, status, operations).copy(filePath = filePath)
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            UndoFileResult(filePath = filePath, success = false, message = "Error: ${e.message}")
        }
        return UndoResult(
            success = fileResult.success,
            message = fileResult.message,
            fileResults = listOf(fileResult)
        )
    }

    suspend fun undoAllFiles(
        project: Project,
        files: List<Triple<String, String, List<UndoOperation>>>
    ): UndoResult {
        val fileResults = mutableListOf<UndoFileResult>()
        for ((path, status, ops) in files) {
            val resolvedPath = resolveFilePath(project, path)
            val result = try {
                if (!isRestorablePath(resolvedPath)) {
                    UndoFileResult(filePath = path, success = false, message = "Invalid file path")
                } else {
                    restoreBeforeSnapshot(project, resolvedPath, status, ops)
                }
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                UndoFileResult(filePath = path, success = false, message = "Error: ${e.message}")
            }
            fileResults += result.copy(filePath = path)
        }
        val failed = fileResults.filterNot { it.success }
        return UndoResult(
            success = failed.isEmpty(),
            message = if (failed.isEmpty()) {
                "All files reverted"
            } else {
                failed.joinToString("; ") { "${it.filePath}: ${it.message}" }
            },
            fileResults = fileResults
        )
    }

    private suspend fun deleteFile(project: Project, filePath: String, current: String): UndoFileResult {
        val file = File(filePath)
        if (!file.exists()) return UndoFileResult(filePath = filePath, success = true, message = "Already deleted")

        if (ApplicationManager.getApplication() == null) {
            return if (file.delete()) {
                UndoFileResult(filePath = filePath, success = true, message = "Deleted $filePath")
            } else {
                UndoFileResult(filePath = filePath, success = false, message = "Unable to delete $filePath")
            }
        }

        val deleted = withContext(Dispatchers.EDT) {
            WriteCommandAction.runWriteCommandAction(project, Computable {
                val vf = LocalFileSystem.getInstance().refreshAndFindFileByIoFile(file)
                if (currentText(file, vf) != current) return@Computable false
                if (vf != null) {
                    vf.delete(this)
                } else {
                    file.delete()
                }
                true
            })
        }
        if (!deleted) return editConflict(filePath)
        return if (!file.exists()) {
            UndoFileResult(filePath = filePath, success = true, message = "Deleted $filePath")
        } else {
            UndoFileResult(filePath = filePath, success = false, message = "Unable to delete $filePath")
        }
    }

    /**
     * Reads the file and rebuilds its content off the EDT; only the write runs there.
     * The write is skipped as a conflict if the file changed in between, so those changes are kept.
     */
    private suspend fun restoreBeforeSnapshot(
        project: Project,
        filePath: String,
        status: String,
        operations: List<UndoOperation>
    ): UndoFileResult {
        if (operations.isEmpty()) {
            return UndoFileResult(filePath = filePath, success = false, message = "No agent edits to undo")
        }
        val file = File(filePath)
        val app = ApplicationManager.getApplication()
        val vf = if (app == null) null else LocalFileSystem.getInstance().refreshAndFindFileByIoFile(file)
        val current = if (vf == null) currentText(file, null) else readAction { currentText(file, vf) }
        val restored = AgentDiffViewer.rebuildBeforeContent(current, operations)
            ?: return editConflict(filePath)

        if (status == "A" && restored.isEmpty()) {
            return deleteFile(project, filePath, current)
        }
        if (restored == current) return UndoFileResult(filePath = filePath, success = true, message = "Already reverted")

        if (app == null) {
            file.writeText(restored, StandardCharsets.UTF_8)
            return UndoFileResult(filePath = filePath, success = true, message = "Reverted $filePath")
        }

        val written = withContext(Dispatchers.EDT) {
            WriteCommandAction.runWriteCommandAction(project, Computable {
                if (currentText(file, vf) != current) return@Computable false
                val doc = vf?.let { FileDocumentManager.getInstance().getDocument(it) }
                if (doc != null) {
                    doc.setText(restored)
                    FileDocumentManager.getInstance().saveDocument(doc)
                } else if (vf != null) {
                    vf.setBinaryContent(restored.toByteArray(StandardCharsets.UTF_8))
                } else {
                    file.writeText(restored, StandardCharsets.UTF_8)
                    LocalFileSystem.getInstance().refreshAndFindFileByIoFile(file)
                }
                true
            })
        }
        if (!written) return editConflict(filePath)
        return UndoFileResult(filePath = filePath, success = true, message = "Reverted $filePath")
    }

    /** Requires read access when [vf] is given. */
    private fun currentText(file: File, vf: VirtualFile?): String {
        val doc = vf?.takeIf { it.isValid }?.let { FileDocumentManager.getInstance().getDocument(it) }
        return doc?.text ?: if (file.exists()) file.readText(StandardCharsets.UTF_8) else ""
    }

    private fun editConflict(filePath: String) = UndoFileResult(
        filePath = filePath,
        success = false,
        message = "Edit conflict. The file was not changed.",
        reason = "conflict"
    )

    internal fun isRestorablePath(filePath: String): Boolean {
        return LocalFilePathPolicy.isRestorableLocalPath(filePath)
    }
}
