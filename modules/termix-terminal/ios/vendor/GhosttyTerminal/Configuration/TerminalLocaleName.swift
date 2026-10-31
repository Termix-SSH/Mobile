/// POSIX locale names, as gettext reads them from `LANGUAGE`, for the
/// language tags Apple reports.
///
/// libghostty did this through GNU libintl's canonicalization when it
/// exported the user's preferred languages. The package no longer links
/// libintl (it is LGPL; issue #88), so `TerminalLocaleEnvironment` does the
/// export here, before `ghostty_init`, and this does the conversion. It
/// returns what libintl returned, after upstream's own `zh` rule, for every
/// tag; the tables are in `+Tables`.
enum TerminalLocaleName {
    static func posix(_ tag: String) -> String {
        if let chinese = chineseName(tag) { return chinese }

        let bytes = Array(tag.utf8)
        // The tables are ASCII and are matched byte for byte. Swift compares
        // strings by canonical equivalence, which would let U+212A KELVIN
        // SIGN stand in for the K of "Kazakh".
        if bytes.allSatisfy({ $0 < 0x80 }) {
            if let first = bytes.first, (UInt8(ascii: "A") ... UInt8(ascii: "Z")).contains(first),
               let name = legacyNames[tag]
            {
                return name
            }
            if bytes.count == 7, bytes[2] == UInt8(ascii: "-") {
                if let name = scriptTagNames[tag] { return name }
                let script = String(decoding: bytes[3...], as: UTF8.self)
                if let modifier = scriptModifiers[script] {
                    return String(decoding: bytes[..<2], as: UTF8.self) + "@" + modifier
                }
            }
        }

        let joined = bytes.map { $0 == UInt8(ascii: "-") ? UInt8(ascii: "_") : $0 }
        return String(decoding: joined, as: UTF8.self)
    }

    /// Upstream Ghostty's `fixZhLocale`, applied before libintl: a `zh` tag
    /// with a script and a region names the region gettext catalogs use.
    private static func chineseName(_ tag: String) -> String? {
        let parts = tag.utf8.split(separator: UInt8(ascii: "-"), omittingEmptySubsequences: false)
        guard parts.count >= 3, parts[0].elementsEqual("zh".utf8) else { return nil }
        let region = parts[2]
        if parts[1].elementsEqual("Hans".utf8) {
            return region.elementsEqual("SG".utf8) ? "zh_SG" : "zh_CN"
        }
        if parts[1].elementsEqual("Hant".utf8) {
            if region.elementsEqual("MO".utf8) { return "zh_MO" }
            if region.elementsEqual("HK".utf8) { return "zh_HK" }
            return "zh_TW"
        }
        return nil
    }
}
