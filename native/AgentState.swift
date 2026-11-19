import Foundation
import SQLite3

// A quiet/idle notification is not a request for a decision.
func confirmedHookInteraction(_ payload: [String: Any]) -> String? {
    let hook = payload["hook_event_name"] as? String ?? ""
    if payload["tool_name"] as? String == "AskUserQuestion", ["PreToolUse", "PermissionRequest"].contains(hook) { return "question" }
    if hook == "PermissionRequest" { return "approval" }
    if hook == "Elicitation" { return "question" }
    if hook == "Notification" {
        switch payload["notification_type"] as? String {
        case "permission_prompt", "worker_permission_prompt": return "approval"
        case "elicitation_dialog", "elicitation_url_dialog", "agent_needs_input": return "question"
        default: return nil
        }
    }
    return nil
}

extension AppDelegate {
    func closeManagedSession(_ id: String) {
        guard let session = sessions[id], agents[id]?.managed == true else { return }
        let closedAt = Date().timeIntervalSince1970
        agents[id]?.closedAt = closedAt
        agents[id]?.interactionKind = nil; agents[id]?.interactionSource = nil
        for child in agents.values.filter({ $0.parentId == id }) { agents[child.id]?.closedAt = closedAt }
        let running = session.process.isRunning
        session.stop()
        if !running {
            sessions.removeValue(forKey: id); if selectedAgent == id { selectedAgent = nil }; publish(); emit("sessionEnded", ["id": id, "requested": true])
        }
    }
}

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
        let available = a.closedAt == nil && !(a.managed && a.processRunning == false)
        goalNeedsAttention = available && ["blocked", "budget_limited", "usage_limited"].contains(goal ?? "")
        sessionNeedsAttention = available && a.parentId == nil && ["codex", "claude"].contains(a.harness) && ["question", "approval"].contains(a.interactionKind ?? "")
        if !available { effective = "exited" }
        else if goalNeedsAttention { effective = "blocked" }
        else if sessionNeedsAttention { effective = "waiting" }
        else if goal == "complete" { effective = "complete" }
        else if goal == "paused" { effective = "paused" }
        else if goal == "active" && a.managed && a.state != "observed" { effective = a.mode == "plan" ? "planning" : "working" }
        else if !available || a.state == "exited" { effective = "exited" }
        else if a.state == "active" { effective = a.mode == "plan" ? "planning" : "working" }
        else if a.state == "ready" { effective = "ready" }
        else if a.state == "observed" || (!a.managed && ["waiting", "error"].contains(a.state)) { effective = "observed" }
        else { effective = "idle" }
    }
}

extension Agent {
    var canContinueFromPulse: Bool {
        let control = AgentControlState(self)
        guard managed, parentId == nil, closedAt == nil, processRunning == true,
              ["codex", "claude"].contains(harness), state == "ready",
              ["ready", "paused"].contains(control.effective),
              let responseAt else { return false }
        let lastInputAt = max(taskAt ?? 0, terminalInputAt ?? 0)
        return lastInputAt > 0 && responseAt >= lastInputAt
    }

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
    var a = Agent(id: "state-test", projectId: "p", name: L("Goal"), harness: "codex", state: "waiting", managed: true, pid: 1)
    a.processRunning = true
    let samples = [("stalled", "blocked", true), ("in_progress", "working", false), ("achieved", "complete", false), ("paused", "paused", false), ("future_status", "idle", false)]
    for (raw, effective, attention) in samples {
        a.applyGoal(["status": raw, "updated_at_ms": "100000", "objective": "Resultado"])
        let control = AgentControlState(a)
        precondition(control.effective == effective && control.needsAttention == attention)
    }
    a.applyGoal(["status": "in_progress", "updated_at_ms": "200000", "objective": "Resultado"])
    a.applyGoal(["status": "stalled", "updated_at_ms": "100000"])
    precondition(a.goalStatus == "active", "Stale goal snapshots cannot restore a blocker")
    a.stateAt = 201; precondition(!AgentControlState(a).sessionNeedsAttention)
    a.interactionKind = "question"; precondition(AgentControlState(a).sessionNeedsAttention)
    a.interactionKind = nil
    a.applyGoal(["status": "achieved", "updated_at_ms": "202000", "objective": "Resultado"])
    precondition(!AgentControlState(a).needsAttention && AgentControlState(a).effective == "complete")
    a.tokenBudget = 1; a.tokensUsed = 1000
    precondition(!AgentControlState(a).needsAttention, "Budget usage is not lifecycle evidence")
    precondition(confirmedHookInteraction(["hook_event_name":"Notification","notification_type":"idle_prompt"]) == nil)
    precondition(confirmedHookInteraction(["hook_event_name":"Notification","notification_type":"auth_success"]) == nil)
    precondition(confirmedHookInteraction(["hook_event_name":"PermissionRequest"]) == "approval")
    precondition(confirmedHookInteraction(["hook_event_name":"PreToolUse","tool_name":"AskUserQuestion"]) == "question")
    precondition(confirmedHookInteraction(["hook_event_name":"Notification","notification_type":"elicitation_dialog"]) == "question")
    var shell = a; shell.harness = "shell"; shell.state = "waiting"; shell.interactionKind = "question"; shell.clearGoal()
    precondition(!AgentControlState(shell).needsAttention)
    var legacy = a; legacy.state = "waiting"; legacy.stateAt = nil; legacy.clearGoal()
    precondition(legacy.state == "session" && !AgentControlState(legacy).needsAttention)
    a.clearGoal(); precondition(a.goalStatus == nil && a.goalObjective == nil && a.mode == "work")
    var resumable = a
    resumable.state = "ready"; resumable.taskAt = 200; resumable.responseAt = 201
    precondition(resumable.canContinueFromPulse)
    resumable.interactionKind = "approval"; precondition(!resumable.canContinueFromPulse)
    resumable.interactionKind = nil; resumable.taskAt = 202
    precondition(!resumable.canContinueFromPulse, "A previous response cannot authorize continuing a newer task")
    resumable.responseAt = 203; resumable.terminalInputAt = 204
    precondition(!resumable.canContinueFromPulse, "Direct terminal input can change the next action")
    resumable.responseAt = 205; precondition(resumable.canContinueFromPulse)
    resumable.processRunning = false; precondition(!resumable.canContinueFromPulse)
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
