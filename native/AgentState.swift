import Foundation
import SQLite3

// Goal lifecycle and terminal activity are independent evidence channels.
func normalizedGoalStatus(_ raw: String?) -> String? {
    guard let raw, !raw.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return nil }
    let key = raw.trimmingCharacters(in: .whitespacesAndNewlines).lowercased().replacingOccurrences(of: "-", with: "_").replacingOccurrences(of: " ", with: "_")
    switch key {
    case "active", "in_progress", "running": return "active"
    case "blocked", "stalled": return "blocked"
    case "complete", "completed", "achieved", "succeeded": return "complete"
    case "paused": return "paused"
    case "budget_limited": return "budget_limited"
    case "usage_limited": return "usage_limited"
    default: return "unknown"
    }
}

struct AgentControlState {
    let goal: String?
    let effective: String
    let goalNeedsAttention: Bool
    let sessionNeedsAttention: Bool
    var needsAttention: Bool { goalNeedsAttention || sessionNeedsAttention }
    init(_ a: Agent) {
        goal = normalizedGoalStatus(a.goalStatus)
        goalNeedsAttention = ["blocked", "budget_limited", "usage_limited"].contains(goal ?? "")
        let fresh = a.stateAt.map { $0 > (a.goalUpdatedAt ?? 0) } ?? false
        let available = !(a.managed && a.processRunning == false)
        sessionNeedsAttention = available && ["waiting", "error"].contains(a.state) && (goal == nil || goal == "unknown" || fresh)
        if goalNeedsAttention { effective = "blocked" }
        else if sessionNeedsAttention { effective = a.state }
        else if goal == "complete" { effective = "complete" }
        else if goal == "paused" { effective = "paused" }
        else if !available || a.state == "exited" { effective = "exited" }
        else if a.state == "active" { effective = a.mode == "plan" ? "planning" : "working" }
        else if a.state == "ready" { effective = "ready" }
        else if a.state == "observed" || a.state == "waiting" || a.state == "error" { effective = "observed" }
        else { effective = "idle" }
    }
}

extension Agent {
    // Older snapshots must never undo a more recent resume or completion.
    mutating func applyGoal(_ row: [String: String]) {
        let updated = Double(row["updated_at_ms"] ?? "").map { $0 / 1000 }
        if let previous = goalUpdatedAt, let updated, updated < previous { return }
        goalRawStatus = row["raw_status"] ?? row["status"]
        goalStatus = normalizedGoalStatus(goalRawStatus)
        goalUpdatedAt = updated
        goalObjective = row["objective"]
        tokenBudget = Int(row["token_budget"] ?? "")
        tokensUsed = Int(row["tokens_used"] ?? "")
        mode = "goal"
    }
    mutating func clearGoal() {
        if goalStatus != nil && state == "waiting" && stateAt == nil { state = managed ? "session" : "observed" }
        goalStatus = nil; goalRawStatus = nil; goalObjective = nil; goalUpdatedAt = nil; tokenBudget = nil; tokensUsed = nil
        if mode == "goal" { mode = "work" }
    }
}

func agentStateSelfTests() {
    var a = Agent(id: "state-test", projectId: "p", name: "Goal", harness: "codex", state: "waiting", managed: true, pid: 1)
    a.processRunning = true
    let samples = [("stalled", "blocked", true), ("in_progress", "observed", false), ("achieved", "complete", false), ("paused", "paused", false), ("future_status", "waiting", true)]
    for (raw, effective, attention) in samples {
        a.applyGoal(["status": raw, "updated_at_ms": "100000", "objective": "Resultado"])
        let control = AgentControlState(a)
        precondition(control.effective == effective && control.needsAttention == attention)
    }
    a.applyGoal(["status": "in_progress", "updated_at_ms": "200000", "objective": "Resultado"])
    a.applyGoal(["status": "stalled", "updated_at_ms": "100000"])
    precondition(a.goalStatus == "active", "Stale goal snapshots cannot restore a blocker")
    a.stateAt = 201; precondition(AgentControlState(a).sessionNeedsAttention)
    a.applyGoal(["status": "achieved", "updated_at_ms": "202000", "objective": "Resultado"])
    precondition(!AgentControlState(a).needsAttention && AgentControlState(a).effective == "complete")
    a.tokenBudget = 1; a.tokensUsed = 1000
    precondition(!AgentControlState(a).needsAttention, "Budget usage is not lifecycle evidence")
    var legacy = a; legacy.state = "waiting"; legacy.stateAt = nil; legacy.clearGoal()
    precondition(legacy.state == "session" && !AgentControlState(legacy).needsAttention)
    a.clearGoal(); precondition(a.goalStatus == nil && a.goalObjective == nil && a.mode == "work")
    print("PASS: goal aliases, stalled/resumed/achieved transitions, stale snapshot rejection, independent fresh terminal decisions and explicit budget states")
}

func goalLedgerSmokeTests(_ app: AppDelegate, directory: URL) -> Bool {
    let root = directory.appendingPathComponent("goal-ledger")
    let original = app.profiles
    defer { app.profiles = original }
    do {
        try fm.createDirectory(at: root, withIntermediateDirectories: true)
        app.profiles.append(HarnessProfile(id: "goal-ledger-test", name: "Ledger fixture", harness: "codex", executable: "/bin/cat", configRoot: root.path))
        func sql(_ name: String, _ text: String) throws {
            var db: OpaquePointer?
            guard sqlite3_open(root.appendingPathComponent(name).path, &db) == SQLITE_OK else { throw launchFailure("Fixture DB") }
            defer { sqlite3_close(db) }
            guard sqlite3_exec(db, text, nil, nil, nil) == SQLITE_OK else { throw launchFailure("Fixture SQL") }
        }
        try sql("goals_1.sqlite", "CREATE TABLE thread_goals(thread_id TEXT,objective TEXT,status TEXT,token_budget INT,tokens_used INT,updated_at_ms INT); INSERT INTO thread_goals VALUES('fixture','Outcome','stalled',100,5,100000);")
        // Older registries do not have the optional name column.
        let cwd = root.path.replacingOccurrences(of: "'", with: "''")
        try sql("state_5.sqlite", "CREATE TABLE threads(id TEXT,cwd TEXT,title TEXT,archived INT); INSERT INTO threads VALUES('fixture','\(cwd)','Fixture',0);")
        guard let row = app.readCodexGoalSnapshot(profileID: "goal-ledger-test")?.first, row["status"] == "blocked", row["raw_status"] == "stalled", row["cwd"] == root.path else { return false }
        var agent = Agent(id: "fixture", projectId: "p", name: "Fixture", harness: "codex", state: "waiting", managed: false, pid: 0)
        agent.applyGoal(row)
        guard AgentControlState(agent).needsAttention else { return false }
        try sql("goals_1.sqlite", "UPDATE thread_goals SET status='in_progress',updated_at_ms=200000;")
        agent.applyGoal(app.readCodexGoalSnapshot(profileID: "goal-ledger-test")!.first!)
        guard !AgentControlState(agent).needsAttention else { return false }
        try sql("goals_1.sqlite", "UPDATE thread_goals SET status='achieved',updated_at_ms=300000;")
        agent.applyGoal(app.readCodexGoalSnapshot(profileID: "goal-ledger-test")!.first!)
        guard AgentControlState(agent).effective == "complete" else { return false }
        try sql("goals_1.sqlite", "DELETE FROM thread_goals;")
        guard app.readCodexGoalSnapshot(profileID: "goal-ledger-test")?.isEmpty == true else { return false }
        try sql("goals_1.sqlite", "DROP TABLE thread_goals;")
        return app.readCodexGoalSnapshot(profileID: "goal-ledger-test") == nil
    } catch { return false }
}
