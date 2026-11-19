import Foundation

/// Coalesces PTY output so the web view receives one message per session per frame
/// instead of one per read, and holds output back while the window cannot be seen.
/// Held sessions are listed for a single replay from history when the window returns,
/// so a sleeping display never builds a backlog the interface has to chew through.
final class TerminalOutputBatcher {
    private(set) var pending: [String: Data] = [:]
    private(set) var stale: Set<String> = []
    private(set) var visible = true

    /// Queues bytes for the next flush. Returns true when the caller must schedule a flush.
    func add(_ id: String, _ bytes: Data) -> Bool {
        guard visible else { stale.insert(id); return false }
        let wasEmpty = pending.isEmpty
        pending[id, default: Data()].append(bytes)
        return wasEmpty
    }

    /// Returns queued output in a stable order and clears the queue.
    func drain() -> [(id: String, bytes: Data)] {
        let batch = pending.keys.sorted().compactMap { id in pending[id].map { (id: id, bytes: $0) } }
        pending = [:]
        return batch
    }

    /// Updates window visibility. Returns the sessions that need a replay from history.
    func setVisible(_ isVisible: Bool) -> [String] {
        if !isVisible {
            visible = false
            stale.formUnion(pending.keys)
            pending = [:]
            return []
        }
        guard !visible else { return [] }
        visible = true
        let replay = stale.sorted()
        stale = []
        return replay
    }
}

func terminalOutputSelfTests() {
    let batcher = TerminalOutputBatcher()
    precondition(batcher.add("b", Data("1".utf8)), "First output schedules a flush")
    precondition(!batcher.add("b", Data("2".utf8)), "Later output joins the scheduled flush")
    precondition(!batcher.add("a", Data("x".utf8)))
    let batch = batcher.drain()
    precondition(batch.map(\.id) == ["a", "b"] && batch[1].bytes == Data("12".utf8), "One message per session, bytes kept in order")
    precondition(batcher.drain().isEmpty && batcher.add("a", Data("y".utf8)), "A drained queue schedules again")

    precondition(batcher.setVisible(false).isEmpty)
    precondition(batcher.pending.isEmpty && batcher.stale == ["a"], "Unsent output becomes a replay when the window hides")
    precondition(!batcher.add("c", Data("z".utf8)) && batcher.pending.isEmpty, "Hidden windows queue nothing")
    precondition(batcher.setVisible(false).isEmpty, "Repeated hide notifications are harmless")
    precondition(batcher.setVisible(true) == ["a", "c"], "Returning replays every session that produced output")
    precondition(batcher.setVisible(true).isEmpty && batcher.stale.isEmpty, "Replays happen once")
}
