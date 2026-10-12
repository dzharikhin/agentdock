package agentdock.acp

import kotlin.io.path.createTempDirectory
import kotlin.test.AfterTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull
import kotlin.test.assertTrue
import java.io.File

class AcpAgentPreferencesStoreTest {
    private val tempDir: File = createTempDirectory("acp-agent-preferences-test").toFile()

    @AfterTest
    fun tearDown() {
        AcpAgentPreferencesStore.setStateFileForTests(null)
        tempDir.deleteRecursively()
    }

    private fun useFreshStore() {
        AcpAgentPreferencesStore.setStateFileForTests(File(tempDir, "acp-agent-preferences.json"))
    }

    @Test
    fun `mode values are merged per mode without touching other modes`() {
        useFreshStore()
        AcpAgentPreferencesStore.rememberModeConfigOptions("opencode", "plan", mapOf("model" to "gpt-x", "effort" to "high"))
        AcpAgentPreferencesStore.rememberModeConfigOptions("opencode", "build", mapOf("model" to "claude-y"))
        AcpAgentPreferencesStore.rememberModeConfigOptions("opencode", "plan", mapOf("effort" to "low"))

        val preference = AcpAgentPreferencesStore.load().agents["opencode"]!!
        assertEquals(
            mapOf("plan" to mapOf("model" to "gpt-x", "effort" to "low"), "build" to mapOf("model" to "claude-y")),
            preference.modeConfigOptions
        )
    }

    @Test
    fun `flat config options keep mode profiles and vice versa`() {
        useFreshStore()
        AcpAgentPreferencesStore.rememberModeConfigOptions("opencode", "plan", mapOf("model" to "gpt-x"))
        AcpAgentPreferencesStore.rememberConfigOptions("opencode", mapOf("mode" to "plan"))

        val preference = AcpAgentPreferencesStore.load().agents["opencode"]!!
        assertEquals(mapOf("mode" to "plan"), preference.configOptions)
        assertEquals(mapOf("plan" to mapOf("model" to "gpt-x")), preference.modeConfigOptions)

        AcpAgentPreferencesStore.rememberConfigOptions("opencode", mapOf("mode" to "build"))
        assertEquals(
            mapOf("plan" to mapOf("model" to "gpt-x")),
            AcpAgentPreferencesStore.load().agents["opencode"]!!.modeConfigOptions
        )
        assertEquals(mapOf("mode" to "build"), AcpAgentPreferencesStore.load().agents["opencode"]!!.configOptions)
    }

    @Test
    fun `state survives reload from disk`() {
        useFreshStore()
        AcpAgentPreferencesStore.rememberAgent("opencode")
        AcpAgentPreferencesStore.rememberModeConfigOptions("opencode", "plan", mapOf("model" to "gpt-x", "effort" to "high"))

        // A fresh cache (as after a plugin restart) must read the same values from disk.
        useFreshStore()
        val state = AcpAgentPreferencesStore.load()
        assertEquals("opencode", state.lastAgentId)
        assertEquals(
            mapOf("plan" to mapOf("model" to "gpt-x", "effort" to "high")),
            state.agents["opencode"]?.modeConfigOptions
        )
    }

    @Test
    fun `legacy state without mode profiles loads unchanged`() {
        useFreshStore()
        val legacyJson = """
            {
                "lastAgentId": "opencode",
                "agents": {
                    "opencode": { "configOptions": { "mode": "plan", "model": "gpt-x" } }
                }
            }
        """.trimIndent()
        File(tempDir, "acp-agent-preferences.json").writeText(legacyJson)

        val state = AcpAgentPreferencesStore.load()
        assertEquals(mapOf("mode" to "plan", "model" to "gpt-x"), state.agents["opencode"]?.configOptions)
        assertTrue(state.agents["opencode"]?.modeConfigOptions.isNullOrEmpty())
    }

    @Test
    fun `blank ids and empty values are dropped`() {
        useFreshStore()
        AcpAgentPreferencesStore.rememberModeConfigOptions(" opencode ", "  ", mapOf("model" to "gpt-x"))
        AcpAgentPreferencesStore.rememberModeConfigOptions("opencode", "plan", mapOf("" to "x", "model" to " ", "effort" to ""))

        val state = AcpAgentPreferencesStore.load()
        assertNull(state.agents["opencode"])
    }
}
