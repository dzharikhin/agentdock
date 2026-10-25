package agentdock.audio

import agentdock.settings.AudioTranscriptionFeatureState
import agentdock.settings.AudioTranscriptionProviders
import agentdock.settings.AudioTranscriptionSettings
import java.io.File

/** Provider boundary for audio transcription. Capture and chat integration stay provider-agnostic. */
interface AudioTranscriptionService {
    val id: String
    val installable: Boolean
        get() = false

    fun currentState(
        settings: AudioTranscriptionSettings,
        installing: Boolean = false,
    ): AudioTranscriptionFeatureState

    fun transcribeAudioFile(inputFile: File, settings: AudioTranscriptionSettings): String

    fun install(
        settings: AudioTranscriptionSettings,
    ): AudioTranscriptionFeatureState = currentState(settings)

    /** Makes a running [install] fail soon; it removes what it has written so far. */
    fun cancelInstall() = Unit

    fun uninstall(
        settings: AudioTranscriptionSettings,
    ): AudioTranscriptionFeatureState = currentState(settings)
}

object AudioTranscriptionServices {
    private val services = mapOf(
        AudioTranscriptionProviders.GPT_TRANSCRIBER to { GptTranscriber },
        AudioTranscriptionProviders.GEMINI_TRANSCRIBER to { GeminiTranscriber },
        AudioTranscriptionProviders.WHISPER to { WhisperFeatureManager },
    )

    fun find(provider: String): AudioTranscriptionService? = services[provider]?.invoke()
}
