package agentdock.audio

import agentdock.settings.AudioOutputProviderSettings
import kotlinx.serialization.json.addJsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.put
import kotlinx.serialization.json.putJsonArray
import kotlinx.serialization.json.putJsonObject
import java.net.URI
import java.net.http.HttpRequest
import java.nio.charset.StandardCharsets
import java.time.Duration
import java.util.Base64

/** Streams speech from the Gemini Interactions API; audio arrives as base64 PCM in server-sent events. */
object GeminiSpeech : SpeechSynthesizer {
    private const val MODEL = "gemini-3.8-flash-lite-tts"
    private const val INTERACTIONS_URL = "https://generativelanguage.googleapis.com/v1beta/interactions"
    private const val DEFAULT_VOICE = "Kore"

    override fun synthesize(text: String, settings: AudioOutputProviderSettings, onAudio: (ByteArray) -> Unit) {
        val key = settings.apiKey.trim().takeIf(String::isNotEmpty)
            ?: throw IllegalStateException("Enter a Google Gemini API key in Settings → Audio Output.")
        val body = buildJsonObject {
            put("model", MODEL)
            putJsonArray("input") {
                addJsonObject {
                    put("type", "user_input")
                    putJsonArray("content") {
                        addJsonObject {
                            put("type", "text")
                            put("text", text)
                        }
                    }
                }
            }
            putJsonObject("response_format") { put("type", "audio") }
            putJsonObject("generation_config") {
                putJsonArray("speech_config") {
                    addJsonObject { put("voice", settings.voice.trim().ifEmpty { DEFAULT_VOICE }) }
                }
            }
            put("stream", true)
        }.toString()
        val request = HttpRequest.newBuilder(URI.create(INTERACTIONS_URL))
            .timeout(Duration.ofSeconds(30))
            .header("x-goog-api-key", key)
            .header("Content-Type", "application/json")
            .header("Accept", "text/event-stream")
            .POST(HttpRequest.BodyPublishers.ofString(body, StandardCharsets.UTF_8))
            .build()

        openSpeechStream(request, "Gemini Speech request").bufferedReader(StandardCharsets.UTF_8).useLines { lines ->
            lines.forEach { line ->
                val data = line.takeIf { it.startsWith("data:") }?.substring(5)?.trim()
                if (data.isNullOrEmpty() || data == "[DONE]") return@forEach
                val event = speechJson.parseToJsonElement(data)
                speechErrorMessage(event)?.let { throw IllegalStateException(it) }
                val delta = event.jsonObject["delta"]?.jsonObject ?: return@forEach
                if (delta["type"]?.jsonPrimitive?.contentOrNull != "audio") return@forEach
                delta["data"]?.jsonPrimitive?.contentOrNull?.let { onAudio(Base64.getDecoder().decode(it)) }
            }
        }
    }
}
