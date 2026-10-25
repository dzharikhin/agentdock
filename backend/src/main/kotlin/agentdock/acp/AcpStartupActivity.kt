package agentdock.acp

import com.intellij.openapi.project.Project
import com.intellij.openapi.startup.ProjectActivity
import agentdock.mcp.McpConfigStore

class AcpStartupActivity : ProjectActivity {
    override suspend fun execute(project: Project) {
        McpConfigStore.ensureConfigFileExists()
        AcpProcessRegistry.registerOwner()
        AcpClientService.getInstance(project).initializeDownloadedAdaptersInBackground()
        // Fills the usage cache so views opened later show data at once.
        AcpQuotaService.getInstance().updateQuotas(maxAge = AcpUsageDataFetcher.VIEW_MAX_AGE)
    }
}
