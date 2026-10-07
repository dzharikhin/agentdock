package agentdock

import com.intellij.ui.JBColor
import com.intellij.openapi.editor.DefaultLanguageHighlighterColors
import com.intellij.openapi.editor.colors.EditorColorsManager
import agentdock.bridge.frontend.FrontendSettings
import java.awt.Color
import java.util.Locale
import javax.swing.UIManager

/**
 * Extracts IDE theme settings (colors, typography, layout) and generates CSS variables.
 */
object IdeTheme {

    fun isDarkTheme(): Boolean = !JBColor.isBright()

    private fun isIslandsTheme(): Boolean {
        return when (val value = UIManager.get("Islands")) {
            is Number -> value.toInt() == 1
            is Boolean -> value
            is String -> value == "1" || value.equals("true", ignoreCase = true)
            else -> false
        }
    }

    private val uiComponents = linkedMapOf(
        "Panel" to listOf("background", "foreground"),
        "Label" to listOf("foreground", "disabledForeground"),
        "Button" to listOf("startBackground", "foreground", "disabledText", "disabledBorderColor", "focusedBorderColor"),
        "TextField" to listOf("foreground", "selectionBackground", "selectionForeground", "focusedBorderColor"),
        "List" to listOf("selectionBackground", "selectionForeground", "hoverBackground"),
        "Button.default" to listOf("startBackground", "foreground", "borderColor", "focusColor"),
        "Hyperlink" to listOf("linkColor")
    )

    fun generateCssUpdateScript(): String {
        val cssBlock = generateCssBlock().replace("`", "\\`")
        return "document.getElementById('ide-theme-style').textContent=`$cssBlock`;"
    }

    fun generateCssBlock(): String {
        val sb = StringBuilder()
        sb.append(":root {\n")
        val scheme = EditorColorsManager.getInstance().globalScheme
        val isDark = isDarkTheme()
        val editorBackground = scheme.defaultBackground
        val panelBackground = uiColor("Panel.background", editorBackground)
        val baseBackground = if (isTransparent(panelBackground)) editorBackground else panelBackground

        // Secondary: use editor background if different from panel, otherwise calculate
        val secondaryBackground = if (areColorsSimilar(baseBackground, editorBackground)) {
            // Editor and panel backgrounds are similar - calculate variation
            adjustBrightness(baseBackground, 1.2)
        } else {
            // Use editor background as secondary
            editorBackground
        }
        // Button backgrounds that blend into a background derive from the outermost one, so they differ from both
        val buttonFallbackBase = listOf(baseBackground, secondaryBackground)
            .let { if (isDark) it.maxBy(::brightness) else it.minBy(::brightness) }

        // UI Component colors from UIManager
        for ((component, props) in uiComponents) {
            for (prop in props) {
                val uiKey = "$component.$prop"
                val originalColor = UIManager.getColor(uiKey) ?: JBColor.namedColor(uiKey, Color(0, 0, 0, 0))
                val color = when {
                    uiKey == "List.hoverBackground" &&
                        (isTransparent(originalColor) || areColorsSimilar(originalColor, baseBackground)) ->
                        adjustBrightness(baseBackground, 1.30)
                    uiKey == "Panel.background" && isTransparent(originalColor) ->
                        baseBackground
                    (uiKey == "Button.startBackground" || uiKey == "Button.default.startBackground") &&
                        (isTransparent(originalColor) ||
                            areColorsSimilar(originalColor, baseBackground) ||
                            areColorsSimilar(originalColor, secondaryBackground)) ->
                        adjustBrightness(buttonFallbackBase, if (isDark) 1.3 else 0.90)
                    isTransparent(originalColor) ->
                        adjustBrightness(baseBackground, if (isDark) 1.3 else 0.90)
                    else -> originalColor
                }
                sb.append("  --ide-${uiKey.replace(".", "-")}: ${toCssColor(color)};\n")
            }
        }

        // Base fonts only — UI and Code
        val baseFont = com.intellij.util.ui.JBFont.regular()
        sb.append("  --ide-font-family: '${baseFont.family}', sans-serif;\n")
        sb.append("  --ide-font-size: ${baseFont.size2D + 1}px;\n")

        sb.append("  --ide-code-font-family: '${scheme.editorFontName}', monospace;\n")

        // Editor colors
        sb.append("  --ide-editor-bg: ${toCssColor(scheme.defaultBackground)};\n")
        sb.append("  --ide-editor-fg: ${toCssColor(scheme.defaultForeground)};\n")

        // Syntax highlighting
        val syntaxMap = mapOf(
            "keyword" to DefaultLanguageHighlighterColors.KEYWORD,
            "string" to DefaultLanguageHighlighterColors.STRING,
            "number" to DefaultLanguageHighlighterColors.NUMBER,
            "comment" to DefaultLanguageHighlighterColors.LINE_COMMENT,
            "function" to DefaultLanguageHighlighterColors.FUNCTION_DECLARATION,
            "class" to DefaultLanguageHighlighterColors.CLASS_NAME,
            "tag" to DefaultLanguageHighlighterColors.MARKUP_TAG,
            "attr" to DefaultLanguageHighlighterColors.MARKUP_ATTRIBUTE
        )

        for ((name, key) in syntaxMap) {
            val attrs = scheme.getAttributes(key)
            val color = attrs?.foregroundColor
            if (color != null) {
                sb.append("  --ide-syntax-$name: ${toCssColor(color)};\n")
            }
        }

        // Dynamic background variations
        val isIslands = isIslandsTheme()
        sb.append("  --ide-theme-is-dark: ${if (isDark) "1" else "0"};\n")
        sb.append("  --ide-theme-is-islands: ${if (isIslands) "1" else "0"};\n")
        val blueHighlightUserMessageBackground =
            if (isDark) Color(0x19, 0x3d, 0x70) else Color(0xe0, 0xf0, 0xff)
        val blueUserMessageBackground = if (isDark) Color(0x25, 0x32, 0x4d) else Color(225, 235, 253, 220)
        val defaultUserMessageBackground = if (isDark) Color(100, 100, 100, 65) else Color(100, 100, 100, 30)

        sb.append("  --ide-background-secondary: ${toCssColor(secondaryBackground)};\n")
        sb.append("  --ide-user-message-default-bg: ${toCssColor(defaultUserMessageBackground)};\n")
        sb.append("  --ide-user-message-blue-highlight-bg: ${toCssColor(blueHighlightUserMessageBackground)};\n")
        sb.append("  --ide-user-message-blue-bg: ${toCssColor(blueUserMessageBackground)};\n")
        sb.append("  --ide-surface-hover-tint: ${if (isDark) "7%" else "5%"};\n")
        sb.append("  --ide-surface-active-tint: ${if (isDark) "12%" else "7%"};\n")

        // Dynamic border color (must be different from both backgrounds)
        val originalBorder = uiColor(
            "Borders.color",
            adjustBrightness(baseBackground, if (isDark) 1.8 else 0.85)
        )
        val borderColor = if (isTransparent(originalBorder) ||
                             areColorsSimilar(originalBorder, baseBackground) ||
                             areColorsSimilar(originalBorder, secondaryBackground)) {
            // Border is too similar to backgrounds - adjust it
            // In dark theme: make lighter than both backgrounds
            // In light theme: make darker than both backgrounds
            adjustBrightness(baseBackground, if (isDark) 1.8 else 0.85)
        } else {
            // Border is distinct - use original
            originalBorder
        }
        sb.append("  --ide-Borders-color: ${toCssColor(borderColor)};\n")
        val rawContrastBorderColor: Color? = UIManager.getColor("Borders.ContrastBorderColor")
        val contrastBorderColor = if (
            rawContrastBorderColor == null ||
            isTransparent(rawContrastBorderColor) ||
            areColorsSimilar(rawContrastBorderColor, baseBackground)
        ) {
            borderColor
        } else {
            rawContrastBorderColor
        }
        sb.append("  --ide-Borders-ContrastBorderColor: ${toCssColor(contrastBorderColor)};\n")

        // Scrollbar color based on border
        val scrollbarColor = adjustBrightness(borderColor, if (isDark) 1.25 else 0.90)
        sb.append("  --ide-scrollbar-color: ${toCssColor(scrollbarColor)};\n")

        val userMessageStyle = FrontendSettings.current.userMessageBackgroundStyle
        val customColor = FrontendSettings.current.userMessageCustomColor
            .takeIf { Regex("#[0-9a-fA-F]{6}").matches(it) } ?: "#193d70"
        sb.append("  --ide-user-message-custom-bg: $customColor;\n")
        val userMessageBackgroundVar = when (userMessageStyle) {
            "custom" -> "--ide-user-message-custom-bg"
            "default" -> "--ide-user-message-default-bg"
            "blue-highlight" -> "--ide-user-message-blue-highlight-bg"
            "blue" -> "--ide-user-message-blue-bg"
            "background-secondary" -> "--ide-background-secondary"
            "accent" -> "--ide-List-selectionBackground"
            else -> "--ide-user-message-default-bg"
        }
        sb.append("  --user-message-bg: var($userMessageBackgroundVar);\n")

        // Layout and spacing
        val listIndent = UIManager.getInt("Tree.leftChildIndent").takeIf { it > 0 }
            ?: com.intellij.util.ui.JBUI.scale(20)
        val paraSpacing = com.intellij.util.ui.JBUI.scale(10)
        sb.append("  --ide-list-indent: ${listIndent}px;\n")
        sb.append("  --ide-paragraph-spacing: ${paraSpacing}px;\n")

        sb.append("}\n")
        return sb.toString()
    }

    private fun areColorsSimilar(color1: Color, color2: Color, threshold: Int = 15): Boolean {
        val rDiff = kotlin.math.abs(color1.red - color2.red)
        val gDiff = kotlin.math.abs(color1.green - color2.green)
        val bDiff = kotlin.math.abs(color1.blue - color2.blue)

        return rDiff <= threshold && gDiff <= threshold && bDiff <= threshold
    }

    private fun adjustBrightness(color: Color, factor: Double): Color {
        val hsb = FloatArray(3)
        Color.RGBtoHSB(color.red, color.green, color.blue, hsb)

        val newBrightness = (hsb[2] * factor).coerceIn(0.0, 1.0).toFloat()
        val rgb = Color.HSBtoRGB(hsb[0], hsb[1], newBrightness)

        return Color(rgb)
    }

    private fun brightness(color: Color): Float =
        Color.RGBtoHSB(color.red, color.green, color.blue, null)[2]

    private fun isTransparent(color: Color): Boolean {
        return color.alpha == 0
    }

    private fun uiColor(uiKey: String, fallback: Color): Color {
        return UIManager.getColor(uiKey) ?: JBColor.namedColor(uiKey, fallback)
    }

    private fun toCssColor(color: Color): String {
        val alpha = color.alpha / 255.0
        return if (alpha >= 1.0) {
            "rgb(${color.red}, ${color.green}, ${color.blue})"
        } else {
            "rgba(${color.red}, ${color.green}, ${color.blue}, ${String.format(Locale.US, "%.2f", alpha)})"
        }
    }
}
