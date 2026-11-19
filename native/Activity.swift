import Cocoa
import UserNotifications

/// What the app does when an agent reaches a state that matters, chosen per state and per channel
/// (the Program Activity model in Rex: Working, Blocked, Error and Done each pick their outputs).
/// The card in the main window always shows the state; these channels reach you outside the app.
let activityStates = ["attention", "error", "done"]
let activityChannelNames = ["notification", "dock", "sound"]
let defaultActivityChannels: [String: [String: Bool]] = [
    "attention": ["notification": true, "dock": true, "sound": true],
    "error": ["notification": true, "dock": true, "sound": true],
    // A finished turn is not waiting for anyone, so it never counts in the Dock badge.
    "done": ["notification": true, "dock": false, "sound": false],
]

func isActivityChannel(_ state: String, _ channel: String) -> Bool {
    activityStates.contains(state) && activityChannelNames.contains(channel) && !(state == "done" && channel == "dock")
}

/// Stored values override the defaults one by one, so a new state or channel arrives with its default.
func mergedActivityChannels(_ stored: Any?) -> [String: [String: Bool]] {
    var result = defaultActivityChannels
    guard let stored = stored as? [String: Any] else { return result }
    for state in activityStates {
        guard let channels = stored[state] as? [String: Any] else { continue }
        for channel in activityChannelNames where isActivityChannel(state, channel) {
            if let value = channels[channel] as? Bool { result[state]?[channel] = value }
        }
    }
    return result
}

/// The kind of event a hook or terminal signal represents.
func activityKind(interaction: String?, state: String) -> String {
    interaction != nil ? "attention" : state == "error" ? "error" : "done"
}

extension AppDelegate {
    func activityChannel(_ state: String, _ channel: String) -> Bool { activityChannels[state]?[channel] ?? false }

    func setActivityChannel(_ b: [String: Any]) {
        guard let state = b["state"] as? String, let channel = b["channel"] as? String, let value = b["value"] as? Bool, isActivityChannel(state, channel) else { return }
        activityChannels[state]?[channel] = value
        UserDefaults.standard.set(activityChannels, forKey: "activityChannels")
        // macOS draws the Dock badge only for apps allowed to badge; ask when the user turns it on.
        if channel == "dock", value { UNUserNotificationCenter.current().requestAuthorization(options: [.badge]) { _, _ in } }
        publish()
    }

    /// Agents waiting for you (and failed ones, if chosen) as a number on the Dock icon, as Mail shows unread mail.
    func updateDockBadge() {
        let open = agents.values.filter { agentIsInScope($0) && $0.closedAt == nil }
        var count = 0
        if activityChannel("attention", "dock") { count += open.filter { AgentControlState($0).needsAttention }.count }
        if activityChannel("error", "dock") { count += open.filter { $0.state == "error" && !AgentControlState($0).needsAttention }.count }
        let label = count > 0 ? String(count) : nil
        if NSApp.dockTile.badgeLabel != label { NSApp.dockTile.badgeLabel = label }
    }

    /// Notification and sound for one event. Sound plays on its own when the notification is off.
    func deliverActivity(_ agent: Agent, message: String, kind: String) {
        let wantsNotification = notifications && activityChannel(kind, "notification")
        let wantsSound = activityChannel(kind, "sound")
        if wantsNotification {
            let content = UNMutableNotificationContent(); content.title = agent.name; content.body = message
            content.sound = wantsSound ? .default : nil; content.userInfo = ["agentId": agent.id]
            UNUserNotificationCenter.current().add(UNNotificationRequest(identifier: agent.id, content: content, trigger: nil))
        } else if wantsSound {
            NSSound(named: kind == "done" ? "Glass" : "Funk")?.play()
        }
    }
}

func activitySelfTests() {
    let merged = mergedActivityChannels(["attention": ["sound": false], "done": ["dock": true, "notification": false], "bogus": ["x": true]])
    precondition(merged["attention"]?["sound"] == false && merged["attention"]?["notification"] == true, "Stored values override defaults one by one")
    precondition(merged["done"]?["dock"] == false, "A finished turn never counts in the Dock badge")
    precondition(merged["done"]?["notification"] == false && merged["error"] == defaultActivityChannels["error"])
    precondition(mergedActivityChannels("garbage") == defaultActivityChannels)
    precondition(!isActivityChannel("done", "dock") && isActivityChannel("error", "dock") && !isActivityChannel("working", "sound"))
    precondition(activityKind(interaction: "approval", state: "waiting") == "attention" && activityKind(interaction: nil, state: "error") == "error" && activityKind(interaction: nil, state: "ready") == "done")
    print("PASS: activity channels per state, defaults, Dock badge scope and event kinds")
}
