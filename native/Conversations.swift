import Foundation

struct SavedConversation: Codable {
    var id: String
    var harness: String
    var title: String
    var projectPath: String
    var updatedAt: Double
    var inUse: Bool = false
    var profileId: String? = nil
    var profileName: String? = nil
}

func launchFailure(_ message: String) -> NSError {
    NSError(domain: "Agent Islands", code: 10, userInfo: [NSLocalizedDescriptionKey: message])
}

// Arguments remain separate argv entries. No prompt, path or session ID is evaluated by a shell.
func harnessArguments(_ harness: String, base: [String], cwd: String, resume: String?, bypass: Bool, hooks: String?, notify: String?, remote: String? = nil, additionalDirectories: [String] = []) throws -> [String] {
    if let resume, UUID(uuidString: resume) == nil { throw launchFailure("La conversación seleccionada no tiene un identificador válido.") }
    guard !bypass || harness == "codex" || harness == "claude" else { throw launchFailure("Bypass está disponible para Codex y Claude Code.") }
    if harness == "codex", resume != nil, remote != nil, bypass { throw launchFailure("Al reconectar al servidor de Codex se conservan los permisos existentes. Desactiva Bypass para continuar esta conversación.") }
    var args = base
    if ["codex", "claude"].contains(harness) {
        let directories = Array(Set(additionalDirectories)).sorted()
        for directory in directories { guard directory.hasPrefix("/"), !directory.contains("\0") else { throw launchFailure("El directorio adicional no es válido.") } }
        if harness == "claude", !directories.isEmpty { args += ["--add-dir"] + directories }
        else { for directory in directories { args += ["--add-dir", directory] } }
    }
    if harness == "codex" {
        args += ["--no-alt-screen", "-C", cwd, "-c", "check_for_update_on_startup=false"]
        if resume != nil, let remote { args += ["--remote", remote] }
        if let notify { args += ["-c", "notify=" + notify.replacingOccurrences(of: "\\/", with: "/")] }
        args += ["-c", "tui.notifications=[\"approval-requested\"]", "-c", "tui.notification_method=\"osc9\"", "-c", "tui.notification_condition=\"always\""]
        if bypass { args.append("--dangerously-bypass-approvals-and-sandbox") }
        if let resume { args += ["resume", resume] }
    } else if harness == "claude" {
        if let hooks { args += ["--settings", hooks] }
        if bypass { args += ["--dangerously-skip-permissions"] }
        if let resume { args += ["--resume", resume] }
    } else if resume != nil { throw launchFailure("Este harness no ofrece un selector de conversaciones integrado.") }
    return args
}

func claudeConversation(_ url: URL) -> SavedConversation? {
    guard UUID(uuidString: url.deletingPathExtension().lastPathComponent) != nil,
          let handle = try? FileHandle(forReadingFrom: url) else { return nil }
    defer { try? handle.close() }
    let size = (try? handle.seekToEnd()) ?? 0
    try? handle.seek(toOffset: 0)
    let prefix = (try? handle.read(upToCount: 262144)) ?? Data()
    var bytes = prefix
    if size > 262144 {
        try? handle.seek(toOffset: max(262144, size - min(size, 131072)))
        bytes.append(10); bytes.append((try? handle.read(upToCount: 131072)) ?? Data())
    }
    var cwd: String?, firstPrompt: String?, title: String?
    for line in String(decoding: bytes, as: UTF8.self).split(separator: "\n") {
        guard let item = (try? JSONSerialization.jsonObject(with: Data(line.utf8))) as? [String: Any] else { continue }
        if cwd == nil, let path = item["cwd"] as? String, path.hasPrefix("/") { cwd = path }
        let type = item["type"] as? String ?? ""
        if type == "custom-title", let text = item["customTitle"] as? String, !text.isEmpty { title = text }
        else if title == nil, type == "ai-title", let text = item["aiTitle"] as? String { title = text }
        else if title == nil, type == "summary", let text = item["summary"] as? String { title = text }
        if firstPrompt == nil, type == "user", item["isMeta"] as? Bool != true, item["isSidechain"] as? Bool != true,
           let message = item["message"] as? [String: Any] {
            let content = message["content"]
            var text = content as? String
            if text == nil, let blocks = content as? [[String: Any]], let block = blocks.first(where: { $0["type"] as? String == "text" }) { text = block["text"] as? String }
            if let text, !text.hasPrefix("<"), !text.isEmpty { firstPrompt = text }
        }
    }
    guard let cwd, FileManager.default.fileExists(atPath: cwd) else { return nil }
    let modified = (try? url.resourceValues(forKeys: [.contentModificationDateKey]).contentModificationDate)?.timeIntervalSince1970 ?? 0
    let rawTitle = title ?? firstPrompt ?? "Claude · " + String(url.deletingPathExtension().lastPathComponent.prefix(8))
    let cleanTitle = String(rawTitle.split(whereSeparator: { $0.isNewline }).first ?? "Conversación de Claude")
    return SavedConversation(id: url.deletingPathExtension().lastPathComponent, harness: "claude", title: String(cleanTitle.prefix(180)), projectPath: cwd, updatedAt: modified)
}

extension AppDelegate {
    func readSavedConversations(_ harness: String, profileID: String? = nil) -> [SavedConversation] {
        if harness == "codex" {
            let root = profileRoot(profileID, harness: harness)
            let db = root.appendingPathComponent("state_5.sqlite")
            var rows = sqliteRows(db, query: "SELECT id,cwd,COALESCE(name,title) AS title,updated_at FROM threads WHERE archived=0 ORDER BY updated_at DESC LIMIT 2000")
            if rows.isEmpty { rows = sqliteRows(db, query: "SELECT id,cwd,title,updated_at FROM threads WHERE archived=0 ORDER BY updated_at DESC LIMIT 2000") }
            return rows.compactMap { row in
                guard let id = row["id"], UUID(uuidString: id) != nil, let cwd = row["cwd"], cwd.hasPrefix("/"), fm.fileExists(atPath: cwd) else { return nil }
                let title = String((row["title"] ?? "Codex").prefix(180))
                return SavedConversation(id: id, harness: harness, title: title, projectPath: cwd, updatedAt: Double(row["updated_at"] ?? "") ?? 0, profileId: profileID ?? harness, profileName: profile(profileID, harness: harness)?.name)
            }
        }
        guard harness == "claude" else { return [] }
        let root = profileRoot(profileID, harness: harness)
        guard let directories = try? fm.contentsOfDirectory(at: root.appendingPathComponent("projects"), includingPropertiesForKeys: [.isDirectoryKey]) else { return [] }
        var files: [URL] = []
        for directory in directories {
            if let entries = try? fm.contentsOfDirectory(at: directory, includingPropertiesForKeys: [.contentModificationDateKey]) { files += entries.filter { $0.pathExtension == "jsonl" && UUID(uuidString: $0.deletingPathExtension().lastPathComponent) != nil } }
        }
        files.sort { ((try? $0.resourceValues(forKeys: [.contentModificationDateKey]).contentModificationDate) ?? .distantPast) > ((try? $1.resourceValues(forKeys: [.contentModificationDateKey]).contentModificationDate) ?? .distantPast) }
        return files.prefix(1000).compactMap(claudeConversation).map { saved -> SavedConversation in var saved = saved; saved.profileId = profileID ?? harness; saved.profileName = profile(profileID, harness: harness)?.name; return saved }.sorted { $0.updatedAt > $1.updatedAt }
    }
}

// Rejoin the daemon that already owns loaded conversations instead of opening
// an independent writer against the same persisted thread.
func localCodexResumeEndpoint(root providedRoot: URL? = nil) -> String? {
    let root = providedRoot ?? ProcessInfo.processInfo.environment["CODEX_HOME"].flatMap { $0.isEmpty ? nil : URL(fileURLWithPath: $0) } ?? FileManager.default.homeDirectoryForCurrentUser.appendingPathComponent(".codex")
    let socket = root.appendingPathComponent("app-server-control/app-server-control.sock").resolvingSymlinksInPath()
    guard let values = try? FileManager.default.attributesOfItem(atPath: socket.path), values[.type] as? FileAttributeType == .typeSocket else { return nil }
    return "unix://" + socket.path
}
