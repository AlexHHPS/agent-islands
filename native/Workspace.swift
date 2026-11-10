import Foundation
import SQLite3

// Islands owns this database. Provider databases remain read-only.
final class WorkspaceStore {
    private var db: OpaquePointer?
    init(_ root: URL) throws {
        try fm.createDirectory(at: root, withIntermediateDirectories: true, attributes: [.posixPermissions: 0o700])
        let file = root.appendingPathComponent("workspace.sqlite")
        guard sqlite3_open_v2(file.path, &db, SQLITE_OPEN_READWRITE | SQLITE_OPEN_CREATE | SQLITE_OPEN_FULLMUTEX, nil) == SQLITE_OK else { throw launchFailure(L("No se pudo abrir el registro de Islands.")) }
        sqlite3_busy_timeout(db, 3000)
        var version: OpaquePointer?
        sqlite3_prepare_v2(db, "PRAGMA user_version", -1, &version, nil)
        let existingVersion = sqlite3_step(version) == SQLITE_ROW ? sqlite3_column_int(version, 0) : 0
        sqlite3_finalize(version)
        guard existingVersion <= 1 else { throw launchFailure(L("Este registro necesita una versión más reciente de Islands.")) }
        try execute("PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS records (kind TEXT NOT NULL, id TEXT NOT NULL, value TEXT NOT NULL, updated REAL NOT NULL, PRIMARY KEY(kind,id)); PRAGMA user_version=1;")
        try fm.setAttributes([.posixPermissions: 0o600], ofItemAtPath: file.path)
    }
    deinit { sqlite3_close(db) }
    private func execute(_ sql: String) throws {
        guard sqlite3_exec(db, sql, nil, nil, nil) == SQLITE_OK else { throw launchFailure(L("No se pudo guardar el registro de Islands.")) }
    }
    func put(_ kind: String, id: String, value: Any) throws {
        var statement: OpaquePointer?
        guard sqlite3_prepare_v2(db, "INSERT INTO records VALUES (?,?,?,?) ON CONFLICT(kind,id) DO UPDATE SET value=excluded.value,updated=excluded.updated", -1, &statement, nil) == SQLITE_OK else { throw launchFailure(L("Registro no disponible.")) }
        defer { sqlite3_finalize(statement) }
        let transient = unsafeBitCast(-1, to: sqlite3_destructor_type.self)
        sqlite3_bind_text(statement, 1, kind, -1, transient); sqlite3_bind_text(statement, 2, id, -1, transient)
        sqlite3_bind_text(statement, 3, json(value), -1, transient); sqlite3_bind_double(statement, 4, Date().timeIntervalSince1970)
        guard sqlite3_step(statement) == SQLITE_DONE else { throw launchFailure(L("No se pudo guardar el registro.")) }
    }
    func delete(_ kind: String, id: String) throws {
        var statement: OpaquePointer?
        guard sqlite3_prepare_v2(db, "DELETE FROM records WHERE kind=? AND id=?", -1, &statement, nil) == SQLITE_OK else { throw launchFailure(L("Registro no disponible.")) }
        defer { sqlite3_finalize(statement) }
        let transient = unsafeBitCast(-1, to: sqlite3_destructor_type.self)
        sqlite3_bind_text(statement, 1, kind, -1, transient); sqlite3_bind_text(statement, 2, id, -1, transient)
        guard sqlite3_step(statement) == SQLITE_DONE else { throw launchFailure(L("No se pudo guardar el registro.")) }
    }
    func records(_ kind: String) -> [[String: Any]] {
        var statement: OpaquePointer?
        guard sqlite3_prepare_v2(db, "SELECT id,value FROM records WHERE kind=? ORDER BY updated DESC", -1, &statement, nil) == SQLITE_OK else { return [] }
        defer { sqlite3_finalize(statement) }
        sqlite3_bind_text(statement, 1, kind, -1, unsafeBitCast(-1, to: sqlite3_destructor_type.self))
        var rows: [[String: Any]] = []
        while sqlite3_step(statement) == SQLITE_ROW {
            guard let raw = sqlite3_column_text(statement, 1), var value = (try? JSONSerialization.jsonObject(with: Data(String(cString: raw).utf8))) as? [String: Any] else { continue }
            value["recordId"] = String(cString: sqlite3_column_text(statement, 0)); rows.append(value)
        }
        return rows
    }
}

func workspaceSelfTests(_ temporary: URL) throws {
    let root = temporary.appendingPathComponent("workspace-tests")
    var store: WorkspaceStore? = try WorkspaceStore(root)
    try store?.put("checkpoint", id: "personal:thread", value: ["entries": [["summary": "Personal"]]])
    try store?.put("checkpoint", id: "work:thread", value: ["entries": [["summary": "Trabajo"]]])
    store = nil; store = try WorkspaceStore(root)
    precondition(store?.records("checkpoint").count == 2)
    let profile = HarnessProfile(id: "personal", name: "Personal", harness: "claude", executable: "/bin/cat", configRoot: temporary.path)
    let env = profile.environment(["ANTHROPIC_API_KEY": "parent-secret", "OPENAI_API_KEY": "parent-secret", "CLAUDECODE": "1", "CODEX_HOME": "/other", "PATH": "/bin"])
    precondition(env["ANTHROPIC_API_KEY"] == nil && env["OPENAI_API_KEY"] == nil && env["CLAUDECODE"] == nil && env["CODEX_HOME"] == nil)
    precondition(env["CLAUDE_CONFIG_DIR"] == temporary.path && env["PATH"] == "/bin")
    print("PASS: workspace restart persistence, profile-separated checkpoints and isolated authentication environment")
}

let storedAgentLimit = 100
extension Agent {
    var lastActivity: Double { max(stateAt ?? 0, taskAt ?? 0, responseAt ?? 0, contextAt ?? 0, goalUpdatedAt ?? 0) }
}

struct HarnessProfile: Codable {
    var id: String
    var name: String
    var harness: String
    var executable: String
    var configRoot: String
    var defaultProfile: Bool = false
    var enabled: Bool = true
    var qaEnabled: Bool = true
    var maxDelegates: Int = 4
    var policy: String = L("Implementa el resultado acordado y compruébalo. Separa mejoras opcionales del trabajo necesario. Reutiliza decisiones autorizadas dentro de su alcance. Los pushes directos a main y staging necesitan consentimiento explícito. Nunca conviertas pruebas omitidas en una validación.")
    func environment(_ base: [String: String]) -> [String: String] {
        var env = base
        // Authentication overrides from the parent terminal must not cross profiles.
        for key in Array(env.keys) where key.hasPrefix("ANTHROPIC_") || key.hasPrefix("CLAUDE_CODE_") || key.hasPrefix("OPENAI_") || ["CLAUDECODE", "CLAUDE_CONFIG_DIR", "CODEX_HOME"].contains(key) { env.removeValue(forKey: key) }
        if harness == "claude", !defaultProfile { env["CLAUDE_CONFIG_DIR"] = configRoot }
        if harness == "codex" { env["CODEX_HOME"] = configRoot }
        env["AGENT_ISLANDS_PROFILE"] = id
        return env
    }
}

extension AppDelegate {
    func loadWorkspace() {
        do {
            workspace = try WorkspaceStore(support)
            profiles = workspace?.records("profile").compactMap { try? JSONDecoder().decode(HarnessProfile.self, from: Data(json($0).utf8)) } ?? []
            // Closed sessions stay resumable from the provider history; the registry keeps the most recent ones.
            let stored = (workspace?.records("agent") ?? []).compactMap { try? JSONDecoder().decode(Agent.self, from: Data(json($0).utf8)) }
            let recent = stored.enumerated().sorted { $0.element.lastActivity != $1.element.lastActivity ? $0.element.lastActivity > $1.element.lastActivity : $0.offset < $1.offset }.map { $0.element }
            for (index, stale) in recent.enumerated() {
                if index >= storedAgentLimit { try? workspace?.delete("agent", id: stale.id); continue }
                var agent = stale
                agent.processRunning = false; agent.pid = 0; agent.state = "exited"; agents[agent.id] = agent
            }
        } catch { workspaceError = error.localizedDescription }
    }
    func refreshProfiles() {
        for harness in ["codex", "claude"] {
            guard let executable = binaries[harness] else { continue }
            let root = ProcessInfo.processInfo.environment[harness == "codex" ? "CODEX_HOME" : "CLAUDE_CONFIG_DIR"].flatMap { $0.isEmpty ? nil : $0 } ?? fm.homeDirectoryForCurrentUser.appendingPathComponent("." + harness).path
            if !profiles.contains(where: { $0.id == harness }) { profiles.append(HarnessProfile(id: harness, name: harness == "codex" ? "Codex" : "Claude Code", harness: harness, executable: executable, configRoot: root, defaultProfile: root == fm.homeDirectoryForCurrentUser.appendingPathComponent("." + harness).path)) }
            for suffix in ["personal", "work"] {
                let id = harness + "-" + suffix, path = root + "-" + suffix
                if fm.fileExists(atPath: path), !profiles.contains(where: { $0.id == id }) { profiles.append(HarnessProfile(id: id, name: (harness == "codex" ? "Codex" : "Claude") + " · " + (suffix == "personal" ? "Personal" : "Trabajo"), harness: harness, executable: executable, configRoot: path)) }
            }
        }
        persistProfiles()
    }
    func persistProfiles() {
        for profile in profiles { try? workspace?.put("profile", id: profile.id, value: (try? JSONSerialization.jsonObject(with: JSONEncoder().encode(profile))) ?? [:]) }
        let directory = support.appendingPathComponent("qa")
        try? fm.createDirectory(at: directory, withIntermediateDirectories: true, attributes: [.posixPermissions: 0o700])
        try? JSONEncoder().encode(profiles).write(to: directory.appendingPathComponent("profiles.json"), options: .atomic)
    }
    func profile(_ id: String?, harness: String) -> HarnessProfile? { profiles.first { $0.id == (id ?? harness) && $0.harness == harness && $0.enabled } }
    func profileRoot(_ profileID: String?, harness: String) -> URL {
        if let p = profile(profileID, harness: harness) { return URL(fileURLWithPath: p.configRoot) }
        return fm.homeDirectoryForCurrentUser.appendingPathComponent("." + harness)
    }
    func sameProfileIdentity(_ left: String?, _ right: String?, harness: String) -> Bool { profileRoot(left, harness: harness).resolvingSymlinksInPath().path == profileRoot(right, harness: harness).resolvingSymlinksInPath().path }
    func conversationKey(_ harness: String, _ id: String, _ profileID: String?) -> String { (profileID ?? harness) + ":" + id }
}
