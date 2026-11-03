package agentdock.sandbox

import java.io.IOException
import java.io.InputStream
import java.net.URI
import java.net.http.HttpClient
import java.net.http.HttpRequest
import java.net.http.HttpResponse
import java.time.Duration

/** Thrown for permanent fetch failures (HTTP 404); not retried. */
internal class PermanentFetchException(message: String) : IOException(message)

/** HTTP access to the Flathub ostree HTTP-archive repository (dl.flathub.org/repo). */
internal class FlathubClient(baseUri: String = "https://dl.flathub.org/repo") {
    private val base = baseUri.trimEnd('/')
    private val http: HttpClient = HttpClient.newBuilder()
        .followRedirects(HttpClient.Redirect.NORMAL)
        .connectTimeout(Duration.ofSeconds(30))
        .build()

    // HttpRequest.timeout() does not cover response BODY reads for ofInputStream, so
    // stalled streams would block forever; consume under a watchdog instead and unblock
    // the reader by closing the body stream (readers then fail with an IOException)
    private val consumers = java.util.concurrent.Executors.newCachedThreadPool()

    fun refCommit(ref: String): String = fetchBytes("/refs/heads/$ref").toString(Charsets.UTF_8).trim()

    /**
     * Streams an object body. [consume] must read the stream to completion; mid-stream
     * failures cause the whole fetch to be retried, so [consume] must tolerate being
     * invoked again against a fresh stream (its side effects should target a temp file).
     */
    fun <T> withObject(csum: String, type: String, consume: (InputStream) -> T): T {
        val path = "/objects/${csum.substring(0, 2)}/${csum.substring(2)}.$type"
        var last: Exception? = null
        repeat(8) { attempt ->
            try {
                return fetchStream(path, consume)
            } catch (e: PermanentFetchException) {
                throw e
            } catch (e: Exception) {
                last = e
                if (attempt == 0) {
                    System.err.println("flathub: fetch retry for ${csum.take(8)}....$type: ${e.javaClass.simpleName}: ${e.message}")
                }
                // the CDN occasionally throttles long pulls; back off generously
                Thread.sleep(minOf(30_000L, 500L shl attempt))
            }
        }
        throw IOException("failed to fetch ${csum.take(12)}....$type after retries", last)
    }

    fun fetchBytes(path: String): ByteArray = fetchStream(path) { it.readBytes() }

    private fun <T> fetchStream(path: String, consume: (InputStream) -> T): T {
        val req = HttpRequest.newBuilder(URI("$base$path"))
            .GET()
            .timeout(Duration.ofMinutes(20)) // bounds connect + headers
            .build()
        val resp = http.send(req, HttpResponse.BodyHandlers.ofInputStream())
        if (resp.statusCode() == 404) {
            resp.body().close()
            throw PermanentFetchException("HTTP 404 for $path")
        }
        if (resp.statusCode() != 200) {
            resp.body().close()
            throw IOException("HTTP ${resp.statusCode()} for $path")
        }
        val body = resp.body()
        val future = consumers.submit(java.util.concurrent.Callable { body.use(consume) })
        return try {
            future.get(20, java.util.concurrent.TimeUnit.MINUTES)
        } catch (e: java.util.concurrent.TimeoutException) {
            body.close()
            throw IOException("body read timed out for $path")
        } catch (e: java.util.concurrent.ExecutionException) {
            throw e.cause ?: e
        }
    }
}
