package agentdock.acp

import com.agentclientprotocol.protocol.Protocol
import kotlinx.atomicfu.AtomicRef
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue
import java.lang.reflect.Modifier

class AcpProtocolCompatibilityTest {

    @Test
    fun `ACP protocol exposes notification handler storage used by session update wrapper`() {
        val field = Protocol::class.java.getDeclaredField("notificationHandlers")

        assertTrue(
            Modifier.isPrivate(field.modifiers),
            "Protocol.notificationHandlers is expected to remain an SDK-internal field."
        )
        assertEquals(
            AtomicRef::class.java,
            field.type,
            "Protocol.notificationHandlers changed type; review AcpClientService.ensureAsyncSessionUpdates."
        )
    }
}
