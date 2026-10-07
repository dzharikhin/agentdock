package agentdock.bridge.frontend

import agentdock.acp.QuotaDetail
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow

/**
 * The client-side copy of the backend's quota state, for the status bar widget.
 *
 * Quotas are fetched where the agent credentials are - on the backend - but the widget lives in the
 * status bar of this process. The backend sends a snapshot whenever the numbers change.
 */
object QuotaSnapshot {

    private val _quotas = MutableStateFlow<Map<String, QuotaDetail>>(emptyMap())
    val quotas = _quotas.asStateFlow()

    @Synchronized
    fun apply(quotas: List<QuotaDetail>): Boolean {
        val previous = _quotas.value
        val updated = quotas.associateBy { it.adapterId }
        val crossedThreshold = updated.any { (adapterId, quota) ->
            quota.percentages.any { (key, percent) ->
                val oldPercent = previous[adapterId]?.percentages?.get(key)
                oldPercent != null && oldPercent < 90 && percent >= 90
            }
        }
        _quotas.value = updated
        return crossedThreshold
    }
}
