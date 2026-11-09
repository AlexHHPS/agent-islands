import Foundation

// Shared message keys and catalogue files; never translate provider or user content.
enum AppLanguage {
    static let supported = ["es", "en"]
    static let key = "AgentIslandsLanguage"
    static let lock = NSLock()
    private static var override: String?
    static var current: String {
        lock.lock(); defer { lock.unlock() }
        if let override { return override }
        if let saved = UserDefaults.standard.string(forKey: key), supported.contains(saved) { return saved }
        return negotiate(Locale.preferredLanguages)
    }
    static func negotiate(_ preferences: [String]) -> String {
        for preference in preferences {
            let base = preference.replacingOccurrences(of: "_", with: "-").split(separator: "-").first.map(String.init) ?? ""
            if supported.contains(base) { return base }
        }
        return "en"
    }
    static var locale: String { current == "es" ? "es-ES" : "en-US" }
    static var bootstrapSource: String { "window.islandsLanguage=\"\(current)\";" }
    static func set(_ language: String, persist: Bool = true) {
        guard supported.contains(language) else { return }
        lock.lock(); override = language; lock.unlock()
        if persist { UserDefaults.standard.set(language, forKey: key); UserDefaults.standard.set([language], forKey: "AppleLanguages") }
    }
    static let catalogs: [String: [String: String]] = {
        var result: [String: [String: String]] = [:]
        for language in supported {
            let candidates = [Bundle.main.resourceURL?.appendingPathComponent("ui/locales/\(language).json"), URL(fileURLWithPath: FileManager.default.currentDirectoryPath).appendingPathComponent("ui/locales/\(language).json")].compactMap { $0 }
            for file in candidates {
                if let data = try? Data(contentsOf: file), let messages = try? JSONDecoder().decode([String: String].self, from: data) { result[language] = messages; break }
            }
        }
        return result
    }()
    static func text(_ key: String, arguments: [Any] = []) -> String {
        let template = catalogs[current]?[key] ?? catalogs["es"]?[key] ?? key
        // Substitute once, so braces in a user value cannot become another placeholder.
        let expression = try! NSRegularExpression(pattern: #"\{(\d+)\}"#)
        let range = NSRange(template.startIndex..., in: template)
        var result = template
        for match in expression.matches(in: template, range: range).reversed() {
            guard let number = Range(match.range(at: 1), in: template), let index = Int(template[number]), index < arguments.count, let token = Range(match.range, in: result) else { continue }
            result.replaceSubrange(token, with: String(describing: arguments[index]))
        }
        return result
    }
}
func L(_ key: String, _ arguments: Any...) -> String { AppLanguage.text(key, arguments: arguments) }

func localizationSelfTests() {
    precondition(AppLanguage.negotiate(["ca-ES", "es-ES", "en-US"]) == "es")
    precondition(AppLanguage.negotiate(["fr-FR", "de-DE"]) == "en")
    let original = AppLanguage.current
    defer { AppLanguage.set(original, persist: false) }
    AppLanguage.set("en", persist: false)
    precondition(L("Cancelar") == "Cancel")
    precondition(AppLanguage.bootstrapSource == "window.islandsLanguage=\"en\";")
    precondition(L("Imagen {0}", "{1} · Cuenta") == "Image {1} · Cuenta")
    AppLanguage.set("es", persist: false)
    precondition(L("Cancelar") == "Cancelar")
    AppLanguage.set("fr", persist: false)
    precondition(AppLanguage.current == "es")
    print("PASS: shared Spanish/English catalogues, stable placeholders and invalid-language rejection")
}
