import Cocoa

extension AppDelegate {
    func qaRecords(_ kind: String) -> [[String: Any]] {
        guard ["run", "contract"].contains(kind) else { return [] }
        return sqliteRows(support.appendingPathComponent("qa/qa.sqlite"), query: "SELECT value FROM records WHERE kind='\(kind)' ORDER BY updated DESC LIMIT 100").compactMap { row in
            guard let raw = row["value"] else { return nil }; return (try? JSONSerialization.jsonObject(with: Data(raw.utf8))) as? [String: Any]
        }
    }
    func qaEvidence(_ agent: Agent) -> [[String: Any]] {
        qaRecords("run").filter { row in row["profileId"] as? String == (agent.profileId ?? agent.harness) && row["projectId"] as? String == agent.projectId && (row["agentId"] as? String == agent.id || agent.threadId != nil && row["threadId"] as? String == agent.threadId) }.prefix(5).map { row in
            row.filter { ["id", "name", "status", "revisionVerified", "revisionBefore", "revisionAfter", "finishedAt", "message", "checks"].contains($0.key) }
        }
    }
    func taskContract(_ agent: Agent) -> [String: Any]? {
        qaRecords("contract").first { row in row["profileId"] as? String == (agent.profileId ?? agent.harness) && (agent.threadId != nil ? (row["threadId"] as? String == agent.threadId || row["agentId"] as? String == agent.id && row["threadId"] == nil) : row["agentId"] as? String == agent.id) }
    }
    func qaNode() -> String? {
        let bundled = Bundle.main.resourceURL!.appendingPathComponent("qa/runtime/bin/node").path
        if fm.isExecutableFile(atPath: bundled) { return bundled }
        let managed = support.appendingPathComponent("qa/runtime/bin/node").path
        if fm.isExecutableFile(atPath: managed) { return managed }
        return path.split(separator: ":").map { String($0) + "/node" }.first { fm.isExecutableFile(atPath: $0) }
    }
    func qaScript() -> String { Bundle.main.resourceURL!.appendingPathComponent("qa/service.mjs").path }
    func qaMCP(_ profile: HarnessProfile, projectIds: [String]? = nil) -> [String: Any]? {
        guard profile.qaEnabled, let node = qaNode(), fm.fileExists(atPath: qaScript()) else { return nil }
        return ["command": node, "args": ["--disable-warning=ExperimentalWarning", qaScript(), "--mcp", "--root", support.appendingPathComponent("qa").path, "--profile", profile.id] + (projectIds.map { ["--project-ids", json($0)] } ?? [])]
    }
    func qaCall(_ body: [String: Any]) {
        let requestID = body["requestId"] as? String ?? UUID().uuidString
        let method = body["method"] as? String ?? "snapshot"
        if method.hasPrefix("ai.") { aiSettingsOperation(body, requestID: requestID, method: method); return }
        if method == "profile.save" {
            do { try saveProfile(body["params"] as? [String: Any] ?? [:]); publish(); emit("operationsResult", ["requestId": requestID, "method": method, "result": ["saved": true]]) }
            catch { emit("operationsResult", ["requestId": requestID, "method": method, "error": error.localizedDescription]) }; return
        }
        if method == "profile.health" || method == "profile.login" || method == "instructions.audit" { profileOperation(body, requestID: requestID, method: method); return }
        guard let node = qaNode() else { emit("operationsResult", ["requestId": requestID, "method": method, "error": "Node no está instalado. Usa Preparar QA para instalar el runtime."]); return }
        var params = body["params"] as? [String: Any] ?? [:]
        if activeProjectWorkspace != nil { params["projectIds"] = scopedProjects.map { $0.id } } else { params.removeValue(forKey: "projectIds") }
        if method.hasPrefix("browser."), method != "browser.install" {
            do { params = try browserParameters(params) }
            catch { emit("operationsResult", ["requestId": requestID, "method": method, "error": error.localizedDescription]); return }
        }
        if method == "environment.save", let projectID = params["projectId"] as? String, !scopedProjects.contains(where: { $0.id == projectID && $0.path == params["projectPath"] as? String }) { emit("operationsResult", ["requestId": requestID, "method": method, "error": "Selecciona un directorio de proyecto activo."]); return }
        if qaClient == nil {
            var environment = ProcessInfo.processInfo.environment; environment["PATH"] = path
            qaClient = QAClient(node: node, script: qaScript(), root: support.appendingPathComponent("qa").path, environment: environment)
        }
        let owner = params["agentId"] as? String
        qaClient?.request(method, params: params) { reply in
            if let result = reply["result"] as? [String: Any], let ref = result["reference"] as? [String: Any], let owner {
                do { try self.registerVisualReference(ref, owner: owner) }
                catch { self.emit("operationsResult", ["requestId": requestID, "method": method, "error": error.localizedDescription]); return }
            }
            self.emit("operationsResult", reply.merging(["requestId": requestID, "method": method]) { _, new in new })
        }
    }

    func saveProfile(_ value: [String: Any]) throws {
        let harness = value["harness"] as? String ?? "claude"
        guard ["codex", "claude"].contains(harness), let name = value["name"] as? String, !name.isEmpty,
              let root = value["configRoot"] as? String, root.hasPrefix("/"),
              let executable = value["executable"] as? String, executable.hasPrefix("/"), fm.isExecutableFile(atPath: executable) else { throw launchFailure("Indica nombre, motor, configuración absoluta y un ejecutable instalado.") }
        var directory: ObjCBool = false
        guard fm.fileExists(atPath: root, isDirectory: &directory), directory.boolValue else { throw launchFailure("El directorio de configuración no existe.") }
        let id = value["id"] as? String ?? UUID().uuidString
        let previous = profiles.first { $0.id == id }
        if let previous { guard previous.harness == harness, previous.configRoot == root else { throw launchFailure("Crea otro perfil para cambiar de motor o identidad.") } }
        let profile = HarnessProfile(id: id, name: String(name.prefix(80)), harness: harness, executable: executable, configRoot: root, defaultProfile: previous?.defaultProfile ?? false, enabled: value["enabled"] as? Bool ?? true, qaEnabled: value["qaEnabled"] as? Bool ?? true, maxDelegates: max(1, min(10, value["maxDelegates"] as? Int ?? 4)), policy: String((value["policy"] as? String ?? previous?.policy ?? HarnessProfile(id: "", name: "", harness: "", executable: "", configRoot: "").policy).prefix(6000)))
        profiles.removeAll { $0.id == id }; profiles.append(profile); persistProfiles()
    }
    func profileOperation(_ body: [String: Any], requestID: String, method: String) {
        let params = body["params"] as? [String: Any] ?? [:]
        guard let id = params["profileId"] as? String, let profile = profiles.first(where: { $0.id == id }) else { emit("operationsResult", ["requestId": requestID, "method": method, "error": "Perfil no disponible."]); return }
        if method == "profile.login" {
            do {
                let project = projects.first ?? Project(id: "account", name: "Acceso", path: fm.homeDirectoryForCurrentUser.path)
                let agent = try launch(project, harness: "shell", executable: profile.executable, args: profile.harness == "claude" ? ["auth", "login"] : ["login"], name: "Acceso · " + profile.name, profileID: id)
                emit("select", ["id": agent]); emit("operationsResult", ["requestId": requestID, "method": method, "result": ["opened": true]])
            } catch { emit("operationsResult", ["requestId": requestID, "method": method, "error": error.localizedDescription]) }; return
        }
        DispatchQueue.global(qos: .utility).async {
            var result: [String: Any] = ["profileId": id, "checkedAt": Date().timeIntervalSince1970, "executableAvailable": fm.isExecutableFile(atPath: profile.executable), "configurationAvailable": fm.fileExists(atPath: profile.configRoot)]
            if method == "instructions.audit" {
                let root = URL(fileURLWithPath: profile.configRoot), file = root.appendingPathComponent(profile.harness == "claude" ? "CLAUDE.md" : "AGENTS.md")
                let raw = (try? String(contentsOf: file, encoding: .utf8)) ?? ""
                let imports = raw.split(separator: "\n").filter { $0.hasPrefix("@") }.map { String($0.dropFirst()).trimmingCharacters(in: .whitespaces) }
                result["instructionBytes"] = raw.utf8.count
                result["importCount"] = imports.count
                result["importBytes"] = imports.reduce(0) { $0 + ((try? Data(contentsOf: root.appendingPathComponent($1)).count) ?? 0) }
                result["maxDelegates"] = profile.maxDelegates; result["policy"] = profile.policy
            } else {
                let process = Process(), output = Pipe(); process.executableURL = URL(fileURLWithPath: profile.executable)
                process.environment = profile.environment(ProcessInfo.processInfo.environment)
                process.arguments = profile.harness == "claude" ? ["auth", "status"] : ["login", "status"]
                process.standardOutput = output; process.standardError = output
                let timeout = DispatchWorkItem { if process.isRunning { process.terminate() } }
                do {
                    try process.run(); DispatchQueue.global().asyncAfter(deadline: .now() + 15, execute: timeout)
                    let bytes = output.fileHandleForReading.readDataToEndOfFile(); process.waitUntilExit(); timeout.cancel()
                    result["authenticated"] = process.terminationStatus == 0
                    if profile.harness == "claude", let auth = (try? JSONSerialization.jsonObject(with: bytes)) as? [String: Any] {
                        result["account"] = auth["email"] as? String ?? "Cuenta del perfil"
                        result["authMethod"] = auth["authMethod"] as? String ?? ""
                        result["effectiveConfigRoot"] = auth["configDirectory"] as? String ?? profile.configRoot
                    }
                } catch { result["error"] = "No se pudo consultar el acceso del perfil." }
            }
            DispatchQueue.main.async { self.emit("operationsResult", ["requestId": requestID, "method": method, "result": result]) }
        }
    }
    func checkpointOperation(_ body: [String: Any]) throws {
        guard let workspace else { throw launchFailure(workspaceError ?? "El registro no está disponible.") }
        if let values = body["records"] as? [[String: Any]] {
            // One bounded idempotent import from the former WebView storage.
            for row in values.prefix(2000) {
                guard let key = row["key"] as? String, let entries = row["entries"] as? [[String: Any]], key.utf8.count < 2000 else { continue }
                if !workspace.records("checkpoint").contains(where: { $0["recordId"] as? String == key }) { try workspace.put("checkpoint", id: key, value: ["entries": Array(entries.prefix(20))]) }
            }
        }
        if let key = body["key"] as? String, let entries = body["entries"] as? [[String: Any]], key.utf8.count < 2000 { try workspace.put("checkpoint", id: key, value: ["entries": Array(entries.prefix(20))]) }
        var rows: [String: Any] = [:]
        for row in workspace.records("checkpoint") { if let key = row["recordId"] as? String { rows[key] = row["entries"] ?? [] } }
        emit("checkpointsLoaded", ["records": rows])
    }
}
