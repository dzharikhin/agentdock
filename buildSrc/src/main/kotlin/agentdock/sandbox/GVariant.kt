package agentdock.sandbox

/**
 * Minimal GVariant reader covering exactly the ostree object signatures needed to
 * materialize a Flathub checkout (commits and dirtrees).
 *
 * Framing rules, reverse-engineered and validated byte-for-byte against GLib across
 * the entire live Flathub IntelliJ tree (867 dirtrees, 4041 file entries):
 *  - a container appends a framing-offset table after its children
 *  - tuple tables hold (k-1) entries for k non-fixed children, stored in REVERSE child
 *    order, each giving the END of that child relative to the container start; the last
 *    non-fixed child ends where the table begins
 *  - `a(say)` / `a(sayay)` elements are self-delimiting (name + fixed checksum bytes)
 *    and each struct appends its own (ncsums)-entry reverse-order table, its width
 *    sized by the struct content
 *  - array tables hold one entry per element (forward order, ends relative to the
 *    array start); the entry width is sized by the array's TOTAL extent
 *  - container offset width cannot always be derived statically (it depends on the
 *    largest STORED offset, which is only known after choosing the width), so tuple
 *    framing is resolved by trying candidate widths and accepting the one whose
 *    children parse cleanly
 */
internal object GVariant {
    private const val CSUM_BYTES = 32

    private fun widthFor(size: Int): Int = when {
        size ushr 8 == 0 -> 1
        size ushr 16 == 0 -> 2
        else -> 4
    }

    private fun readOffLE(buf: ByteArray, pos: Int, w: Int): Int = when (w) {
        1 -> buf[pos].toInt() and 0xFF
        2 -> (buf[pos].toInt() and 0xFF) or ((buf[pos + 1].toInt() and 0xFF) shl 8)
        else -> (buf[pos].toInt() and 0xFF) or ((buf[pos + 1].toInt() and 0xFF) shl 8) or
            ((buf[pos + 2].toInt() and 0xFF) shl 16) or (buf[pos + 3].toInt() shl 24)
    }

    private fun alignUp(x: Int, a: Int): Int = if (a <= 1 || x % a == 0) x else x + (a - x % a)

    fun hex(buf: ByteArray, pos: Int, len: Int): String {
        val sb = StringBuilder(len * 2)
        for (i in pos until pos + len) {
            val b = buf[i].toInt() and 0xFF
            sb.append("0123456789abcdef"[b ushr 4]).append("0123456789abcdef"[b and 0xF])
        }
        return sb.toString()
    }

    class TreeEntry(val name: String, val checksums: List<String>)

    class Dirtree(val files: List<TreeEntry>, val dirs: List<TreeEntry>)

    /**
     * Parses `a(say)` (ncsums=1) or `a(sayay)` (ncsums=2) over [start, end).
     * Elements are self-delimiting; parsing stops when the elements end exactly where
     * the n-entry offset table must begin and the table's last entry confirms it.
     */
    fun parseSayArray(buf: ByteArray, start: Int, end: Int, ncsums: Int): List<TreeEntry> {
        val out = ArrayList<TreeEntry>()
        if (start >= end) return out // empty array
        val wArr = widthFor(end - start) // entry width sized by the array's total extent
        var n = 0
        var p = start
        while (true) {
            if (p >= end) throw IllegalArgumentException("array framing ran past end at $p")
            var e = p
            while (e < end && buf[e].toInt() != 0) e++
            if (e == end) throw IllegalArgumentException("unterminated name in array at $p")
            val name = String(buf, p, e - p, Charsets.UTF_8)
            if (e + 1 + CSUM_BYTES * ncsums > end) {
                throw IllegalArgumentException("checksum overruns array at element $n ($name)")
            }
            val contentEnd = e + 1 + CSUM_BYTES * ncsums
            val w = widthFor(contentEnd - p) // struct table width, sized by struct content
            val pAfter = contentEnd + ncsums * w
            n++
            out.add(TreeEntry(name, (0 until ncsums).map { hex(buf, e + 1 + CSUM_BYTES * it, CSUM_BYTES) }))
            val tableEnd = end - n * wArr
            if (pAfter == tableEnd) {
                val lastEntry = readOffLE(buf, tableEnd + (n - 1) * wArr, wArr)
                if (lastEntry == pAfter - start) return out
            }
            if (pAfter >= end - n) {
                throw IllegalArgumentException("array framing overflow at element $n ($name)")
            }
            p = pAfter
        }
    }

    /** Parses `(a(say)a(sayay))`; resolves the tuple framing by trying candidate widths. */
    fun parseDirtree(buf: ByteArray): Dirtree {
        var last: RuntimeException? = null
        for (w in intArrayOf(1, 2, 4)) {
            val tableStart = buf.size - w // one stored entry for the two non-fixed children
            if (tableStart < 0) continue
            val e0 = readOffLE(buf, tableStart, w)
            if (e0 < 0 || e0 > tableStart) continue
            try {
                return Dirtree(
                    parseSayArray(buf, 0, e0, 1),
                    parseSayArray(buf, e0, tableStart, 2),
                )
            } catch (ex: RuntimeException) {
                last = ex
            }
        }
        throw IllegalArgumentException(
            "no valid dirtree framing for ${buf.size}B buffer " +
                "(tail=${hex(buf, (buf.size - 16).coerceAtLeast(0), (buf.size).coerceAtMost(16) - (buf.size - 16).coerceAtLeast(0))})",
            last,
        )
    }

    /**
     * Parses `(a{sv}aya(say)sstayay)` and returns (root dirtree checksum, root dirmeta
     * checksum). The seven non-fixed children leave six stored table entries.
     */
    fun parseCommit(buf: ByteArray): Pair<String, String> {
        // child ends: m0..m4 variable, m5 fixed 8 bytes (aligned to 8), m6/m7 32-byte checksums
        for (w in intArrayOf(1, 2, 4)) {
            val tableStart = buf.size - 6 * w
            if (tableStart <= 0) continue
            val ends = IntArray(7) // ends of m0,m1,m2,m3,m4,m6,m7 in child order
            var ok = true
            var prev = 0
            // stored entries are in reverse child order of the first six non-fixed children
            val stored = IntArray(6)
            for (j in 0 until 6) stored[j] = readOffLE(buf, tableStart + j * w, w)
            // stored[j]: j=0->m6(ends idx 5), j=1->m4(idx 4), j=2->m3(3), j=3->m2(2), j=4->m1(1), j=5->m0(0)
            val mapIdx = intArrayOf(5, 4, 3, 2, 1, 0)
            for (j in 0 until 6) ends[mapIdx[j]] = stored[j]
            ends[6] = tableStart // m7 (last non-fixed child) ends at the table
            // validate weakly increasing ends
            var valid = true
            for (i in ends.indices) {
                if (ends[i] < prev || ends[i] > tableStart) {
                    valid = false
                    break
                }
                prev = ends[i]
            }
            if (!valid) continue
            // materialize spans: m5 is a fixed 8-byte (8-aligned) child between m4 and m6
            val m4End = ends[4]
            val m6Start = alignUp(m4End, 8) + 8
            if (m6Start + CSUM_BYTES != ends[5]) continue
            if (ends[5] + CSUM_BYTES != ends[6]) continue
            return hex(buf, m6Start, CSUM_BYTES) to hex(buf, ends[5], CSUM_BYTES)
        }
        throw IllegalArgumentException("no valid commit framing for ${buf.size}B buffer")
    }
}
