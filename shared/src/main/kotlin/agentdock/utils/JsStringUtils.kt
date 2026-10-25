package agentdock.utils

import kotlinx.serialization.builtins.serializer
import kotlinx.serialization.json.Json

/**
 * Renders a string as a JavaScript string literal, quotes included, ready to be interpolated
 * into executeJavaScript source. JSON string literals are a subset of JavaScript string
 * literals, so the JSON encoder does the escaping and nothing is escaped by hand.
 */
fun String.jsStringLiteral(): String = Json.encodeToString(String.serializer(), this)

/**
 * Renders a call to the UI function `window.[name]`, skipped while the UI has not defined it.
 * [args] are JavaScript expressions, so string values must already be [jsStringLiteral]s.
 */
fun jsCallback(name: String, vararg args: String): String =
    "if(window.$name) window.$name(${args.joinToString(", ")});"
