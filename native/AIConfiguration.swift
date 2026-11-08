import Cocoa
import Security
import CryptoKit

struct AIConfiguration: Codable {
    var endpoint: String
    var model: String
    var requiresAPIKey: Bool
    var tokenLimitParameter: String
    init(endpoint: String, model: String, requiresAPIKey: Bool = false, tokenLimitParameter: String = "max_tokens") throws {
        guard let url = URL(string: endpoint), let host = url.host, url.user == nil, url.password == nil, url.query == nil, url.fragment == nil,
              url.scheme == "https" || (url.scheme == "http" && ["localhost", "127.0.0.1", "::1", "[::1]"].contains(host)) else {
            throw launchFailure(L("Usa una URL HTTPS o un servidor HTTP en localhost, sin credenciales ni parámetros."))
        }
        let name = model.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !name.isEmpty, name.utf8.count <= 200, !name.contains("\n"), ["max_tokens", "max_completion_tokens"].contains(tokenLimitParameter) else { throw launchFailure(L("Indica un modelo válido y un parámetro de límite de tokens compatible.")) }
        self.endpoint = url.absoluteString; self.model = name; self.requiresAPIKey = requiresAPIKey; self.tokenLimitParameter = tokenLimitParameter
    }
    var keychainAccount: String { SHA256.hash(data: Data(endpoint.utf8)).map { String(format: "%02x", $0) }.joined() }
    var source: String { (URL(string: endpoint)?.host ?? "AI") + " · " + model }
}

extension AppDelegate {
    func aiConfiguration() -> AIConfiguration? {
        guard let data = try? Data(contentsOf: support.appendingPathComponent("ai.json")), data.count < 16_000,
              let values = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any] else { return nil }
        return try? AIConfiguration(endpoint: values["endpoint"] as? String ?? "", model: values["model"] as? String ?? "", requiresAPIKey: values["requiresAPIKey"] as? Bool ?? false, tokenLimitParameter: values["tokenLimitParameter"] as? String ?? "max_tokens")
    }
    func aiKeyQuery(_ config: AIConfiguration) -> [String: Any] {
        [kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: "Agent Islands AI", kSecAttrAccount as String: config.keychainAccount]
    }
    func readAIKey(_ config: AIConfiguration) -> String? {
        var query = aiKeyQuery(config); query[kSecReturnData as String] = true; query[kSecMatchLimit as String] = kSecMatchLimitOne
        var result: CFTypeRef?
        guard SecItemCopyMatching(query as CFDictionary, &result) == errSecSuccess, let data = result as? Data else { return nil }
        return String(data: data, encoding: .utf8)
    }
    func aiSettingsInfo() -> [String: Any] {
        guard let config = aiConfiguration() else { return ["configured": false] }
        return ["configured": true, "endpoint": config.endpoint, "model": config.model, "requiresAPIKey": config.requiresAPIKey, "tokenLimitParameter": config.tokenLimitParameter]
    }
    func aiSettingsOperation(_ body: [String: Any], requestID: String, method: String) {
        do {
            if method == "ai.save" {
                let values = body["params"] as? [String: Any] ?? [:]
                let config = try AIConfiguration(endpoint: values["endpoint"] as? String ?? "", model: values["model"] as? String ?? "", requiresAPIKey: values["requiresAPIKey"] as? Bool ?? false, tokenLimitParameter: values["tokenLimitParameter"] as? String ?? "max_tokens")
                try JSONEncoder().encode(config).write(to: support.appendingPathComponent("ai.json"), options: .atomic)
                try fm.setAttributes([.posixPermissions: 0o600], ofItemAtPath: support.appendingPathComponent("ai.json").path)
                aiGeneration += 1; aiTask?.cancel(); aiTask = nil; aiCredential = nil; aiCredentialRequest = nil
            } else if method == "ai.key" {
                guard let config = aiConfiguration() else { throw launchFailure(L("Guarda primero el servidor y el modelo.")) }
                let alert = NSAlert(); alert.messageText = L("Guardar clave de IA"); alert.informativeText = L("La clave se guardará en el llavero para {0}. No se enviará a la interfaz web.", URL(string: config.endpoint)?.host ?? L("este servidor"))
                alert.addButton(withTitle: L("Guardar clave")); alert.addButton(withTitle: L("Cancelar"))
                let field = NSSecureTextField(frame: NSRect(x: 0, y: 0, width: 360, height: 28)); field.placeholderString = L("Clave API"); alert.accessoryView = field
                guard alert.runModal() == .alertFirstButtonReturn else { emit("operationsResult", ["requestId": requestID, "method": method, "result": aiSettingsInfo()]); return }
                guard !field.stringValue.isEmpty, field.stringValue.utf8.count <= 8192 else { throw launchFailure(L("Indica una clave válida.")) }
                let query = aiKeyQuery(config), value = [kSecValueData as String: Data(field.stringValue.utf8)]
                let status = SecItemUpdate(query as CFDictionary, value as CFDictionary)
                if status == errSecItemNotFound {
                    var item = query; item[kSecValueData as String] = Data(field.stringValue.utf8); item[kSecAttrAccessible as String] = kSecAttrAccessibleWhenUnlockedThisDeviceOnly
                    guard SecItemAdd(item as CFDictionary, nil) == errSecSuccess else { throw launchFailure(L("No se pudo guardar la clave en el llavero.")) }
                } else if status != errSecSuccess { throw launchFailure(L("No se pudo actualizar la clave en el llavero.")) }
                field.stringValue = ""; aiCredential = nil
            } else if method != "ai.get" { throw launchFailure(L("Operación de IA desconocida.")) }
            emit("operationsResult", ["requestId": requestID, "method": method, "result": aiSettingsInfo()])
        } catch { emit("operationsResult", ["requestId": requestID, "method": method, "error": error.localizedDescription]) }
    }
}

func aiConfigurationSelfTests() throws {
    let a = try AIConfiguration(endpoint: "http://127.0.0.1:11434/v1/chat/completions", model: "example-model")
    let b = try AIConfiguration(endpoint: "https://example.test/v1/chat/completions", model: "another-model", requiresAPIKey: true)
    precondition(a.keychainAccount != b.keychainAccount)
    for endpoint in ["http://example.test/v1/chat/completions", "file:///etc/passwd", "https://user:secret@example.test/chat", "https://example.test/chat?key=value"] {
        do { _ = try AIConfiguration(endpoint: endpoint, model: "model"); fatalError("Unsafe endpoint accepted") } catch {}
    }
    print("PASS: optional AI configuration, loopback-only HTTP and endpoint-bound Keychain identities")
}
