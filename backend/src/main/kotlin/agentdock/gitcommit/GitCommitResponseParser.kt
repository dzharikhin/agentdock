package agentdock.gitcommit

internal object GitCommitResponseParser {
    private val commitTagRegex = Regex(
        "<commit_message>(.*?)</commit_message>",
        setOf(RegexOption.IGNORE_CASE, RegexOption.DOT_MATCHES_ALL)
    )

    fun parse(raw: String): String {
        val tagged = commitTagRegex.find(raw)?.groupValues?.getOrNull(1)
        val unwrapped = (tagged ?: raw)
            .replace("```", "")
            .trim()

        return unwrapped
            .lines()
            .dropWhile { it.isBlank() }
            .dropLastWhile { it.isBlank() }
            .joinToString("\n")
            .trim()
    }
}
