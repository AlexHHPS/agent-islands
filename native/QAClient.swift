import Foundation

// One bounded stdio connection to QA. No shell, listener port or credentials in the WebView.
final class QAClient {
    private let node: String, script: String, root: String, environment: [String: String]
    private let queue = DispatchQueue(label: "islands.qa-client", qos: .userInitiated)
    private var process: Process?
    private var input: Pipe?
    private var output: Pipe?
    private var buffer = Data()
    private var pending: [String: ([String: Any]) -> Void] = [:]
    private var deadlines: [String: DispatchWorkItem] = [:]
    init(node: String, script: String, root: String, environment: [String: String]) {
        self.node = node; self.script = script; self.root = root
        self.environment = environment.filter { key, _ in !key.hasPrefix("ANTHROPIC_") && !key.hasPrefix("OPENAI_") && !key.hasPrefix("CLAUDE_CODE_") && !["CLAUDE_CONFIG_DIR", "CODEX_HOME", "CLAUDECODE"].contains(key) }
    }
    private func start() throws {
        if process?.isRunning == true { return }
        if process != nil { fail("QA se ha desconectado. Vuelve a intentar la operación."); output?.fileHandleForReading.readabilityHandler = nil; buffer.removeAll() }
        let p = Process(), stdin = Pipe(), stdout = Pipe()
        p.executableURL = URL(fileURLWithPath: node)
        p.arguments = ["--disable-warning=ExperimentalWarning", script, "--broker", "--root", root]
        p.environment = environment; p.standardInput = stdin; p.standardOutput = stdout; p.standardError = FileHandle.nullDevice
        stdout.fileHandleForReading.readabilityHandler = { [weak self, weak p] handle in
            let bytes = handle.availableData
            guard !bytes.isEmpty else { handle.readabilityHandler = nil; return }
            self?.queue.async { [weak self, weak p] in
                guard let self, self.process === p else { return }
                self.buffer.append(bytes)
                guard self.buffer.count <= 16_000_000 else { self.fail("La respuesta de QA supera el límite."); p?.terminate(); return }
                while let newline = self.buffer.firstIndex(of: 10) {
                    let data = self.buffer.prefix(upTo: newline); self.buffer.removeSubrange(...newline)
                    guard let reply = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any], let id = reply["id"] as? String else { self.fail("Respuesta de QA no válida."); p?.terminate(); return }
                    self.finish(id, reply: reply)
                }
            }
        }
        p.terminationHandler = { [weak self, weak p] _ in self?.queue.async { [weak self, weak p] in
            guard let self, self.process === p else { return }
            self.output?.fileHandleForReading.readabilityHandler = nil; self.process = nil; self.buffer.removeAll()
            self.fail("QA se ha desconectado. Vuelve a intentar la operación.")
        } }
        process = p; input = stdin; output = stdout
        do { try p.run() } catch { process = nil; throw error }
    }
    func request(_ method: String, params: [String: Any], completion: @escaping ([String: Any]) -> Void) {
        queue.async {
            guard self.pending.count < 100 else { DispatchQueue.main.async { completion(["error": "QA tiene demasiadas operaciones pendientes."]) }; return }
            let id = UUID().uuidString
            do {
                try self.start()
                self.pending[id] = completion
                let timeout = DispatchWorkItem { self.finish(id, reply: ["error": "La operación de QA agotó su tiempo. Consulta su estado antes de repetirla."]) }
                self.deadlines[id] = timeout; self.queue.asyncAfter(deadline: .now() + 125, execute: timeout)
                var data = try JSONSerialization.data(withJSONObject: ["id": id, "method": method, "params": params]); data.append(10)
                guard data.count <= 2_000_000 else { throw NSError(domain: "QA", code: 1, userInfo: [NSLocalizedDescriptionKey: "La petición supera el límite."]) }
                try self.input?.fileHandleForWriting.write(contentsOf: data)
            } catch {
                if self.pending[id] != nil { self.finish(id, reply: ["error": error.localizedDescription]) }
                else { DispatchQueue.main.async { completion(["error": error.localizedDescription]) } }
            }
        }
    }
    private func finish(_ id: String, reply: [String: Any]) {
        deadlines.removeValue(forKey: id)?.cancel()
        guard let callback = pending.removeValue(forKey: id) else { return }
        DispatchQueue.main.async { callback(reply) }
    }
    private func fail(_ message: String) { for id in Array(pending.keys) { finish(id, reply: ["error": message]) } }
    func close() { queue.async { self.input?.fileHandleForWriting.closeFile(); self.process?.terminate(); self.fail("La conexión de QA se ha cerrado.") } }
}
