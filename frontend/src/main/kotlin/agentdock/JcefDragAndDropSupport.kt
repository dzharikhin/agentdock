package agentdock

import com.intellij.openapi.fileEditor.FileDocumentManager
import com.intellij.openapi.fileEditor.FileEditorManager
import com.intellij.openapi.project.Project
import com.intellij.ui.jcef.JBCefBrowser
import agentdock.utils.toProjectRelativePath
import java.awt.datatransfer.DataFlavor
import java.awt.dnd.*
import java.io.File

object JcefDragAndDropSupport {

    fun install(project: Project, browser: JBCefBrowser): DropTarget {
        return DropTarget(browser.component, object : DropTargetAdapter() {
            private fun isAcceptable(dtde: DropTargetDragEvent): Boolean =
                dtde.isDataFlavorSupported(DataFlavor.javaFileListFlavor) ||
                dtde.isDataFlavorSupported(DataFlavor.stringFlavor)

            private fun setDragHighlight(on: Boolean) {
                val js = if (on)
                    "window.dispatchEvent(new CustomEvent('drag-highlight', { detail: { active: true } }));"
                else
                    "window.dispatchEvent(new CustomEvent('drag-highlight', { detail: { active: false } }));"
                browser.cefBrowser.executeJavaScript(js, browser.cefBrowser.url, 0)
            }

            override fun dragEnter(dtde: DropTargetDragEvent) {
                if (isAcceptable(dtde)) {
                    dtde.acceptDrag(DnDConstants.ACTION_COPY)
                    setDragHighlight(true)
                } else {
                    dtde.rejectDrag()
                }
            }

            override fun dragOver(dtde: DropTargetDragEvent) {
                if (isAcceptable(dtde)) dtde.acceptDrag(DnDConstants.ACTION_COPY) else dtde.rejectDrag()
            }

            override fun dragExit(dte: DropTargetEvent) {
                setDragHighlight(false)
            }

            private fun handleFileDrop(dtde: DropTargetDropEvent) {
                dtde.acceptDrop(DnDConstants.ACTION_COPY)
                try {
                    @Suppress("UNCHECKED_CAST")
                    val files = dtde.transferable.getTransferData(DataFlavor.javaFileListFlavor) as List<File>
                    files.filter { it.isFile || it.isDirectory }.forEach { file ->
                        val reference = ExternalCodeReference(
                            path = toProjectRelativePath(project, file.path),
                            fileName = file.name
                        )
                        ExternalCodeReferenceDispatcher.dispatch(project, reference)
                    }
                    dtde.dropComplete(true)
                } catch (_: Exception) {
                    dtde.dropComplete(false)
                }
            }

            private fun handleTextDrop(dtde: DropTargetDropEvent) {
                val editor = FileEditorManager.getInstance(project).selectedTextEditor
                if (editor == null || !editor.selectionModel.hasSelection()) {
                    dtde.rejectDrop()
                    return
                }
                val virtualFile = FileDocumentManager.getInstance().getFile(editor.document)
                if (virtualFile == null) {
                    dtde.rejectDrop()
                    return
                }

                dtde.acceptDrop(DnDConstants.ACTION_COPY)
                val startLine = editor.document.getLineNumber(editor.selectionModel.selectionStart) + 1
                val endLine = editor.document.getLineNumber(editor.selectionModel.selectionEnd) + 1
                val reference = ExternalCodeReference(
                    path = toProjectRelativePath(project, virtualFile.path),
                    fileName = virtualFile.name,
                    startLine = startLine,
                    endLine = endLine
                )
                ExternalCodeReferenceDispatcher.dispatch(project, reference)
                dtde.dropComplete(true)
            }

            override fun drop(dtde: DropTargetDropEvent) {
                setDragHighlight(false)
                when {
                    dtde.isDataFlavorSupported(DataFlavor.javaFileListFlavor) -> handleFileDrop(dtde)
                    dtde.isDataFlavorSupported(DataFlavor.stringFlavor) -> handleTextDrop(dtde)
                    else -> dtde.rejectDrop()
                }
            }
        })
    }
}
