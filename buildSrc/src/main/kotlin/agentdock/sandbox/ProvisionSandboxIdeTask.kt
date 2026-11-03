package agentdock.sandbox

import org.gradle.api.DefaultTask
import org.gradle.api.file.DirectoryProperty
import org.gradle.api.tasks.Internal
import org.gradle.api.tasks.TaskAction

/**
 * Provisions .repo/idea (IntelliJ IDEA Ultimate with bundled JBR, from the official
 * Flathub flatpak) and .repo/m2 (instrumentation toolchain synthesized from the IDE).
 * Safe to re-run: skips when the IDE is already provisioned.
 */
abstract class ProvisionSandboxIdeTask : DefaultTask() {
    @get:Internal
    abstract val repoDir: DirectoryProperty

    @TaskAction
    fun provision() {
        FlathubProvisioner.provision(repoDir.get().asFile.toPath()) { logger.lifecycle(it) }
    }
}
