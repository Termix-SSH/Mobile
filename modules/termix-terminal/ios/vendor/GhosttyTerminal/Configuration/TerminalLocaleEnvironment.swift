import Darwin
import Foundation

/// The locale an exec-backend shell inherits.
///
/// An app launched from the Finder, the home screen or a jailbroken
/// launcher has no `LANG`, so Ghostty's `ensureLocale` builds one from
/// `NSLocale` and puts the preferred languages in `LANGUAGE`, converted for
/// gettext by libintl. libghostty no longer links libintl (it is LGPL;
/// issue #88) and built without it would export the raw BCP-47 tags
/// (`zh-Hans-HK.UTF-8`), which gettext does not read. So this sets both
/// first, the way upstream's `setLangFromCocoa` did; Ghostty then finds
/// `LANG` set and leaves both alone. A host that sets `LANG` itself is
/// left alone here too.
enum TerminalLocaleEnvironment {
    struct Values: Equatable {
        var lang: String
        var language: String?
    }

    static func configureEnvironment() {
        guard let values = exports(
            currentLang: getenv("LANG").map { String(cString: $0) },
            locale: .current,
            preferredLanguages: NSLocale.preferredLanguages,
        ) else { return }
        setenv("LANG", values.lang, 1)
        if let language = values.language {
            setenv("LANGUAGE", language, 1)
        }
    }

    /// What `configureEnvironment` exports: nothing while `LANG` is set and
    /// not empty, otherwise `values` for the locale's codes.
    static func exports(
        currentLang: String?,
        locale: Locale,
        preferredLanguages: [String],
    ) -> Values? {
        if let currentLang, !currentLang.isEmpty { return nil }
        let locale = locale as NSLocale
        return values(
            languageCode: locale.object(forKey: .languageCode) as? String,
            countryCode: locale.object(forKey: .countryCode) as? String,
            preferredLanguages: preferredLanguages,
        )
    }

    /// `LANG` is `<language>_<country>.UTF-8`, nothing at all without both
    /// codes. `LANGUAGE` lists every preferred language as a POSIX name
    /// with `.UTF-8`, colon-separated, and is left unset when the list is
    /// empty. The limits are upstream's buffers: 128 bytes for `LANG`, 255
    /// per language, 1024 for `LANGUAGE`, whose overflow drops it whole.
    static func values(
        languageCode: String?,
        countryCode: String?,
        preferredLanguages: [String],
    ) -> Values? {
        guard let languageCode, let countryCode else { return nil }
        let lang = "\(languageCode)_\(countryCode).UTF-8"
        guard lang.utf8.count < 128 else { return nil }

        let names = preferredLanguages
            .filter { $0.utf8.count < 255 }
            .map { TerminalLocaleName.posix($0) + ".UTF-8" }
        let language = names.joined(separator: ":")
        guard !language.isEmpty, language.utf8.count < 1024 else {
            return Values(lang: lang, language: nil)
        }
        return Values(lang: lang, language: language)
    }
}
