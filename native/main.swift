import Cocoa
import WebKit
import UserNotifications
import AVFoundation
import Speech
import SQLite3

let fm = FileManager.default
let support = (CommandLine.arguments.contains("--smoke-test") || CommandLine.arguments.contains("--smoke-codex")) ? fm.temporaryDirectory.appendingPathComponent("islands-test-support-" + UUID().uuidString, isDirectory: true) : fm.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0].appendingPathComponent("Agent Islands", isDirectory: true)
let eventDirectory = support.appendingPathComponent("events", isDirectory: true)
func json(_ value: Any) -> String { String(data: (try? JSONSerialization.data(withJSONObject: value, options: [.sortedKeys, .withoutEscapingSlashes])) ?? Data("{}".utf8), encoding: .utf8)! }
func jsonString(_ value: String) -> String { String(data: try! JSONEncoder().encode(value), encoding: .utf8)!.replacingOccurrences(of: "\\/", with: "/") }
func shellQuote(_ s: String) -> String { "'" + s.replacingOccurrences(of: "'", with: "'\"'\"'") + "'" }

// Hook invocations never initialize AppKit or open a window. No global harness configuration is edited.
if let index = CommandLine.arguments.firstIndex(of: "--event"), CommandLine.arguments.count > index + 2 {
    let id = CommandLine.arguments[index + 1], state = CommandLine.arguments[index + 2]
    guard UUID(uuidString: id) != nil else { exit(64) }
    let payload: Any
    if CommandLine.arguments.count > index + 3 {
        payload = (try? JSONSerialization.jsonObject(with: Data(CommandLine.arguments[index + 3].utf8))) ?? [:]
    } else {
        let bytes = FileHandle.standardInput.readDataToEndOfFile()
        payload = (try? JSONSerialization.jsonObject(with: bytes)) ?? [:]
    }
    try? fm.createDirectory(at: eventDirectory, withIntermediateDirectories: true, attributes: [.posixPermissions: 0o700])
    let allowed: Set<String> = ["agent_id", "agent_type", "hook_event_name", "tool_name", "last_assistant_message", "last-assistant-message", "message", "thread-id", "session_id", "islands_mode"]
    var safePayload = (payload as? [String: Any] ?? [:]).filter { allowed.contains($0.key) }
    // The app keeps at most 12,000 characters and discards oversized event files.
    for (key, value) in safePayload { if let text = value as? String, text.count > 16_000 { safePayload[key] = String(text.prefix(16_000)) } }
    if safePayload["tool_name"] as? String == "AskUserQuestion", let input = (payload as? [String: Any])?["tool_input"] as? [String: Any], let questions = input["questions"] as? [[String: Any]] {
        safePayload["questions"] = questions.prefix(4).map { q -> [String: Any] in
            ["question": String((q["question"] as? String ?? "").prefix(1000)), "multiSelect": q["multiSelect"] as? Bool ?? false, "options": (q["options"] as? [[String: Any]] ?? []).prefix(8).map { ["label": String(($0["label"] as? String ?? "").prefix(300))] }]
        }
    }
    let bytes = Data(json(["id": id, "state": state, "at": Date().timeIntervalSince1970, "payload": safePayload]).utf8)
    try? bytes.write(to: eventDirectory.appendingPathComponent(id + "-" + UUID().uuidString + ".json"), options: .atomic)
    exit(0)
}

struct Project: Codable {
    var id: String
    var name: String
    var path: String
}
func matchingProject(_ cwd: String, in projects: [Project]) -> Project? {
    // An inferred home-directory island must not absorb every nested project.
    projects.filter { cwd == $0.path || (!$0.id.hasPrefix("observed-") && cwd.hasPrefix($0.path + "/")) }.max { $0.path.count < $1.path.count }
}
struct Agent: Codable {
    var id: String
    var projectId: String
    var name: String
    var harness: String
    var state: String
    var managed: Bool
    var pid: Int32
    var message: String = ""
    var parentId: String? = nil
    var mode: String = "work"
    var threadId: String? = nil
    var goalStatus: String? = nil
    var goalRawStatus: String? = nil
    var stateAt: Double? = nil
    var goalUpdatedAt: Double? = nil
    var goalObjective: String? = nil
    var tokenBudget: Int? = nil
    var tokensUsed: Int? = nil
    var lastTask: String? = nil
    var taskAt: Double? = nil
    var lastResponse: String? = nil
    var responseAt: Double? = nil
    var pendingContext: String? = nil
    var contextKind: String? = nil
    var contextResponse: String? = nil
    var contextAt: Double? = nil
    var bypassPermissions: Bool = false
    var processRunning: Bool? = nil
    var permissionsInherited: Bool = false
    var profileId: String? = nil
    var profileName: String? = nil
    var workspaceId: String? = nil
    var workspaceName: String? = nil
    var executionProjectIds: [String]? = nil
    var executionContext: String? = nil
}
struct FileEntry: Codable { var name: String; var path: String; var directory: Bool }

func confinedURL(root: String, relative: String) throws -> URL {
    guard let baseResolved = realpath(root, nil) else { throw NSError(domain: "Islands", code: 2, userInfo: [NSLocalizedDescriptionKey: L("La carpeta del proyecto no está disponible.")]) }
    defer { free(baseResolved) }
    let basePath = String(cString: baseResolved)
    let base = URL(fileURLWithPath: basePath)
    let requested = base.appendingPathComponent(relative).standardizedFileURL
    // All editor operations target existing files/directories. realpath resolves
    // every component, including symlinks whose final target does not exist.
    guard !relative.hasPrefix("/"), !relative.contains("\0"), let resolved = realpath(requested.path, nil) else {
        throw NSError(domain: "Islands", code: 2, userInfo: [NSLocalizedDescriptionKey: L("La ruta no existe o no está disponible.")])
    }
    defer { free(resolved) }
    let candidatePath = String(cString: resolved)
    let candidate = URL(fileURLWithPath: candidatePath)
    guard candidatePath == basePath || candidatePath.hasPrefix(basePath + "/") else {
        throw NSError(domain: "Islands", code: 1, userInfo: [NSLocalizedDescriptionKey: L("La ruta queda fuera de este proyecto.")])
    }
    return candidate
}
func revision(_ url: URL) throws -> String {
    let a = try fm.attributesOfItem(atPath: url.path)
    return "\((a[.modificationDate] as? Date)?.timeIntervalSince1970 ?? 0):\(a[.size] ?? 0)"
}

final class TerminalSignals {
    private var escaped = false
    private var inOSC = false
    private var oscEscape = false
    private var buffer = Data()
    func consume(_ data: Data) -> [String] {
        var notices: [String] = []
        func finish() {
            let value = String(decoding: buffer, as: UTF8.self)
            if value.hasPrefix("9;") { notices.append(String(value.dropFirst(2))) }
            else if value.hasPrefix("777;notify;") { notices.append(String(value.dropFirst(11)).replacingOccurrences(of: ";", with: " · ")) }
            buffer.removeAll(keepingCapacity: true); inOSC = false; oscEscape = false
        }
        for byte in data {
            if inOSC {
                if byte == 7 || (oscEscape && byte == 92) { finish() }
                else if byte == 27 { oscEscape = true }
                else { if oscEscape { buffer.append(27); oscEscape = false }; if buffer.count < 16384 { buffer.append(byte) } }
            } else if escaped { escaped = false; if byte == 93 { inOSC = true; buffer.removeAll(keepingCapacity: true) } }
            else if byte == 27 { escaped = true }
            else if byte == 7 { notices.append(L("La terminal solicita tu atención.")) }
        }
        return notices
    }
}

// Compare canonical paths symmetrically: macOS may expose /var via /private/var.
func isBundledUIURL(_ candidate: URL?, expected: URL) -> Bool {
    guard let candidate, candidate.isFileURL else { return false }
    return candidate.resolvingSymlinksInPath().standardizedFileURL.path == expected.resolvingSymlinksInPath().standardizedFileURL.path
}

if CommandLine.arguments.contains("--self-test") {
    do {
        let root = fm.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        try fm.createDirectory(at: root, withIntermediateDirectories: true)
        defer { try? fm.removeItem(at: root) }
        AppLanguage.set("es", persist: false)
        localizationSelfTests()
        agentStateSelfTests()
        try aiConfigurationSelfTests()
        try Data().write(to: root.appendingPathComponent("safe.txt"))
        _ = try confinedURL(root: root.path, relative: "safe.txt")
        let alias = root.appendingPathComponent("alias.html")
        try fm.createSymbolicLink(at: alias, withDestinationURL: root.appendingPathComponent("safe.txt"))
        precondition(isBundledUIURL(alias, expected: root.appendingPathComponent("safe.txt")))
        precondition(isBundledUIURL(root.appendingPathComponent("safe.txt"), expected: alias))
        precondition(!isBundledUIURL(root.appendingPathComponent("outside.html"), expected: alias))
        precondition(!isBundledUIURL(URL(string: "https://example.test/index.html"), expected: alias))
        do { _ = try confinedURL(root: root.path, relative: "../../outside"); fatalError("Traversal accepted") } catch {}
        try fm.createSymbolicLink(at: root.appendingPathComponent("link"), withDestinationURL: root.deletingLastPathComponent())
        do { _ = try confinedURL(root: root.path, relative: "link"); fatalError("Symlink escape accepted") } catch {}
        let signals = TerminalSignals()
        precondition(signals.consume(Data("\u{1b}]0;terminal title\u{7}".utf8)).isEmpty)
        precondition(signals.consume(Data("\u{1b}]9;Necesito ".utf8)).isEmpty)
        precondition(signals.consume(Data("permiso\u{1b}\\".utf8)) == [L("Necesito permiso")])
        precondition(signals.consume(Data([7])).count == 1)
        precondition(matchingProject("/home/person/project", in: [Project(id: "observed-home", name: "Home", path: "/home/person")]) == nil)
        precondition(matchingProject("/repo/src", in: [Project(id: "chosen", name: "Repo", path: "/repo")])?.id == "chosen")
        let conversationId = "01900000-0000-7000-8000-000000000001"
        let codexArgs = try harnessArguments("codex", base: [], cwd: root.path + "/with spaces", resume: conversationId, bypass: true, hooks: nil, notify: "[]")
        precondition(codexArgs.suffix(2) == ["resume", conversationId])
        precondition(codexArgs.contains("--dangerously-bypass-approvals-and-sandbox") && codexArgs.contains(root.path + "/with spaces"))
        let attachedArgs = try harnessArguments("codex", base: [], cwd: root.path, resume: conversationId, bypass: false, hooks: nil, notify: nil, remote: "unix:///tmp/islands-test.sock")
        precondition(attachedArgs.contains("--remote") && attachedArgs.contains("unix:///tmp/islands-test.sock") && attachedArgs.suffix(2) == ["resume", conversationId])
        let standaloneArgs = try harnessArguments("codex", base: [], cwd: root.path, resume: nil, bypass: false, hooks: nil, notify: nil, remote: "unix:///tmp/islands-test.sock")
        precondition(!standaloneArgs.contains("--remote"), "New agents must retain their own per-process configuration")
        let claudeArgs = try harnessArguments("claude", base: [], cwd: root.path, resume: conversationId, bypass: true, hooks: "{}", notify: nil)
        precondition(claudeArgs == ["--settings", "{}", "--dangerously-skip-permissions", "--resume", conversationId])
        let normal = try harnessArguments("codex", base: [], cwd: root.path, resume: nil, bypass: false, hooks: nil, notify: nil)
        precondition(!normal.contains(where: { $0.contains("dangerously") }) && !normal.contains("resume"))
        do { _ = try harnessArguments("codex", base: [], cwd: root.path, resume: "bad;id", bypass: false, hooks: nil, notify: nil); fatalError("Invalid session accepted") } catch {}
        do { _ = try harnessArguments("shell", base: [], cwd: root.path, resume: nil, bypass: true, hooks: nil, notify: nil); fatalError("Unsupported bypass accepted") } catch {}
        let transcript = root.appendingPathComponent(conversationId + ".jsonl")
        let lines: [[String: Any]] = [["type": "user", "cwd": root.path, "message": ["content": [["type": "text", "text": "First prompt"]]]], ["type": "ai-title", "aiTitle": "Saved conversation"], ["type": "custom-title", "customTitle": "My renamed session"]]
        try Data(lines.map { json($0) }.joined(separator: "\n").utf8).write(to: transcript)
        let saved = claudeConversation(transcript)
        precondition(saved?.id == conversationId && saved?.projectPath == root.path && saved?.title == "My renamed session")
        let notifyValue = json([Bundle.main.executablePath!, "--event", conversationId, "ready"])
        precondition(!notifyValue.contains("\\/"), "Notify must be a TOML-compatible array, not escaped JSON")
        let checkArgs = try harnessArguments("codex", base: [], cwd: root.path, resume: nil, bypass: false, hooks: nil, notify: notifyValue)
        var configArguments = ["features", "list"]
        for i in checkArgs.indices where checkArgs[i] == "-c" { configArguments += ["-c", checkArgs[i + 1]] }
        let candidates = (ProcessInfo.processInfo.environment["PATH"] ?? "/opt/homebrew/bin").split(separator: ":").map { String($0) + "/codex" }
        if let codex = candidates.first(where: { fm.isExecutableFile(atPath: $0) }) {
            configArguments += ["-c", "mcp_servers.islands-qa.command=" + jsonString("/tmp/path with spaces/node"), "-c", "mcp_servers.islands-qa.args=" + json(["--mcp", "--profile", "claude-personal"])]
            let check = Process(), output = Pipe(); check.executableURL = URL(fileURLWithPath: codex); check.arguments = configArguments; check.standardOutput = output; check.standardError = output
            try check.run(); let bytes = output.fileHandleForReading.readDataToEndOfFile(); check.waitUntilExit()
            precondition(check.terminationStatus == 0, "Codex rejected generated config: " + String(decoding: bytes, as: UTF8.self))
            print("PASS: installed Codex accepts the exact generated notification config")
        }
        try workspaceSelfTests(root)
        try projectWorkspaceSelfTests(root)
        print("PASS: resume argv, explicit per-session bypass, defaults and conversation metadata")
        print("PASS: native project boundary and symlink checks")
        print("PASS: terminal notifications across chunks, OSC titles ignored")
        print("PASS: inferred parent directories do not absorb project islands")
    } catch { print(error); exit(1) }
    exit(0)
}

final class Session {
    let process = Process()
    let input = Pipe()
    let output = Pipe()
    var history = Data()
    var lastBell = Date.distantPast
    var stopped = false
    let signals = TerminalSignals()
    func packet(_ type: UInt8, _ data: Data) {
        guard process.isRunning else { return }
        let n = UInt32(data.count)
        var packet = Data([type, UInt8((n >> 24) & 255), UInt8((n >> 16) & 255), UInt8((n >> 8) & 255), UInt8(n & 255)])
        packet.append(data)
        try? input.fileHandleForWriting.write(contentsOf: packet)
    }
    func stop() { stopped = true; if process.isRunning { process.terminate() } }
}

final class AppDelegate: NSObject, NSApplicationDelegate, WKScriptMessageHandler, WKNavigationDelegate, WKUIDelegate, UNUserNotificationCenterDelegate {
    var window: NSWindow!
    var web: WKWebView!
    var projects: [Project] = []
    var agents: [String: Agent] = [:]
    var sessions: [String: Session] = [:]
    var savedConversations: [String: SavedConversation] = [:]
    var selectedAgent: String?
    var path = ProcessInfo.processInfo.environment["PATH"] ?? "/usr/bin:/bin:/usr/sbin:/sbin"
    var binaries: [String: String] = [:]
    var profiles: [HarnessProfile] = []
    var projectWorkspaces: [ProjectWorkspace] = []
    var activeWorkspaceId: String?
    var workspace: WorkspaceStore?
    var workspaceError: String?
    var qaProcesses: [String: Process] = [:]
    var qaClient: QAClient?
    var scanBusy = false
    var dockerBusy = false
    var dockerActions = Set<String>()
    var dockerTestCompletion: (() -> Void)?
    var docker: [String: Any] = ["connected": false, "containers": [], "status": "checking"]
    var timer: Timer?
    var statusItem: NSStatusItem!
    var notifications = UserDefaults.standard.bool(forKey: "notifications")
    var voice = UserDefaults.standard.bool(forKey: "voice")
    let synthesizer = AVSpeechSynthesizer()
    var audioEngine: AVAudioEngine?
    var speechTask: SFSpeechRecognitionTask?
    var speechRequest: SFSpeechAudioBufferRecognitionRequest?
    let boot = Date()
    var launched = false
    var startupResumeHandled = false
    var pageReady = false
    var aiTask: URLSessionDataTask?
    var aiGeneration = 0
    var aiCredential: String?
    var aiCredentialLoading = false
    var aiCredentialRequest: [String: Any]?
    var attachments: [String: URL] = [:]
    var visualReferences: [String: [String: Any]] = [:]
    var visualWindows: [NSWindow] = []
    var hasUnsavedFile = false
    var persistedAgents: [String: String] = [:]
    var persistedRegistry = ""
    var isTest = CommandLine.arguments.contains("--smoke-test") || CommandLine.arguments.contains("--smoke-codex")

    func applicationDidFinishLaunching(_ notification: Notification) {
        signal(SIGPIPE, SIG_IGN)
        try? fm.createDirectory(at: support, withIntermediateDirectories: true, attributes: [.posixPermissions: 0o700])
        try? fm.createDirectory(at: eventDirectory, withIntermediateDirectories: true, attributes: [.posixPermissions: 0o700])
        // The agent registry for QA is written before the service first starts.
        try? fm.createDirectory(at: support.appendingPathComponent("qa", isDirectory: true), withIntermediateDirectories: true, attributes: [.posixPermissions: 0o700])
        // Hooks from sessions that no longer exist are never consumed; drop the stale ones.
        if let leftovers = try? fm.contentsOfDirectory(at: eventDirectory, includingPropertiesForKeys: [.contentModificationDateKey]) {
            let limit = Date().addingTimeInterval(-3600)
            for url in leftovers where url.pathExtension == "json" && ((try? url.resourceValues(forKeys: [.contentModificationDateKey]).contentModificationDate) ?? .distantPast) < limit { try? fm.removeItem(at: url) }
        }
        if let bytes = try? Data(contentsOf: support.appendingPathComponent("projects.json")), let saved = try? JSONDecoder().decode([Project].self, from: bytes) { projects = saved }
        loadWorkspace()
        loadProjectWorkspaces()
        setupMenu()
        let config = WKWebViewConfiguration()
        config.userContentController.add(self, name: "native")
        config.userContentController.addUserScript(WKUserScript(source: AppLanguage.bootstrapSource, injectionTime: .atDocumentStart, forMainFrameOnly: true))
        // Only the bundled local document gets the privileged bridge.
        config.preferences.javaScriptCanOpenWindowsAutomatically = false
        web = WKWebView(frame: .zero, configuration: config)
        web.navigationDelegate = self
        web.uiDelegate = self
        web.setValue(false, forKey: "drawsBackground")
        window = NSWindow(contentRect: NSRect(x: 0, y: 0, width: 1512, height: 960), styleMask: [.titled, .closable, .miniaturizable, .resizable, .fullSizeContentView], backing: .buffered, defer: false)
        window.title = "Agent Islands"
        window.titlebarAppearsTransparent = true
        window.titleVisibility = .hidden
        window.minSize = NSSize(width: 1080, height: 720)
        window.contentView = web
        window.center()
        window.setFrameAutosaveName("islands-main")
        window.makeKeyAndOrderFront(nil)
        NSApp.activate(ignoringOtherApps: true)
        statusItem = NSStatusBar.system.statusItem(withLength: NSStatusItem.variableLength)
        statusItem.button?.image = NSImage(systemSymbolName: "leaf", accessibilityDescription: "Agent Islands")
        let tray = NSMenu()
        tray.addItem(withTitle: L("Abrir Agent Islands"), action: #selector(showWindow), keyEquivalent: "")
        tray.addItem(.separator())
        tray.addItem(withTitle: L("Salir"), action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q")
        statusItem.menu = tray
        UNUserNotificationCenter.current().delegate = self
        let root = Bundle.main.resourceURL!.appendingPathComponent("ui", isDirectory: true).resolvingSymlinksInPath()
        web.loadFileURL(root.appendingPathComponent("index.html"), allowingReadAccessTo: root)
        DispatchQueue.global(qos: .utility).async {
            let loginPath = self.run("/bin/zsh", ["-lc", "printf '%s' \"$PATH\""])
            let home = fm.homeDirectoryForCurrentUser.path
            let prefix = "\(home)/.local/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"
            let resolved = loginPath.isEmpty ? prefix : loginPath + ":" + prefix
            let names = ["codex", "claude", "gemini", "opencode", "aider", "goose", "hermes", "docker"]
            var found: [String: String] = [:]
            for name in names {
                for dir in resolved.split(separator: ":") {
                    let candidate = String(dir) + "/" + name
                    if fm.isExecutableFile(atPath: candidate) { found[name] = candidate; break }
                }
            }
            DispatchQueue.main.async { self.path = resolved; self.binaries = found; self.refreshProfiles(); self.publish(); self.scan(); self.scanDocker(); self.resumeStartupConversation() }
        }
        timer = Timer.scheduledTimer(withTimeInterval: 0.8, repeats: true) { [weak self] _ in self?.consumeEvents() }
        Timer.scheduledTimer(withTimeInterval: 7, repeats: true) { [weak self] _ in self?.scan() }
        Timer.scheduledTimer(withTimeInterval: 12, repeats: true) { [weak self] _ in self?.scanDocker() }
        if CommandLine.arguments.contains("--capture-live") {
            Timer.scheduledTimer(withTimeInterval: 9, repeats: false) { _ in
                self.web.takeSnapshot(with: nil) { image, _ in
                    if let image, let tiff = image.tiffRepresentation, let rep = NSBitmapImageRep(data: tiff), let png = rep.representation(using: .png, properties: [:]) { try? png.write(to: URL(fileURLWithPath: "/tmp/agent-islands-live.png")) }
                }
                let summary: [String: Any] = ["projects": self.projects.count, "agents": self.agents.count, "goals": self.agents.values.filter { $0.goalStatus != nil }.count, "goalRecordsAtCapture": self.readCodexGoals().count, "nativeHome": fm.homeDirectoryForCurrentUser.path, "codexHomeOverride": ProcessInfo.processInfo.environment["CODEX_HOME"] ?? "", "docker": self.docker]
                try? Data(json(summary).utf8).write(to: URL(fileURLWithPath: "/tmp/agent-islands-live-summary.json"))
            }
        }
    }
    func resumeStartupConversation() {
        guard pageReady, binaries["codex"] != nil, !startupResumeHandled, let index = CommandLine.arguments.firstIndex(of: "--resume-conversation"), CommandLine.arguments.count > index + 1 else { return }
        startupResumeHandled = true
        let thread = CommandLine.arguments[index + 1]
        guard UUID(uuidString: thread) != nil, let binary = binaries["codex"] else { message(L("No se pudo reconectar esta conversación de Codex.")); return }
        DispatchQueue.global(qos: .utility).async {
            let record = self.readSavedConversations("codex").first { $0.id == thread }
            DispatchQueue.main.async {
                guard let record else { self.message(L("La conversación ya no está en el historial local.")); return }
                let project: Project
                if let existing = matchingProject(record.projectPath, in: self.projects) { project = Project(id: existing.id, name: existing.name, path: record.projectPath) }
                else { project = Project(id: "observed-" + record.projectPath, name: URL(fileURLWithPath: record.projectPath).lastPathComponent, path: record.projectPath); self.projects.append(project); self.saveProjects() }
                do { _ = try self.launch(project, harness: "codex", executable: binary, args: [], name: record.title, resumeId: record.id) }
                catch { self.fail(error) }
            }
        }
    }
    @objc func showWindow() { window.makeKeyAndOrderFront(nil); NSApp.activate(ignoringOtherApps: true) }
    func setupMenu() {
        let bar = NSMenu(), appMenu = NSMenu(), appItem = NSMenuItem()
        appMenu.addItem(withTitle: L("Acerca de Agent Islands"), action: #selector(NSApplication.orderFrontStandardAboutPanel(_:)), keyEquivalent: "")
        appMenu.addItem(.separator())
        appMenu.addItem(withTitle: L("Ocultar Agent Islands"), action: #selector(NSApplication.hide(_:)), keyEquivalent: "h")
        appMenu.addItem(withTitle: L("Salir de Agent Islands"), action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q")
        appItem.submenu = appMenu; bar.addItem(appItem)
        let edit = NSMenu(title: L("Edición")), editItem = NSMenuItem(title: L("Edición"), action: nil, keyEquivalent: "")
        for (title, selector, key) in [(L("Deshacer"), "undo:", "z"), (L("Rehacer"), "redo:", "Z"), (L("Cortar"), "cut:", "x"), (L("Copiar"), "copy:", "c"), (L("Pegar"), "paste:", "v"), (L("Seleccionar todo"), "selectAll:", "a")] {
            edit.addItem(withTitle: title, action: Selector(selector), keyEquivalent: key)
        }
        editItem.submenu = edit; bar.addItem(editItem); NSApp.mainMenu = bar
    }
    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        pageReady = true
        if CommandLine.arguments.contains("--verify-intelligence") {
            DispatchQueue.main.asyncAfter(deadline: .now() + 8) { self.web.evaluateJavaScript("requestIslandsAI('status')", completionHandler: nil) }
        }
        publish()
        resumeStartupConversation()
        if let id = selectedAgent { emit("select", ["id": id]) }
        if CommandLine.arguments.contains("--verify-integrations"), !launched {
            launched = true
            DispatchQueue.main.asyncAfter(deadline: .now() + 4) {
                self.web.evaluateJavaScript("launchDialog();document.querySelector('#launch-harness').value='codex';document.querySelector('#launch-mode').value='resume';document.querySelector('#session-all-projects').checked=true;updateLaunchHarness()", completionHandler: nil)
            }
            DispatchQueue.main.asyncAfter(deadline: .now() + 7) {
                self.web.evaluateJavaScript("JSON.stringify({count:sessionCatalog.length,loading:sessionLoading,status:document.querySelector('#saved-session-status').textContent,project:document.querySelector('#launch-project').value,request:sessionRequest})") { value, error in
                    let summary: [String: Any] = ["ui": value ?? "", "error": error?.localizedDescription ?? "", "projects": self.projects.map { ["name": $0.name, "path": $0.path] }, "home": fm.homeDirectoryForCurrentUser.path, "codexHome": ProcessInfo.processInfo.environment["CODEX_HOME"] ?? "", "reader": self.readSavedConversations("codex").count]
                    try? Data(json(summary).utf8).write(to: URL(fileURLWithPath: "/tmp/agent-islands-integration.json"))
                    self.web.takeSnapshot(with: nil) { image, _ in
                        if let image, let tiff = image.tiffRepresentation, let rep = NSBitmapImageRep(data: tiff), let png = rep.representation(using: .png, properties: [:]) { try? png.write(to: URL(fileURLWithPath: "/tmp/agent-islands-picker.png")) }
                    }
                }
            }
        }
        if CommandLine.arguments.contains("--smoke-codex"), !launched {
            launched = true
            let fixture = fm.temporaryDirectory.appendingPathComponent("islands-codex-" + UUID().uuidString)
            try? fm.createDirectory(at: fixture, withIntermediateDirectories: true)
            let project = Project(id: "codex-startup", name: "Codex startup verification", path: fixture.path)
            projects = [project]
            let candidates = (ProcessInfo.processInfo.environment["PATH"] ?? "/opt/homebrew/bin").split(separator: ":").map { String($0) + "/codex" }
            if let binary = candidates.first(where: { fm.isExecutableFile(atPath: $0) }) {
                _ = try? launch(project, harness: "codex", executable: binary, args: ["--no-daemon"], name: "Startup verification", bypass: true)
            }
            DispatchQueue.main.asyncAfter(deadline: .now() + 8) {
                let output = self.sessions.values.map { String(decoding: $0.history, as: UTF8.self) }.joined()
                let running = self.sessions.values.contains { $0.process.isRunning }
                let passed = running && !output.contains("expected a sequence") && !output.contains("Error loading configuration") && !output.isEmpty
                try? Data((passed ? "PASS actual Codex startup through native PTY; no prompt submitted" : "FAIL Codex startup: " + output).utf8).write(to: URL(fileURLWithPath: "/tmp/agent-islands-codex-startup.txt"))
                self.web.takeSnapshot(with: nil) { image, _ in
                    if let image, let tiff = image.tiffRepresentation, let rep = NSBitmapImageRep(data: tiff), let png = rep.representation(using: .png, properties: [:]) { try? png.write(to: URL(fileURLWithPath: "/tmp/agent-islands-codex-startup.png")) }
                    for session in self.sessions.values { session.stop() }
                    self.sessions.removeAll(); try? fm.removeItem(at: fixture); try? fm.removeItem(at: support); NSApp.terminate(nil)
                }
            }
        }
        if isTest && !launched {
            launched = true
            let fixture = fm.temporaryDirectory.appendingPathComponent("islands-smoke-" + UUID().uuidString)
            try? fm.createDirectory(at: fixture, withIntermediateDirectories: true)
            let smokeFile = fixture.appendingPathComponent("smoke.txt")
            try? Data("initial\n".utf8).write(to: smokeFile)
            let project = Project(id: "smoke", name: "Native smoke test", path: fixture.path)
            let secondary = Project(id: "smoke-web", name: "Web", path: fixture.appendingPathComponent("web with spaces").path)
            try? fm.createDirectory(atPath: secondary.path, withIntermediateDirectories: true)
            projects = [project, secondary]
            try? saveProjectWorkspace(["name": "Native workspace", "projectIds": [project.id, secondary.id]])
            publish()
            let spy = fixture.appendingPathComponent("argv-spy.sh")
            let spyOutput = fixture.appendingPathComponent("argv.txt")
            try? Data("printf '%s\\n' \"$@\" > argv.txt\nexec /bin/cat\n".utf8).write(to: spy)
            let resumeId = "01900000-0000-7000-8000-000000000001"
            _ = try? launch(project, harness: "codex", executable: "/bin/sh", args: [spy.path], name: "PTY resume smoke", resumeId: resumeId, bypass: true)
            var contextPassed = false, busyGuardPassed = false, visualPassed = false
            let visualID = UUID().uuidString
            func testPrompt(_ text: String, kind: String? = nil, references: [String] = []) {
                guard let id = self.sessions.keys.first else { return }
                var body: [String: Any] = ["action": "prompt", "id": id, "text": text, "references": references]
                if let kind { body["contextKind"] = kind }
                self.web.evaluateJavaScript("void window.webkit.messageHandlers.native.postMessage(\(json(body)))", completionHandler: nil)
            }
            func testReply(_ text: String) {
                guard let id = self.sessions.keys.first else { return }
                let event: [String: Any] = ["id": id, "state": "ready", "payload": ["last_assistant_message": text]]
                try? Data(json(event).utf8).write(to: eventDirectory.appendingPathComponent(id + "-smoke.json"), options: .atomic)
                self.consumeEvents()
            }
            DispatchQueue.main.asyncAfter(deadline: .now() + 1.1) { testPrompt("native-smoke-task") }
            DispatchQueue.main.asyncAfter(deadline: .now() + 1.3) { testPrompt("busy-recap", kind: "recap") }
            DispatchQueue.main.asyncAfter(deadline: .now() + 1.7) {
                if let id = self.sessions.keys.first { busyGuardPassed = self.agents[id]?.lastTask == "native-smoke-task" && self.agents[id]?.pendingContext == nil }
                testReply("First task complete")
                testPrompt("now-recap", kind: "recap")
            }
            DispatchQueue.main.asyncAfter(deadline: .now() + 2.4) {
                testReply("Actual recap reply")
                if let id = self.sessions.keys.first {
                    contextPassed = self.agents[id]?.lastTask == "native-smoke-task" && self.agents[id]?.contextResponse == "Actual recap reply" && self.agents[id]?.contextKind == "recap" && self.agents[id]?.contextAt != nil
                }
            }
            DispatchQueue.main.asyncAfter(deadline: .now() + 2.7) {
                guard let id = self.sessions.keys.first, let agent = self.agents[id] else { return }
                do {
                    let dir = try self.visualDirectory(visualID)
                    try fm.createDirectory(at: dir, withIntermediateDirectories: true)
                    let ref: [String: Any] = ["id": visualID, "agentId": id, "profileId": agent.profileId ?? agent.harness, "projectId": agent.projectId, "kind": "component", "name": "Acceso del equipo", "url": "https://fixture.local/equipo", "images": ["capture.png"], "component": ["selector": "#invite"]]
                    try Data(json(ref).utf8).write(to: dir.appendingPathComponent("reference.json"))
                    try Data(base64Encoded: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=")!.write(to: dir.appendingPathComponent("capture.png"))
                    try self.registerVisualReference(ref, owner: id)
                    testPrompt("Simplifica este componente", references: [visualID])
                } catch { print("Visual smoke: \(error)") }
            }
            DispatchQueue.main.asyncAfter(deadline: .now() + 5.5) {
                if let id = self.sessions.keys.first, let session = self.sessions[id] {
                    let transcript = String(decoding: session.history, as: UTF8.self)
                    let rejectsForeign = (try? self.visualPromptContext([visualID], owner: "another-agent")) == nil
                    visualPassed = transcript.contains(visualID + "/reference.json") && transcript.contains("view_image") && transcript.contains("Simplifica este componente") && rejectsForeign
                }
            }
            DispatchQueue.main.asyncAfter(deadline: .now() + 1) {
                if let id = self.sessions.keys.first {
                    self.sessions[id]?.packet(68, Data("native-bridge-ñ\n".utf8))
                    self.emit("select", ["id": id])
                }
                self.web.evaluateJavaScript("window.webkit.messageHandlers.native.postMessage({action:'readFile',projectId:'smoke',path:'smoke.txt'})", completionHandler: nil)
            }
            DispatchQueue.main.asyncAfter(deadline: .now() + 1.5) {
                self.web.evaluateJavaScript("document.querySelector('#code').value='edited-ñ';document.querySelector('#code').dispatchEvent(new Event('input'));document.querySelector('#save-file').click()", completionHandler: nil)
            }
            let dockerSpy = fixture.appendingPathComponent("docker-spy.sh")
            let dockerOutput = fixture.appendingPathComponent("docker-argv.txt")
            try? Data(("#!/bin/sh\nprintf '%s\\n' \"$@\" >> " + shellQuote(dockerOutput.path) + "\n").utf8).write(to: dockerSpy)
            try? fm.setAttributes([.posixPermissions: 0o700], ofItemAtPath: dockerSpy.path)
            var dockerFixtureIndex = 0
            func nextDockerFixture() {
                guard dockerFixtureIndex < 3 else { self.dockerTestCompletion = nil; return }
                let operation = ["start", "stop", "restart"][dockerFixtureIndex]; dockerFixtureIndex += 1
                self.binaries["docker"] = dockerSpy.path
                self.docker = ["connected": true, "status": "ready", "containers": [["id": "smoke-container", "name": "fixture", "state": "running"]]]
                self.dockerTestCompletion = { nextDockerFixture() }
                let body: [String: Any] = ["action": "dockerAction", "id": "smoke-container", "operation": operation]
                self.web.evaluateJavaScript("window.webkit.messageHandlers.native.postMessage(\(json(body)))", completionHandler: nil)
            }
            DispatchQueue.main.asyncAfter(deadline: .now() + 2.5) { nextDockerFixture() }
            var savePassed = false
            DispatchQueue.main.asyncAfter(deadline: .now() + 2) {
                savePassed = (try? String(contentsOf: smokeFile, encoding: .utf8)) == "edited-ñ"
                try? Data("external-update".utf8).write(to: smokeFile, options: .atomic)
                self.web.evaluateJavaScript("document.querySelector('#code').value='stale-overwrite';document.querySelector('#code').dispatchEvent(new Event('input'));document.querySelector('#save-file').click()", completionHandler: nil)
            }
            DispatchQueue.main.asyncAfter(deadline: .now() + 6) {
                let passed = self.sessions.values.contains { String(decoding: $0.history, as: UTF8.self).contains("native-bridge-ñ") }
                let conflictPassed = (try? String(contentsOf: smokeFile, encoding: .utf8)) == "external-update"
                let spyArgs = (try? String(contentsOf: spyOutput, encoding: .utf8)) ?? ""
                let workspacePassed = self.activeProjectWorkspace?.projectIds == [project.id, secondary.id] && spyArgs.contains("--add-dir\n" + secondary.path)
                let resumePassed = spyArgs.contains("--dangerously-bypass-approvals-and-sandbox\n") && spyArgs.contains("resume\n" + resumeId) && self.agents.values.contains { $0.threadId == resumeId && $0.bypassPermissions }

                let dockerCalls = (try? String(contentsOf: dockerOutput, encoding: .utf8)) ?? ""
                let dockerPassed = ["start", "stop", "restart"].allSatisfy { dockerCalls.contains("container\n" + $0 + "\nsmoke-container\n") }
                let ledgerPassed = goalLedgerSmokeTests(self, directory: fixture)
                let report = (passed ? "PASS native WKWebView + PTY bridge" : "FAIL native bridge") + "\n" + (savePassed && conflictPassed ? "PASS native editor read/write and stale-save rejection" : "FAIL native editor") + "\n" + (contextPassed && busyGuardPassed ? "PASS native context attribution, timestamps, task preservation and busy guard" : "FAIL native context") + "\n" + (resumePassed ? "PASS resumed conversation and bypass argv through native PTY" : "FAIL resume argv") + "\n" + (dockerPassed ? "PASS Docker start/stop/restart through native bridge with isolated executable" : "FAIL Docker actions")
                try? Data((report + "\n" + (workspacePassed ? "PASS native multi-project workspace and additional directory argv" : "FAIL native workspace argv") + "\n" + (visualPassed ? "PASS native visual reference manifest and image paths delivered through harness PTY; foreign references rejected" : "FAIL native visual reference delivery") + "\n" + (ledgerPassed ? "PASS goal ledger stalled/progress/achieved, older schemas and empty versus unavailable ledger" : "FAIL goal ledger")).utf8).write(to: URL(fileURLWithPath: "/tmp/agent-islands-smoke-result.txt"))
                self.web.takeSnapshot(with: nil) { image, error in
                    if let image, let tiff = image.tiffRepresentation, let rep = NSBitmapImageRep(data: tiff), let png = rep.representation(using: .png, properties: [:]) {
                        try? png.write(to: URL(fileURLWithPath: "/tmp/agent-islands-native.png"))
                    }
                    for session in self.sessions.values { session.stop() }
                    try? fm.removeItem(at: fixture)
                    try? fm.removeItem(at: support)
                    self.sessions.removeAll(); NSApp.terminate(nil)
                }
            }
        }
    }
    func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        if isBundledUIURL(navigationAction.request.url, expected: Bundle.main.resourceURL!.appendingPathComponent("ui/index.html")) { decisionHandler(.allow) }
        else { decisionHandler(.cancel) }
    }
    func webView(_ webView: WKWebView, runJavaScriptConfirmPanelWithMessage message: String, initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping (Bool) -> Void) {
        let alert = NSAlert(); alert.messageText = message; alert.addButton(withTitle: L("Continuar")); alert.addButton(withTitle: L("Cancelar"))
        alert.beginSheetModal(for: window) { response in completionHandler(response == .alertFirstButtonReturn) }
    }
    func emit(_ event: String, _ data: Any) {
        if ["terminal", "attention"].contains(event), let payload = data as? [String: Any], let id = payload["id"] as? String, let agent = agents[id], !agentIsInScope(agent) { return }
        if event == "intelligenceResult", CommandLine.arguments.contains("--verify-intelligence") {
            try? Data(json(data).utf8).write(to: URL(fileURLWithPath: "/tmp/agent-islands-ai-result.json"))
            DispatchQueue.main.asyncAfter(deadline: .now() + 2) {
                self.web.takeSnapshot(with: nil) { image, _ in
                    if let image, let tiff = image.tiffRepresentation, let rep = NSBitmapImageRep(data: tiff), let png = rep.representation(using: .png, properties: [:]) { try? png.write(to: URL(fileURLWithPath: "/tmp/agent-islands-ai.png")) }
                }
            }
        }
        web?.evaluateJavaScript("window.receiveNative && window.receiveNative(\(json(["event": event, "data": data])))", completionHandler: nil)
    }
    func publish() {
        for id in Array(agents.keys) where agents[id]?.managed == true { agents[id]?.processRunning = sessions[id]?.process.isRunning == true }
        let data: [String: Any] = ["projects": (try? JSONSerialization.jsonObject(with: JSONEncoder().encode(scopedProjects))) ?? [], "allProjects": (try? JSONSerialization.jsonObject(with: JSONEncoder().encode(projects))) ?? [], "projectWorkspaces": (try? JSONSerialization.jsonObject(with: JSONEncoder().encode(projectWorkspaces))) ?? [], "activeWorkspaceId": activeWorkspaceId ?? "", "activeWorkspaceName": activeProjectWorkspace?.name ?? "", "backgroundSessionCount": agents.values.filter { $0.managed && !agentIsInScope($0) && sessions[$0.id]?.process.isRunning == true }.count, "agents": (try? JSONSerialization.jsonObject(with: JSONEncoder().encode(Array(agents.values).filter { agentIsInScope($0) }.sorted { $0.name < $1.name }))) ?? [], "binaries": binaries, "notifications": notifications, "voice": voice, "native": true, "docker": docker, "codexSharedServer": localCodexResumeEndpoint() != nil, "profiles": profiles.filter { $0.enabled }.map { profile -> [String: Any] in var row = (try? JSONSerialization.jsonObject(with: JSONEncoder().encode(profile))) as? [String: Any] ?? [:]; row["sharedServer"] = profile.harness == "codex" && localCodexResumeEndpoint(root: URL(fileURLWithPath: profile.configRoot)) != nil; return row }, "language": AppLanguage.current, "workspaceError": workspaceError ?? ""]
        // Snapshots are frequent; write only the records that changed.
        if let workspace {
            for agent in agents.values where agent.managed {
                guard let bytes = try? JSONEncoder().encode(agent), let value = try? JSONSerialization.jsonObject(with: bytes) else { continue }
                let serialized = json(value)
                if persistedAgents[agent.id] == serialized { continue }
                if (try? workspace.put("agent", id: agent.id, value: value)) != nil { persistedAgents[agent.id] = serialized }
            }
        }
        let registry = agents.values.sorted { $0.id < $1.id }.map { ["id": $0.id, "profileId": $0.profileId ?? $0.harness, "threadId": $0.threadId ?? "", "projectId": $0.projectId, "projectIds": $0.executionProjectIds as Any? ?? NSNull()] as [String: Any] }
        let serializedRegistry = json(registry)
        if serializedRegistry != persistedRegistry, (try? Data(serializedRegistry.utf8).write(to: support.appendingPathComponent("qa/agents.json"), options: .atomic)) != nil { persistedRegistry = serializedRegistry }
        emit("snapshot", data)
        let n = agents.values.filter { agentIsInScope($0) && AgentControlState($0).needsAttention }.count
        statusItem?.button?.title = n > 0 ? " \(n)" : ""
    }
    func fail(_ error: Error) { emit("error", ["message": error.localizedDescription]) }
    func message(_ text: String) { emit("error", ["message": text]) }
    func userContentController(_ controller: WKUserContentController, didReceive message: WKScriptMessage) {
        guard message.frameInfo.isMainFrame, message.frameInfo.request.url?.isFileURL == true,
              isBundledUIURL(message.frameInfo.request.url, expected: Bundle.main.resourceURL!.appendingPathComponent("ui/index.html")),
              let b = message.body as? [String: Any], let action = b["action"] as? String else { return }
        let project = projects.first { $0.id == b["projectId"] as? String }
        do {
            if let project, !projectIsInScope(project.id), !["workspaceSave", "workspaceActivate", "addProject"].contains(action) { throw launchFailure(L("El proyecto está fuera del workspace activo.")) }
            if ["select", "input", "prompt", "resize", "replay", "stop", "mode", "prepareAgentResume"].contains(action), let id = b["id"] as? String, let agent = agents[id], !agentIsInScope(agent) { throw launchFailure(L("Activa el workspace de esa conversación para continuar.")) }
            switch action {
            case "language":
                guard let language = b["language"] as? String, AppLanguage.supported.contains(language) else { return }
                AppLanguage.set(language); setupMenu()
                let controller = web.configuration.userContentController
                let otherScripts = controller.userScripts.filter { !$0.source.hasPrefix("window.islandsLanguage=") }
                controller.removeAllUserScripts()
                for script in otherScripts { controller.addUserScript(script) }
                controller.addUserScript(WKUserScript(source: AppLanguage.bootstrapSource, injectionTime: .atDocumentStart, forMainFrameOnly: true))
                if let menu = statusItem.menu { menu.removeAllItems(); menu.addItem(withTitle: L("Abrir Agent Islands"), action: #selector(showWindow), keyEquivalent: ""); menu.addItem(.separator()); menu.addItem(withTitle: L("Salir"), action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q") }
            case "ready": publish()
            case "operations": qaCall(b)
            case "visualReferenceOpen": if let id = b["referenceId"] as? String { try openVisualReference(id) }
            case "workspaceSave":
                try saveProjectWorkspace(b); emit("workspaceResult", ["success": true])
            case "workspaceActivate":
                let id = b["workspaceId"] as? String
                try activateProjectWorkspace(id?.isEmpty == false ? id : nil); emit("workspaceResult", ["success": true])
            case "checkpoints": try checkpointOperation(b)
            case "openEvidence":
                guard let run = b["runId"] as? String, UUID(uuidString: run) != nil,
                      let file = b["file"] as? String, ["page.png", "result.json"].contains(file) else { throw launchFailure(L("Evidencia no disponible.")) }
                let url = try confinedURL(root: support.appendingPathComponent("qa/evidence").path, relative: run + "/" + file)
                NSWorkspace.shared.open(url)
            case "copyText": if let text = b["text"] as? String { NSPasteboard.general.clearContents(); NSPasteboard.general.setString(String(text.prefix(20000)), forType: .string) }
            case "prepareAgentResume":
                guard let id = b["id"] as? String, let agent = agents[id], let thread = agent.threadId,
                      let record = readSavedConversations(agent.harness, profileID: agent.profileId).first(where: { $0.id == thread }) else { throw launchFailure(L("No se encuentra la conversación. Búscala en el selector.")) }
                savedConversations[conversationKey(agent.harness, thread, agent.profileId)] = record
                emit("resumeReady", ["projectId": agent.projectId, "harness": agent.harness, "sessionId": thread, "profileId": agent.profileId ?? agent.harness])
            case "intelligence": requestIntelligence(b)
            case "cancelIntelligence": aiGeneration += 1; aiCredentialRequest = nil; aiTask?.cancel(); aiTask = nil
            case "skills": listSkills(projectId: b["projectId"] as? String)
            case "attachImage": try attachImage(b)
            case "chooseImage": chooseImage(owner: b["id"] as? String ?? "")
            case "removeAttachment": if let id = b["attachmentId"] as? String, let url = attachments.removeValue(forKey: id) { try? fm.removeItem(at: url) }
            case "stopDictation": stopDictation()
            case "dirty": hasUnsavedFile = b["dirty"] as? Bool ?? false
            case "addProject": chooseProject(forLaunch: b["forLaunch"] as? Bool ?? false, registrationOnly: b["registrationOnly"] as? Bool ?? false)
            case "removeProject":
                if let project {
                    guard !agents.values.contains(where: { $0.projectId == project.id && $0.managed && $0.state != "exited" }) else { self.message(L("Cierra primero las sesiones de esta isla.")); return }
                    projects.removeAll { $0.id == project.id }; saveProjects()
                    // Workspaces keep only projects that still exist; a later edit would otherwise be rejected.
                    for group in projectWorkspaces where group.projectIds.contains(project.id) && group.projectIds.count > 1 {
                        try? saveProjectWorkspace(["id": group.id, "name": group.name, "projectIds": group.projectIds.filter { $0 != project.id }, "activate": false])
                    }
                    publish()
                }
            case "launch":
                guard let harness = b["harness"] as? String else { throw launchFailure(L("Selecciona un harness.")) }
                var launchProject = project
                let profileID = b["profileId"] as? String
                let selectedProfile = profile(profileID, harness: harness)
                if ["codex", "claude"].contains(harness) && profileID != nil && selectedProfile == nil { throw launchFailure(L("El perfil seleccionado no está disponible.")) }
                let bypass = b["bypassPermissions"] as? Bool ?? false
                let resume = b["resumeSessionId"] as? String
                var resumedTitle: String?
                if let resume {
                    guard let record = savedConversations[conversationKey(harness, resume, profileID)], pathIsInScope(record.projectPath) else { throw launchFailure(L("Actualiza el selector y elige una conversación guardada.")) }
                    guard !agents.values.contains(where: { $0.harness == harness && sameProfileIdentity($0.profileId, profileID, harness: harness) && $0.threadId == resume && sessions[$0.id]?.process.isRunning == true }) else { throw launchFailure(L("Esta conversación ya está abierta en Islands.")) }
                    let existing = matchingProject(record.projectPath, in: projects)
                    if let existing { launchProject = Project(id: existing.id, name: existing.name, path: record.projectPath) }
                    else {
                        let restored = Project(id: "observed-" + record.projectPath, name: URL(fileURLWithPath: record.projectPath).lastPathComponent, path: record.projectPath)
                        launchProject = restored; projects.append(restored); saveProjects()
                    }
                    resumedTitle = record.title
                }
                guard let project = launchProject else { throw launchFailure(L("Selecciona un directorio de trabajo.")) }
                let executable: String
                let args: [String]
                if harness == "shell" { executable = "/bin/zsh"; args = ["-l"] }
                else if harness == "custom" {
                    guard let path = b["executable"] as? String, path.hasPrefix("/"), fm.isExecutableFile(atPath: path) else { throw launchFailure(L("Elige la ruta absoluta de un ejecutable instalado.")) }
                    executable = path; args = b["args"] as? [String] ?? []
                } else {
                    guard let binary = selectedProfile?.executable ?? binaries[harness] else { throw launchFailure(L("Este harness no está instalado o no está en PATH.")) }
                    executable = binary; args = []
                }
                let enteredName = b["name"] as? String
                let name = enteredName?.isEmpty == false ? enteredName : resumedTitle
                let id = try launch(project, harness: harness, executable: executable, args: args, name: name, resumeId: resume, bypass: bypass, profileID: profileID)
                emit("launchResult", ["success": true, "id": id])
            case "catalog":
                DispatchQueue.global(qos: .utility).async {
                    let records = self.profiles.filter { $0.enabled }.flatMap { self.readSavedConversations($0.harness, profileID: $0.id) }
                    DispatchQueue.main.async {
                        let visible = records.filter { self.pathIsInScope($0.projectPath) }.map { record -> SavedConversation in
                            var record = record
                            record.inUse = self.agents.values.contains { $0.harness == record.harness && self.sameProfileIdentity($0.profileId, record.profileId, harness: record.harness) && $0.threadId == record.id && self.sessions[$0.id]?.process.isRunning == true }
                            self.savedConversations[self.conversationKey(record.harness, record.id, record.profileId)] = record
                            return record
                        }.sorted { $0.updatedAt > $1.updatedAt }
                        self.emit("catalog", ["sessions": (try? JSONSerialization.jsonObject(with: JSONEncoder().encode(visible))) ?? []])
                    }
                }
            case "prepareResume":
                guard let harness = b["harness"] as? String, let id = b["sessionId"] as? String,
                      let record = savedConversations[conversationKey(harness, id, b["profileId"] as? String)] else { throw launchFailure(L("Actualiza la búsqueda y vuelve a seleccionar la conversación.")) }
                guard pathIsInScope(record.projectPath) else { throw launchFailure(L("La conversación está fuera del workspace activo.")) }
                guard binaries[harness] != nil else { throw launchFailure(L("Este harness no está instalado o no está disponible en PATH.")) }
                let project: Project
                if let existing = matchingProject(record.projectPath, in: projects) { project = existing }
                else { project = Project(id: "observed-" + record.projectPath, name: URL(fileURLWithPath: record.projectPath).lastPathComponent, path: record.projectPath); projects.append(project); saveProjects() }
                publish(); emit("resumeReady", ["projectId": project.id, "harness": harness, "sessionId": id, "profileId": record.profileId ?? harness])
            case "listSessions":
                guard let harness = b["harness"] as? String, ["codex", "claude"].contains(harness), let requestId = b["requestId"] as? Int else { return }
                let profileID = b["profileId"] as? String
                let all = project == nil || (b["allProjects"] as? Bool ?? true)
                DispatchQueue.global(qos: .utility).async {
                    let records = self.readSavedConversations(harness, profileID: profileID)
                    DispatchQueue.main.async {
                        var visible: [SavedConversation] = [], available: [SavedConversation] = []
                        for var record in records where self.pathIsInScope(record.projectPath) {
                            record.inUse = self.agents.values.contains { $0.harness == harness && self.sameProfileIdentity($0.profileId, record.profileId, harness: harness) && $0.threadId == record.id && self.sessions[$0.id]?.process.isRunning == true }
                            self.savedConversations[self.conversationKey(harness, record.id, record.profileId)] = record
                            available.append(record)
                            if all || project.map({ record.projectPath == $0.path || record.projectPath.hasPrefix($0.path + "/") }) == true { visible.append(record) }
                        }
                        let global = !all && visible.isEmpty && !available.isEmpty
                        if global { visible = available }
                        self.emit("savedSessions", ["requestId": requestId, "projectId": project?.id ?? "", "harness": harness, "profileId": profileID ?? harness, "globalFallback": global, "total": available.count, "sessions": (try? JSONSerialization.jsonObject(with: JSONEncoder().encode(visible))) ?? []])
                    }
                }
            case "select":
                if let id = b["id"] as? String, let agent = agents[id] {
                    let target = agent.parentId ?? id; selectedAgent = target
                    emit("terminalReset", ["id": target, "bytes": sessions[target]?.history.base64EncodedString() ?? ""])
                }
            case "replay":
                if let id = b["id"] as? String, let session = sessions[id] { emit("terminalReplay", ["id": id, "bytes": session.history.base64EncodedString()]) }
            case "input":
                if let id = b["id"] as? String, let text = b["text"] as? String, text.utf8.count <= 1_048_576, let session = sessions[id] {
                    session.packet(68, Data(text.utf8))
                    if text.contains("\r"), agents[id]?.state == "waiting" { agents[id]?.state = "session"; publish() }
                }
            case "prompt":
                if let id = b["id"] as? String, let rawText = b["text"] as? String, rawText.utf8.count <= 100_000, let session = sessions[id] {
                    do {
                    guard let agent = agents[id], agentIsInScope(agent) else { throw launchFailure(L("La conversación está fuera del workspace activo.")) }
                    let visualContext = try visualPromptContext(b["references"] as? [String] ?? [], owner: id)
                    let imageIDs = b["attachments"] as? [String] ?? []
                    guard imageIDs.allSatisfy({ attachments[$0] != nil }) else { throw launchFailure(L("Una imagen ya no está disponible. Adjúntala de nuevo.")) }
                    let imagePaths = imageIDs.compactMap { attachments[$0]?.path }
                    let contract = agents[id].flatMap { taskContract($0) }
                    let contractPrefix = contract.map { L("Contrato del encargo acordado por el usuario (no amplía permisos de push):\n") + json($0) + "\n\n" } ?? ""
                    let taskProfile = agents[id].flatMap { agent in profiles.first { $0.id == agent.profileId } }
                    let policyPrefix = taskProfile.map { L("Criterios del perfil: ") + $0.policy + "\n\n" } ?? ""
                    let text = (agents[id]?.executionContext.map { $0 + "\n\n" } ?? "") + policyPrefix + contractPrefix + rawText + visualContext + (imagePaths.isEmpty ? "" : L("\n\nImágenes adjuntas locales (abre y examina estos archivos):\n") + imagePaths.joined(separator: "\n"))
                    guard session.process.isRunning else { emit("promptRejected", ["id": id, "text": rawText, "requestId": b["requestId"] as? String ?? "", "message": L("La sesión está cerrada. Vuelve a abrirla para continuar.")]); return }
                    let kind = b["contextKind"] as? String
                    let control = agents[id].map { AgentControlState($0) }
                    if (kind == "status" || kind == "recap"), control?.effective == "working" || control?.effective == "planning" || control?.sessionNeedsAttention == true {
                        let reason = control?.sessionNeedsAttention == true ? L("Responde primero a la decisión pendiente en la terminal.") : L("El agente sigue trabajando. Envía la consulta cuando termine su turno.")
                        emit("promptRejected", ["id": id, "text": rawText, "contextKind": kind!, "requestId": b["requestId"] as? String ?? "", "message": reason]); return
                    }
                    // Bracketed paste keeps multiline prompts intact. Return submits after paste is consumed.
                    session.packet(68, Data(("\u{1b}[200~" + text + "\u{1b}[201~").utf8))
                    DispatchQueue.main.asyncAfter(deadline: .now() + 0.12) { session.packet(68, Data([13])) }
                    if kind == "status" || kind == "recap" { agents[id]?.pendingContext = kind }
                    else { agents[id]?.lastTask = String(rawText.prefix(4000)); agents[id]?.taskAt = Date().timeIntervalSince1970; agents[id]?.pendingContext = nil }
                    agents[id]?.state = "active"; agents[id]?.stateAt = Date().timeIntervalSince1970; publish()
                    emit("promptAccepted", ["id": id, "requestId": b["requestId"] as? String ?? ""])
                    } catch { emit("promptRejected", ["id": id, "text": rawText, "requestId": b["requestId"] as? String ?? "", "message": error.localizedDescription]) }
                } else {
                    emit("promptRejected", ["id": b["id"] as? String ?? "", "text": b["text"] as? String ?? "", "requestId": b["requestId"] as? String ?? "", "message": L("La sesión no está disponible o el mensaje supera el límite. Vuelve a abrirla o reduce el mensaje.")])
                }
            case "resize":
                if let id = b["id"] as? String, let cols = b["cols"] as? Int, let rows = b["rows"] as? Int {
                    let c = min(500, max(10, cols)), r = min(300, max(4, rows))
                    sessions[id]?.packet(82, Data([UInt8(c >> 8), UInt8(c & 255), UInt8(r >> 8), UInt8(r & 255)]))
                }
            case "stop":
                if let id = b["id"] as? String, let session = sessions[id] {
                    let alert = NSAlert(); alert.messageText = L("¿Cerrar esta sesión?"); alert.informativeText = L("Se detendrá el agente y sus procesos. Su conversación seguirá en el historial del harness."); alert.addButton(withTitle: L("Cerrar sesión")); alert.addButton(withTitle: L("Cancelar"))
                    if alert.runModal() == .alertFirstButtonReturn { session.stop() }
                }
            case "scan": scan()
            case "docker": scanDocker()
            case "mode":
                if let id = b["id"] as? String, let mode = b["mode"] as? String, ["work", "plan", "goal"].contains(mode), agents[id] != nil { agents[id]?.mode = mode; publish() }
            case "dockerAction":
                guard let id = b["id"] as? String, let operation = b["operation"] as? String,
                      ["start", "stop", "restart"].contains(operation), let binary = binaries["docker"],
                      let containers = docker["containers"] as? [[String: String]], let container = containers.first(where: { $0["id"] == id }) else { throw launchFailure(L("Actualiza Docker y selecciona un contenedor.")) }
                guard !dockerActions.contains(id) else { return }
                dockerActions.insert(id)
                DispatchQueue.global(qos: .utility).async {
                    let result = self.runResult(binary, ["container", operation, id], timeoutSeconds: 45)
                    DispatchQueue.main.async {
                        self.dockerActions.remove(id)
                        self.emit("dockerActionResult", ["id": id, "success": result.1 == 0, "operation": operation, "message": result.1 == 0 ? (container["name"] ?? id) : String(result.0.suffix(500))])
                        self.scanDocker()
                        if self.isTest { self.dockerTestCompletion?() }
                    }
                }
            case "dockerLogs":
                if let id = b["id"] as? String, let binary = binaries["docker"], let containers = docker["containers"] as? [[String: String]], containers.contains(where: { $0["id"] == id }) {
                    DispatchQueue.global(qos: .utility).async {
                        let result = self.runResult(binary, ["logs", "--tail", "120", "--timestamps", id])
                        DispatchQueue.main.async { self.emit("dockerLogs", ["id": id, "text": String(result.0.suffix(100_000))]) }
                    }
                }
            case "openPort":
                if let id = b["id"] as? String, let port = b["port"] as? String, let containers = docker["containers"] as? [[String: String]], let container = containers.first(where: { $0["id"] == id }), let ports = container["ports"],
                   let n = Int(port), (1...65535).contains(n), ports.contains(":" + port + "->"), let url = URL(string: "http://localhost:\(port)") { NSWorkspace.shared.open(url) }
            case "listFiles": if let project { try listFiles(project, relative: b["path"] as? String ?? "") }
            case "readFile": if let project, let relative = b["path"] as? String { try readFile(project, relative: relative) }
            case "saveFile":
                if let project, let relative = b["path"] as? String, let text = b["text"] as? String, let expected = b["revision"] as? String {
                    let url = try confinedURL(root: project.path, relative: relative)
                    guard try revision(url) == expected else { self.message(L("El archivo cambió en disco. Recárgalo antes de guardar para conservar los cambios del agente.")); return }
                    guard text.utf8.count <= 2_000_000 else { self.message(L("El archivo supera el límite de 2 MB.")); return }
                    let permissions = (try? fm.attributesOfItem(atPath: url.path))?[.posixPermissions]
                    try Data(text.utf8).write(to: url, options: .atomic)
                    if let permissions { try? fm.setAttributes([.posixPermissions: permissions], ofItemAtPath: url.path) }
                    emit("saved", ["path": relative, "revision": try revision(url)] )
                }
            case "reveal": if let project { NSWorkspace.shared.selectFile(nil, inFileViewerRootedAtPath: project.path) }
            case "notifications": enableNotifications()
            case "voice": voice.toggle(); UserDefaults.standard.set(voice, forKey: "voice"); publish()
            case "speak":
                if let id = b["id"] as? String, let agent = agents[id], !agent.message.isEmpty { speak(agent.message) }
            case "dictate": if audioEngine != nil { stopDictation() } else { startDictation() }
            default: break
            }
        } catch {
            if action == "launch" { emit("launchResult", ["success": false, "message": error.localizedDescription]) }
            else if action.hasPrefix("workspace") { emit("workspaceResult", ["success": false, "message": error.localizedDescription]) }
            else { fail(error) }
        }
    }
    func saveProjects() { if !isTest { try? JSONEncoder().encode(projects).write(to: support.appendingPathComponent("projects.json"), options: .atomic) } }
    func chooseProject(forLaunch: Bool = false, registrationOnly: Bool = false) {
        let panel = NSOpenPanel(); panel.canChooseDirectories = true; panel.canChooseFiles = false; panel.allowsMultipleSelection = !forLaunch; panel.prompt = forLaunch ? L("Elegir directorio") : L("Añadir isla")
        panel.beginSheetModal(for: window) { response in
            guard response == .OK else { return }
            for url in panel.urls {
                let path = url.resolvingSymlinksInPath().path
                if !self.projects.contains(where: { $0.path == path }) { self.projects.append(Project(id: UUID().uuidString, name: url.lastPathComponent, path: path)) }
            }
            self.saveProjects()
            if !registrationOnly, var group = self.activeProjectWorkspace {
                group.projectIds = group.projectIds.filter { id in self.projects.contains { $0.id == id } }
                for url in panel.urls { if let project = self.projects.first(where: { $0.path == url.resolvingSymlinksInPath().path }), !group.projectIds.contains(project.id) { group.projectIds.append(project.id) } }
                do { try self.saveProjectWorkspace(["id": group.id, "name": group.name, "projectIds": group.projectIds]) } catch { self.fail(error) }
            } else { self.publish() }
            if registrationOnly { self.emit("workspaceProjectsAdded", ["projectIds": panel.urls.compactMap { url in self.projects.first { $0.path == url.resolvingSymlinksInPath().path }?.id }]) }
            if forLaunch, let url = panel.urls.first,
               let selected = self.projects.first(where: { $0.path == url.resolvingSymlinksInPath().path }) {
                self.emit("launchProjectSelected", ["projectId": selected.id])
            }
        }
    }
    @discardableResult func launch(_ project: Project, harness: String, executable: String, args: [String], name: String?, resumeId: String? = nil, bypass: Bool = false, profileID: String? = nil) throws -> String {
        var directory: ObjCBool = false
        guard fm.fileExists(atPath: project.path, isDirectory: &directory), directory.boolValue else { throw launchFailure(L("La carpeta de este proyecto ya no está disponible.")) }
        guard projectIsInScope(project.id) else { throw launchFailure(L("El proyecto no pertenece al workspace activo.")) }
        let group = activeProjectWorkspace, roots = group == nil ? [project] : scopedProjects
        for root in roots { var directory: ObjCBool = false; guard fm.fileExists(atPath: root.path, isDirectory: &directory), directory.boolValue else { throw launchFailure(L("No se encuentra el proyecto ") + root.name + L(". Revisa el workspace.")) } }
        let executionContext = workspaceExecutionContext(group, projects: roots)
        let id = UUID().uuidString, session = Session()
        var hookSettings: String?, notifyCommand: String?
        let own = Bundle.main.executablePath!
        if harness == "claude" {
            var hooks: [String: Any] = [:]
            for (event, state) in [("UserPromptSubmit", "active"), ("PreToolUse", "active"), ("PostToolUse", "active"), ("PermissionRequest", "waiting"), ("Notification", "waiting"), ("Stop", "ready"), ("StopFailure", "error"), ("SubagentStart", "subagent-start"), ("SubagentStop", "subagent-stop")] {
                let command = shellQuote(own) + " --event " + shellQuote(id) + " " + shellQuote(state)
                hooks[event] = [["hooks": [["type": "command", "command": command, "timeout": 3]]]]
            }
            hookSettings = json(["hooks": hooks])
        } else if harness == "codex" {
            notifyCommand = json([own, "--event", id, "ready"])
        }
        let selectedProfile = profiles.first { $0.id == (profileID ?? harness) && $0.enabled }
        let remote = harness == "codex" && resumeId != nil ? localCodexResumeEndpoint(root: profileRoot(profileID, harness: harness)) : nil
        var arguments = try harnessArguments(harness, base: args, cwd: project.path, resume: resumeId, bypass: bypass, hooks: hookSettings, notify: notifyCommand, remote: isTest ? nil : remote, additionalDirectories: roots.map { $0.path }.filter { $0 != project.path })
        if let selectedProfile, harness == "claude" || harness == "codex" {
            if harness == "claude" {
                arguments += ["--append-system-prompt", (executionContext.isEmpty ? "" : executionContext + "\n\n") + selectedProfile.policy + L("\nMáximo orientativo de agentes simultáneos: {0}. Usa solo la delegación necesaria para el encargo.", selectedProfile.maxDelegates)]
                if let mcp = qaMCP(selectedProfile, projectIds: group?.projectIds) { arguments += ["--mcp-config", json(["mcpServers": ["islands-qa": mcp]])] }
            } else {
                arguments += ["-c", "agents.max_concurrent_threads_per_session=\(selectedProfile.maxDelegates)"]
                if let mcp = qaMCP(selectedProfile, projectIds: group?.projectIds), let command = mcp["command"] as? String, let args = mcp["args"] as? [String] {
                    arguments += ["-c", "mcp_servers.islands-qa.command=" + jsonString(command), "-c", "mcp_servers.islands-qa.args=" + json(args)]
                }
            }
        }
        if selectedProfile == nil, !executionContext.isEmpty, harness == "claude" { arguments += ["--append-system-prompt", executionContext] }
        session.process.executableURL = Bundle.main.executableURL!.deletingLastPathComponent().appendingPathComponent("islands-pty")
        session.process.arguments = [project.path, executable] + arguments
        var environment = selectedProfile?.environment(ProcessInfo.processInfo.environment) ?? ProcessInfo.processInfo.environment
        environment["PATH"] = path; environment["TERM"] = "xterm-256color"
        environment["AGENT_ISLANDS_WORKSPACE"] = group?.id ?? ""; environment["AGENT_ISLANDS_PROJECT_ROOTS"] = json(roots.map { $0.path })
        environment["AGENT_ISLANDS_ID"] = id; environment["AGENT_ISLANDS_EVENT_COMMAND"] = own
        // Prevent a parent Claude session from incorrectly treating this independent terminal as nested.
        environment.removeValue(forKey: "CLAUDECODE")
        environment["AGENT_ISLANDS_LANGUAGE"] = AppLanguage.current
        session.process.environment = environment
        session.process.standardInput = session.input
        session.process.standardOutput = session.output
        session.process.standardError = session.output
        agents[id] = Agent(id: id, projectId: project.id, name: name?.isEmpty == false ? name! : harness.capitalized + " · " + String(sessions.count + 1), harness: harness, state: "session", managed: true, pid: 0)
        agents[id]?.workspaceId = group?.id; agents[id]?.workspaceName = group?.name; agents[id]?.executionProjectIds = group == nil ? nil : roots.map { $0.id }; agents[id]?.executionContext = executionContext.isEmpty ? nil : executionContext
        agents[id]?.profileId = selectedProfile?.id ?? harness; agents[id]?.profileName = selectedProfile?.name
        agents[id]?.threadId = resumeId; agents[id]?.bypassPermissions = bypass; agents[id]?.permissionsInherited = !isTest && remote != nil
        sessions[id] = session
        session.output.fileHandleForReading.readabilityHandler = { [weak self, weak session] handle in
            let bytes = handle.availableData
            guard !bytes.isEmpty else { handle.readabilityHandler = nil; return }
            DispatchQueue.main.async {
                guard let self, let session else { return }
                session.history.append(bytes)
                if session.history.count > 1_048_576 { session.history.removeFirst(session.history.count - 1_048_576) }
                self.emit("terminal", ["id": id, "bytes": bytes.base64EncodedString()])
                if let notice = session.signals.consume(bytes).first, Date().timeIntervalSince(session.lastBell) > 4 {
                    session.lastBell = Date()
                    // OSC/bell is a notification, not evidence of a blocker or a decision.
                    self.alert(id, message: String(notice.prefix(180))); self.publish()
                }
            }
        }
        session.process.terminationHandler = { [weak self, weak session] process in
            DispatchQueue.main.async {
                guard let self else { return }
                self.agents[id]?.state = process.terminationStatus == 0 || session?.stopped == true ? "exited" : "error"
                self.agents[id]?.message = L("Sesión cerrada ({0}).", process.terminationStatus)
                session?.output.fileHandleForReading.readabilityHandler = nil
                for child in self.agents.values.filter({ $0.parentId == id }) { self.agents[child.id]?.state = "exited" }
                self.publish()
            }
        }
        do { try session.process.run() } catch { sessions.removeValue(forKey: id); agents.removeValue(forKey: id); throw error }
        agents[id]?.pid = session.process.processIdentifier
        selectedAgent = id; publish(); emit("select", ["id": id]); return id
    }
    func run(_ executable: String, _ args: [String]) -> String {
        let result = runResult(executable, args)
        return result.1 == 0 ? result.0 : ""
    }
    func runResult(_ executable: String, _ args: [String], timeoutSeconds: Double = 8) -> (String, Int32) {
        let p = Process(), out = Pipe(); p.executableURL = URL(fileURLWithPath: executable); p.arguments = args; p.standardOutput = out; p.standardError = out
        var environment = ProcessInfo.processInfo.environment; environment["PATH"] = path; p.environment = environment
        let timeout = DispatchSource.makeTimerSource(queue: .global(qos: .utility))
        timeout.schedule(deadline: .now() + timeoutSeconds)
        timeout.setEventHandler { if p.isRunning { kill(p.processIdentifier, SIGKILL) } }
        do {
            try p.run(); timeout.resume(); defer { timeout.cancel() }
            let bytes = out.fileHandleForReading.readDataToEndOfFile(); p.waitUntilExit()
            return (String(decoding: bytes, as: UTF8.self).trimmingCharacters(in: .whitespacesAndNewlines), p.terminationStatus)
        } catch { timeout.resume(); timeout.cancel(); return (error.localizedDescription, -1) }
    }
    func scanDocker() {
        guard !dockerBusy, !isTest else { return }
        guard let binary = binaries["docker"] else { docker = ["connected": false, "containers": [], "status": "missing"]; publish(); return }
        dockerBusy = true
        DispatchQueue.global(qos: .utility).async {
            let (output, status) = self.runResult(binary, ["ps", "-a", "--format", "{{json .}}"])
            var containers: [[String: String]] = []
            if status == 0 {
                for line in output.split(separator: "\n") {
                    guard let item = (try? JSONSerialization.jsonObject(with: Data(line.utf8))) as? [String: Any] else { continue }
                    let labels = item["Labels"] as? String ?? ""
                    let compose = labels.split(separator: ",").first(where: { $0.hasPrefix("com.docker.compose.project=") }).map { String($0.dropFirst("com.docker.compose.project=".count)) } ?? ""
                    containers.append(["id": item["ID"] as? String ?? "", "name": item["Names"] as? String ?? "", "image": item["Image"] as? String ?? "", "state": item["State"] as? String ?? "unknown", "status": item["Status"] as? String ?? "", "ports": item["Ports"] as? String ?? "", "project": compose])
                }
            }
            DispatchQueue.main.async {
                self.dockerBusy = false
                self.docker = ["connected": status == 0, "containers": containers, "status": status == 0 ? "ready" : "offline"]
                self.publish()
            }
        }
    }
    func scan() {
        guard !scanBusy, !isTest else { return }; scanBusy = true
        let managed = Set(sessions.values.map { $0.process.processIdentifier })
        DispatchQueue.global(qos: .utility).async {
            let lines = self.run("/bin/ps", ["-axo", "pid=,ppid=,comm="]).split(separator: "\n")
            var rows: [(Int32, Int32, String)] = []
            let known: Set<String> = ["codex", "claude", "gemini", "opencode", "aider", "goose", "hermes"]
            for line in lines {
                let parts = line.split(maxSplits: 2, whereSeparator: { $0 == " " || $0 == "\t" })
                guard parts.count == 3, let pid = Int32(parts[0]), let parent = Int32(parts[1]) else { continue }
                let name = URL(fileURLWithPath: String(parts[2])).lastPathComponent.lowercased()
                if known.contains(name), !String(parts[2]).contains(".app/Contents/MacOS/") { rows.append((pid, parent, name)) }
            }
            let allParents = Dictionary(lines.compactMap { line -> (Int32, Int32)? in
                let parts = line.split(maxSplits: 2, whereSeparator: { $0 == " " || $0 == "\t" })
                guard parts.count >= 2, let pid = Int32(parts[0]), let parent = Int32(parts[1]) else { return nil }; return (pid, parent)
            }, uniquingKeysWith: { first, _ in first })
            func isManaged(_ pid: Int32) -> Bool {
                var p = pid
                for _ in 0..<40 { if managed.contains(p) { return true }; guard let next = allParents[p], next != p else { break }; p = next }
                return false
            }
            var discovered: [(Int32, String, String)] = []
            // Bound the scan: subprocesses never block the UI or enumerate open file contents.
            for (pid, parent, name) in rows.prefix(100) where !isManaged(pid) && !rows.contains(where: { $0.0 == parent && $0.2 == name }) {
                let cwd = self.run("/usr/sbin/lsof", ["-a", "-p", String(pid), "-d", "cwd", "-Fn"]).split(separator: "\n").first { $0.hasPrefix("n/") }.map { String($0.dropFirst()) }
                if let cwd, cwd != "/" { discovered.append((pid, name, cwd)) }
            }
            let capturedAt = Date().timeIntervalSince1970
            let snapshots = self.profiles.filter { $0.harness == "codex" && $0.enabled }.compactMap { profile -> (String, [[String: String]])? in
                guard let goals = self.readCodexGoalSnapshot(profileID: profile.id) else { return nil }; return (profile.id, goals)
            }
            let goals = snapshots.flatMap { $0.1 }
            DispatchQueue.main.async {
                self.scanBusy = false
                let live = Set(discovered.map { "external-\($0.0)" })
                self.agents = self.agents.filter { $0.value.managed || $0.value.parentId != nil || live.contains($0.key) }
                for (pid, name, cwd) in discovered {
                    let best = matchingProject(cwd, in: self.projects)
                    let project: Project
                    if let best { project = best }
                    else { project = Project(id: "observed-" + cwd, name: URL(fileURLWithPath: cwd).lastPathComponent, path: cwd); self.projects.append(project) }
                    let id = "external-\(pid)"
                    let mode = self.agents[id]?.mode ?? "work"
                    self.agents[id] = Agent(id: id, projectId: project.id, name: name.capitalized + " · " + String(pid), harness: name, state: "observed", managed: false, pid: pid, mode: mode)
                }
                // Only a successfully read ledger can clear a removed goal. A failed read keeps evidence.
                for (profileID, rows) in snapshots {
                    guard rows.count < 1000 else { continue } // A capped ledger cannot prove deletion.
                    let threads = Set(rows.compactMap { $0["thread_id"] })
                    for a in self.agents.values where a.managed && (a.profileId ?? a.harness) == profileID && a.goalStatus != nil && (a.goalUpdatedAt ?? 0) <= capturedAt {
                        if let thread = a.threadId, !threads.contains(thread) { self.agents[a.id]?.clearGoal() }
                    }
                }
                var completedByProject: [String: Int] = [:]
                for goal in goals {
                    guard let thread = goal["thread_id"], let cwd = goal["cwd"], goal["objective"] != nil else { continue }
                    let managedIds = self.agents.values.filter { $0.managed && ($0.profileId ?? $0.harness) == (goal["profileId"] ?? "codex") && $0.threadId == thread }.map { $0.id }.sorted()
                    let managedId = managedIds.first
                    let existing = matchingProject(cwd, in: self.projects)
                    let projectId = existing?.id ?? "observed-" + cwd
                    if goal["status"] == "complete", managedId == nil {
                        guard let updated = Double(goal["updated_at_ms"] ?? ""), Date().timeIntervalSince1970 - updated / 1000 < 86400, completedByProject[projectId, default: 0] < 2 else { continue }
                        completedByProject[projectId, default: 0] += 1
                    }
                    let project: Project
                    if let existing { project = existing }
                    else { project = Project(id: projectId, name: URL(fileURLWithPath: cwd).lastPathComponent, path: cwd); self.projects.append(project) }
                    let id = managedId ?? "codex-goal-" + (goal["profileId"] ?? "codex") + "-" + thread
                    if self.agents[id] == nil { self.agents[id] = Agent(id: id, projectId: project.id, name: L("Goal · ") + String((goal["title"] ?? "Codex").prefix(60)), harness: "codex", state: "observed", managed: false, pid: 0) }
                    self.agents[id]?.profileId = goal["profileId"] ?? "codex"; self.agents[id]?.profileName = self.profiles.first { $0.id == goal["profileId"] }?.name
                    for target in managedIds.isEmpty ? [id] : managedIds {
                        self.agents[target]?.threadId = thread
                        self.agents[target]?.applyGoal(goal)
                    }
                }
                self.publish()
            }
        }
    }
    // Optional, versioned, read-only adapter. Unknown/missing schemas simply return no goals.
    func sqliteRows(_ url: URL, query: String) -> [[String: String]] { sqliteRowsResult(url, query: query) ?? [] }
    func sqliteRowsResult(_ url: URL, query: String) -> [[String: String]]? {
        guard fm.fileExists(atPath: url.path) else { return nil }
        var db: OpaquePointer?
        guard sqlite3_open_v2(url.path, &db, SQLITE_OPEN_READONLY | SQLITE_OPEN_NOMUTEX, nil) == SQLITE_OK else { if db != nil { sqlite3_close(db) }; return nil }
        defer { sqlite3_close(db) }; sqlite3_busy_timeout(db, 1500)
        var statement: OpaquePointer?
        guard sqlite3_prepare_v2(db, query, -1, &statement, nil) == SQLITE_OK else {
            if CommandLine.arguments.contains("--diagnose-goals") { print("SQLite prepare:", String(cString: sqlite3_errmsg(db))) }; return nil
        }
        defer { sqlite3_finalize(statement) }
        var result: [[String: String]] = []
        var step = sqlite3_step(statement)
        while step == SQLITE_ROW {
            var row: [String: String] = [:]
            for i in 0..<sqlite3_column_count(statement) {
                if let name = sqlite3_column_name(statement, i), let value = sqlite3_column_text(statement, i) { row[String(cString: name)] = String(cString: value) }
            }
            result.append(row)
            step = sqlite3_step(statement)
        }
        return step == SQLITE_DONE ? result : nil
    }
    func readCodexGoals(profileID: String? = nil) -> [[String: String]] { (readCodexGoalSnapshot(profileID: profileID) ?? []).filter { $0["cwd"] != nil } }
    func readCodexGoalSnapshot(profileID: String? = nil) -> [[String: String]]? {
        let codexHome = profileRoot(profileID, harness: "codex")
        guard let goals = sqliteRowsResult(codexHome.appendingPathComponent("goals_1.sqlite"), query: "SELECT thread_id,objective,status,token_budget,tokens_used,updated_at_ms FROM thread_goals ORDER BY CASE WHEN status IN ('complete','completed','achieved','succeeded') THEN 1 ELSE 0 END,updated_at_ms DESC LIMIT 1000") else { return nil }
        let state = codexHome.appendingPathComponent("state_5.sqlite")
        guard let schema = sqliteRowsResult(state, query: "PRAGMA table_info(threads)") else { return nil }
        let columns = Set(schema.compactMap { $0["name"] })
        guard columns.contains("id"), columns.contains("cwd"), columns.contains("title") else { return nil }
        let title = columns.contains("name") ? "COALESCE(name,title)" : "title"
        let archived = columns.contains("archived") ? " WHERE archived=0" : ""
        guard let threads = sqliteRowsResult(state, query: "SELECT id,cwd,\(title) AS title FROM threads\(archived)") else { return nil }
        // Provider data is not ours to trust: a repeated id must not crash the app.
        let byId = Dictionary(threads.compactMap { row -> (String, [String: String])? in guard let id = row["id"] else { return nil }; return (id, row) }, uniquingKeysWith: { first, _ in first })
        return goals.map { goal in
            var result = goal
            result["profileId"] = profileID ?? "codex"
            result["raw_status"] = goal["status"]; result["status"] = normalizedGoalStatus(goal["status"])
            if let id = goal["thread_id"], let thread = byId[id], let cwd = thread["cwd"], cwd != "/", fm.fileExists(atPath: cwd) {
                result["cwd"] = cwd; result["title"] = thread["title"] ?? "Codex"
            }
            return result
        }
    }

    func listFiles(_ project: Project, relative: String) throws {
        let root = try confinedURL(root: project.path, relative: relative)
        let excluded: Set<String> = [".git", "node_modules", ".build", ".DS_Store", ".venv"]
        let urls = try fm.contentsOfDirectory(at: root, includingPropertiesForKeys: [.isDirectoryKey], options: [])
        var entries: [FileEntry] = []
        for url in urls where !excluded.contains(url.lastPathComponent) {
            let values = try url.resourceValues(forKeys: [.isDirectoryKey])
            let entryPath = relative.isEmpty ? url.lastPathComponent : relative + "/" + url.lastPathComponent
            entries.append(FileEntry(name: url.lastPathComponent, path: entryPath, directory: values.isDirectory ?? false))
        }
        entries.sort { a, b in
            if a.directory != b.directory { return a.directory }
            return a.name.localizedStandardCompare(b.name) == .orderedAscending
        }
        emit("files", ["projectId": project.id, "path": relative, "entries": (try? JSONSerialization.jsonObject(with: JSONEncoder().encode(entries))) ?? []])
    }
    func readFile(_ project: Project, relative: String) throws {
        let url = try confinedURL(root: project.path, relative: relative)
        let a = try fm.attributesOfItem(atPath: url.path)
        guard (a[.size] as? Int ?? 0) <= 2_000_000 else { message(L("Este editor abre archivos de hasta 2 MB.")); return }
        let bytes = try Data(contentsOf: url)
        guard let text = String(data: bytes, encoding: .utf8), !text.contains("\0") else { message(L("Este archivo es binario o no está codificado en UTF-8.")); return }
        emit("file", ["projectId": project.id, "path": relative, "text": text, "revision": try revision(url)])
    }
    func consumeEvents() {
        guard let urls = try? fm.contentsOfDirectory(at: eventDirectory, includingPropertiesForKeys: [.contentModificationDateKey]) else { return }
        let sorted = urls.filter { $0.pathExtension == "json" }.sorted {
            ((try? $0.resourceValues(forKeys: [.contentModificationDateKey]).contentModificationDate) ?? .distantPast) < ((try? $1.resourceValues(forKeys: [.contentModificationDateKey]).contentModificationDate) ?? .distantPast)
        }
        var changed = false
        // A second window or a test instance must never consume another app's hooks.
        let owned = sorted.filter { sessions[String($0.deletingPathExtension().lastPathComponent.prefix(36))] != nil }
        for url in owned.prefix(500) {
            guard let bytes = try? Data(contentsOf: url), bytes.count < 1_000_000, let event = (try? JSONSerialization.jsonObject(with: bytes)) as? [String: Any], let id = event["id"] as? String, let state = event["state"] as? String else { try? fm.removeItem(at: url); continue }
            let eventAt = event["at"] as? Double ?? (try? url.resourceValues(forKeys: [.contentModificationDateKey]).contentModificationDate)?.timeIntervalSince1970 ?? Date().timeIntervalSince1970
            try? fm.removeItem(at: url)
            guard let parent = agents[id], sessions[id]?.process.isRunning == true else { continue }
            guard eventAt >= (agents[id]?.stateAt ?? 0) else { continue }
            let payload = event["payload"] as? [String: Any] ?? [:]
            if let thread = (payload["thread-id"] ?? payload["session_id"]) as? String, UUID(uuidString: thread) != nil { agents[id]?.threadId = thread }
            if state == "subagent-start" || state == "subagent-stop", let sub = payload["agent_id"] as? String {
                let subId = id + ":" + sub
                agents[subId] = Agent(id: subId, projectId: parent.projectId, name: payload["agent_type"] as? String ?? "Subagente", harness: parent.harness, state: state == "subagent-start" ? "active" : "ready", managed: false, pid: parent.pid, parentId: id)
                agents[subId]?.workspaceId = parent.workspaceId; agents[subId]?.workspaceName = parent.workspaceName; agents[subId]?.executionProjectIds = parent.executionProjectIds
                changed = true; continue
            }
            guard ["active", "waiting", "ready", "error"].contains(state) else { continue }
            let text = payload["last_assistant_message"] as? String ?? payload["last-assistant-message"] as? String ?? payload["message"] as? String ?? ""
            if payload["tool_name"] as? String == "EnterPlanMode" { agents[id]?.mode = "plan" }
            if payload["tool_name"] as? String == "ExitPlanMode", payload["hook_event_name"] as? String == "PostToolUse" { agents[id]?.mode = "work" }
            if let mode = payload["islands_mode"] as? String, ["plan", "goal", "work"].contains(mode) { agents[id]?.mode = mode }
            let needsQuestion = payload["tool_name"] as? String == "AskUserQuestion" && payload["hook_event_name"] as? String == "PreToolUse"
            agents[id]?.state = needsQuestion ? "waiting" : state
            agents[id]?.stateAt = eventAt
            if needsQuestion, let questions = payload["questions"] as? [[String: Any]], let question = questions.first?["question"] as? String { agents[id]?.message = question }
            if !text.isEmpty { agents[id]?.message = String(text.prefix(12_000)) }
            if state == "ready", !text.isEmpty {
                agents[id]?.lastResponse = String(text.prefix(12_000)); agents[id]?.responseAt = Date().timeIntervalSince1970
                if let kind = agents[id]?.pendingContext {
                    agents[id]?.contextKind = kind; agents[id]?.contextResponse = String(text.prefix(12_000)); agents[id]?.contextAt = Date().timeIntervalSince1970; agents[id]?.pendingContext = nil
                }
            }
            if needsQuestion || state == "waiting" || state == "ready" || state == "error" {
                let brief = text.isEmpty ? (state == "waiting" ? L("Necesito tu atención.") : L("He terminado mi turno.")) : String(text.prefix(180))
                alert(id, message: brief)
                if voice { speak(parent.name + ". " + brief) }
            }
            changed = true
        }
        if changed { publish() }
    }
    func enableNotifications() {
        if notifications { notifications = false; UserDefaults.standard.set(false, forKey: "notifications"); publish(); return }
        UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound, .badge]) { allowed, error in
            DispatchQueue.main.async {
                self.notifications = allowed; UserDefaults.standard.set(allowed, forKey: "notifications"); self.publish()
                if let error { self.fail(error) } else if !allowed { self.message(L("Puedes permitir avisos en Ajustes del Sistema → Notificaciones → Agent Islands.")) }
            }
        }
    }
    func alert(_ id: String, message: String) {
        emit("attention", ["id": id, "message": message])
        guard notifications, let agent = agents[id] else { return }
        let content = UNMutableNotificationContent(); content.title = agent.name; content.body = message; content.sound = .default; content.userInfo = ["agentId": id]
        UNUserNotificationCenter.current().add(UNNotificationRequest(identifier: id, content: content, trigger: nil))
    }
    func userNotificationCenter(_ center: UNUserNotificationCenter, didReceive response: UNNotificationResponse, withCompletionHandler completionHandler: @escaping () -> Void) {
        DispatchQueue.main.async { self.showWindow(); if let id = response.notification.request.content.userInfo["agentId"] as? String { self.emit("select", ["id": id]) } }; completionHandler()
    }
    func speak(_ text: String) {
        synthesizer.stopSpeaking(at: .immediate)
        let utterance = AVSpeechUtterance(string: String(text.prefix(3000))); utterance.voice = AVSpeechSynthesisVoice(language: AppLanguage.locale); synthesizer.speak(utterance)
    }
    func startDictation() {
        SFSpeechRecognizer.requestAuthorization { status in
            guard status == .authorized else { DispatchQueue.main.async { self.emit("dictation", ["recording": false]); self.message(L("Permite el reconocimiento de voz en Ajustes del Sistema → Privacidad y seguridad.")) }; return }
            AVCaptureDevice.requestAccess(for: .audio) { allowed in
                DispatchQueue.main.async {
                    guard allowed else { self.emit("dictation", ["recording": false]); self.message(L("Permite el micrófono en Ajustes del Sistema → Privacidad y seguridad.")); return }
                    self.beginDictation()
                }
            }
        }
    }
    func beginDictation() {
        guard audioEngine == nil, let recognizer = SFSpeechRecognizer(locale: Locale(identifier: AppLanguage.locale)), recognizer.isAvailable else { message(L("El dictado no está disponible ahora.")); return }
        let engine = AVAudioEngine(), request = SFSpeechAudioBufferRecognitionRequest()
        request.shouldReportPartialResults = true
        if recognizer.supportsOnDeviceRecognition { request.requiresOnDeviceRecognition = true }
        let node = engine.inputNode, format = engine.inputNode.outputFormat(forBus: 0)
        guard format.sampleRate > 0, format.channelCount > 0 else { message(L("No hay un micrófono disponible.")); return }
        node.installTap(onBus: 0, bufferSize: 1024, format: format) { buffer, _ in request.append(buffer) }
        audioEngine = engine; speechRequest = request
        speechTask = recognizer.recognitionTask(with: request) { result, error in
            DispatchQueue.main.async {
                if let result { self.emit("dictation", ["text": result.bestTranscription.formattedString, "recording": !result.isFinal]) }
                if error != nil || result?.isFinal == true { self.stopDictation(); if let error { self.fail(error) } }
            }
        }
        do { engine.prepare(); try engine.start(); emit("dictation", ["recording": true]) }
        catch { stopDictation(); fail(error) }
    }
    func stopDictation() {
        guard let engine = audioEngine else { return }
        audioEngine = nil; engine.stop(); engine.inputNode.removeTap(onBus: 0); speechRequest?.endAudio(); speechRequest = nil; speechTask?.cancel(); speechTask = nil
        emit("dictation", ["recording": false])
    }
    func applicationShouldTerminate(_ sender: NSApplication) -> NSApplication.TerminateReply {
        if hasUnsavedFile && !isTest {
            let alert = NSAlert(); alert.messageText = L("Hay cambios sin guardar"); alert.informativeText = L("Vuelve al editor y pulsa ⌘S para conservarlos."); alert.addButton(withTitle: L("Volver al editor")); alert.addButton(withTitle: L("Salir sin guardar"))
            if alert.runModal() == .alertFirstButtonReturn { return .terminateCancel }
        }
        let active = sessions.values.filter { $0.process.isRunning }
        if !active.isEmpty && !isTest {
            let alert = NSAlert(); alert.messageText = active.count == 1 ? L("Hay una sesión abierta") : L("Hay {0} sesiones abiertas", active.count); alert.informativeText = L("Salir cerrará sus terminales y detendrá los agentes que has lanzado aquí."); alert.addButton(withTitle: L("Salir y cerrar sesiones")); alert.addButton(withTitle: L("Seguir trabajando"))
            if alert.runModal() != .alertFirstButtonReturn { return .terminateCancel }
        }
        stopDictation(); for s in active { s.stop() }; return .terminateNow
    }
    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool { false }
    func applicationShouldHandleReopen(_ sender: NSApplication, hasVisibleWindows flag: Bool) -> Bool { showWindow(); return true }
}

if CommandLine.arguments.contains("--diagnose-profiles") {
    let diagnostic = AppDelegate(); diagnostic.loadWorkspace()
    for name in ["claude", "codex"] { for directory in diagnostic.path.split(separator: ":") { let binary = String(directory) + "/" + name; if fm.isExecutableFile(atPath: binary) { diagnostic.binaries[name] = binary; break } } }
    diagnostic.refreshProfiles()
    print(json(diagnostic.profiles.map { ["id": $0.id, "harness": $0.harness, "configuration": $0.configRoot, "conversations": diagnostic.readSavedConversations($0.harness, profileID: $0.id).count] as [String: Any] }))
    exit(0)
}
if CommandLine.arguments.contains("--diagnose-sessions") {
    let diagnostic = AppDelegate()
    let codex = diagnostic.readSavedConversations("codex"), claude = diagnostic.readSavedConversations("claude")
    print(json(["codex": codex.count, "claude": claude.count]))
    exit(0)
}
if CommandLine.arguments.contains("--diagnose-goals") {
    let diagnostic = AppDelegate()
    let rows = diagnostic.readCodexGoals()
    print(json(["goals": rows.count, "statuses": rows.compactMap { $0["status"] }, "home": fm.homeDirectoryForCurrentUser.path, "override": ProcessInfo.processInfo.environment["CODEX_HOME"] ?? ""]))
    exit(0)
}
let app = NSApplication.shared
let delegate = AppDelegate()
app.delegate = delegate
app.setActivationPolicy(.regular)
app.run()
