package agentdock.audio

import agentdock.settings.AudioOutputProviderSettings
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import java.net.URI
import java.net.http.HttpRequest
import java.nio.charset.StandardCharsets
import java.time.Duration

/** Streams speech from OpenAI's `/v1/audio/speech` endpoint as raw PCM. */
object GptSpeech : SpeechSynthesizer {
    private const val MODEL = "gpt-4o-mini-tts"
    private const val SPEECH_URL = "https://api.openai.com/v1/audio/speech"
    private const val DEFAULT_VOICE = "marin"

    override fun synthesize(text: String, settings: AudioOutputProviderSettings, onAudio: (ByteArray) -> Unit) {
        val key = settings.apiKey.trim().takeIf(String::isNotEmpty)
            ?: throw IllegalStateException("Enter an OpenAI API key in Settings → Audio Output.")
        val body = buildJsonObject {
            put("model", MODEL)
            put("input", text)
            put("voice", settings.voice.trim().ifEmpty { DEFAULT_VOICE })
            put("instructions", "Speak quickly.")
            put("response_format", "pcm")
        }.toString()
        val request = HttpRequest.newBuilder(URI.create(SPEECH_URL))
            .timeout(Duration.ofSeconds(30))
            .header("Authorization", "Bearer $key")
            .header("Content-Type", "application/json")
            .POST(HttpRequest.BodyPublishers.ofString(body, StandardCharsets.UTF_8))
            .build()

        openSpeechStream(request, "GPT Speech request").use { stream ->
            val buffer = ByteArray(8192)
            while (true) {
                val read = stream.read(buffer)
                if (read < 0) break
                if (read > 0) onAudio(buffer.copyOf(read))
            }
        }
    }
}
