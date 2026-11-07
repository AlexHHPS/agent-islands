import Foundation

struct ProjectWorkspace: Codable {
    var id: String
    var name: String
    var projectIds: [String]
}

extension AppDelegate {
    var activeProjectWorkspace: ProjectWorkspace? { projectWorkspaces.first { $0.id == activeWorkspaceId } }
    var scopedProjects: [Project] {
        guard let active = activeProjectWorkspace else { return projects }
        return active.projectIds.compactMap { id in projects.first { $0.id == id } }
    }
    func projectIsInScope(_ id: String) -> Bool { activeProjectWorkspace == nil || activeProjectWorkspace!.projectIds.contains(id) }
    func agentIsInScope(_ agent: Agent) -> Bool {
        guard let active = activeProjectWorkspace else { return true }
        return active.projectIds.contains(agent.projectId) && (agent.workspaceId == nil || agent.workspaceId == active.id) && (agent.executionProjectIds ?? [agent.projectId]).allSatisfy { active.projectIds.contains($0) }
    }
    func pathIsInScope(_ path: String) -> Bool {
        guard activeProjectWorkspace != nil else { return true }
        let candidate = URL(fileURLWithPath: path).resolvingSymlinksInPath().path
        return scopedProjects.contains { p in let root = URL(fileURLWithPath: p.path).resolvingSymlinksInPath().path; return candidate == root || candidate.hasPrefix(root + "/") }
    }
    func loadProjectWorkspaces() {
        projectWorkspaces = workspace?.records("projectWorkspace").compactMap { try? JSONDecoder().decode(ProjectWorkspace.self, from: Data(json($0).utf8)) } ?? []
        let saved = workspace?.records("preferences").first { $0["recordId"] as? String == "activeWorkspace" }?["workspaceId"] as? String
        activeWorkspaceId = projectWorkspaces.contains { $0.id == saved } ? saved : nil
    }
    func saveProjectWorkspace(_ body: [String: Any]) throws {
        guard let store = workspace else { throw launchFailure(workspaceError ?? "El registro no está disponible.") }
        let name = (body["name"] as? String ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        let ids = body["projectIds"] as? [String] ?? []
        guard !name.isEmpty, name.count <= 80, !ids.isEmpty, ids.count <= 30, Set(ids).count == ids.count,
              ids.allSatisfy({ id in projects.contains { $0.id == id } }) else { throw launchFailure("Escribe un nombre y elige entre 1 y 30 proyectos disponibles.") }
        let id = body["id"] as? String ?? UUID().uuidString
        guard UUID(uuidString: id) != nil else { throw launchFailure("El identificador del workspace no es válido.") }
        let group = ProjectWorkspace(id: id, name: name, projectIds: ids)
        try store.put("projectWorkspace", id: id, value: try JSONSerialization.jsonObject(with: JSONEncoder().encode(group)))
        projectWorkspaces.removeAll { $0.id == id }; projectWorkspaces.append(group)
        if body["activate"] as? Bool ?? true { try activateProjectWorkspace(id) }
        else { publish() }
    }
    func activateProjectWorkspace(_ id: String?) throws {
        guard id == nil || projectWorkspaces.contains(where: { $0.id == id }) else { throw launchFailure("Ese workspace ya no está disponible.") }
        guard let store = workspace else { throw launchFailure("El registro no está disponible.") }
        try store.put("preferences", id: "activeWorkspace", value: ["workspaceId": id ?? ""])
        activeWorkspaceId = id
        aiGeneration += 1; aiCredentialRequest = nil; aiTask?.cancel(); aiTask = nil
        if let selectedAgent, let agent = agents[selectedAgent], !agentIsInScope(agent) { self.selectedAgent = nil }
        publish()
    }
    func workspaceExecutionContext(_ group: ProjectWorkspace?, projects roots: [Project]) -> String {
        guard let group else { return "" }
        return "Workspace de ejecución: " + group.name + ". Proyectos incluidos:\n" + roots.map { "- " + $0.name + ": " + $0.path }.joined(separator: "\n") + "\nAcota el trabajo a estos proyectos. Coordina los cambios entre ellos y consulta las instrucciones de cada directorio. Este contexto no amplía permisos para despliegues ni pushes."
    }
}

func projectWorkspaceSelfTests(_ root: URL) throws {
    let app = AppDelegate(); app.workspace = try WorkspaceStore(root.appendingPathComponent("project-groups"))
    app.projects = [Project(id: "api", name: "API", path: root.appendingPathComponent("api").path), Project(id: "web", name: "Web", path: root.appendingPathComponent("web").path), Project(id: "other", name: "Otro", path: "/elsewhere")]
    let group = ProjectWorkspace(id: UUID().uuidString, name: "Producto", projectIds: ["web", "api"])
    try app.workspace!.put("projectWorkspace", id: group.id, value: try JSONSerialization.jsonObject(with: JSONEncoder().encode(group)))
    try app.workspace!.put("preferences", id: "activeWorkspace", value: ["workspaceId": group.id])
    app.loadProjectWorkspaces()
    precondition(app.scopedProjects.map { $0.id } == ["web", "api"] && !app.projectIsInScope("other"))
    precondition(app.pathIsInScope(root.appendingPathComponent("api/src").path) && !app.pathIsInScope(root.appendingPathComponent("api-other").path))
    var agent = Agent(id: "test", projectId: "api", name: "Test", harness: "claude", state: "session", managed: true, pid: 0)
    agent.workspaceId = group.id; agent.executionProjectIds = ["api", "web"]
    precondition(app.agentIsInScope(agent)); agent.executionProjectIds = ["api", "other"]; precondition(!app.agentIsInScope(agent))
    agent.executionProjectIds = ["api"]; agent.workspaceId = UUID().uuidString; precondition(!app.agentIsInScope(agent))
    let extra = root.appendingPathComponent("web with spaces").path
    for harness in ["claude", "codex"] {
        let args = try harnessArguments(harness, base: [], cwd: root.path, resume: nil, bypass: false, hooks: nil, notify: nil, additionalDirectories: [extra, extra])
        precondition(args.filter { $0 == extra }.count == 1 && args.contains("--add-dir"))
    }
    print("PASS: persistent multi-project workspaces, ordered roots, path boundaries and frozen execution scope")
}
