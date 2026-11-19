import Cocoa
import WebKit

/// Marks both pages as running inside the app so CSS can let the system blur show through.
let isAppSource = "document.documentElement.classList.add('is-app');"
/// Events the settings page receives. Terminal traffic stays in the main window.
let settingsEvents: Set<String> = ["snapshot", "appearance", "navigationLayout", "interfaceStyle", "accentColor", "settingsState", "settingsSection", "error"]
/// Actions the settings page may send. Everything else is ignored.
let settingsActions: Set<String> = ["ready", "language", "notifications", "voice", "appearance", "openOperations", "dragRegions", "activityChannel", "navigationLayout", "interfaceStyle", "accentColor"]
let settingsSections: Set<String> = ["general", "alerts", "integrations", "ai", "help", "about"]
let appearanceModes: Set<String> = ["system", "light", "dark"]
/// Where the main window puts its navigation: a toolbar above the content, or vertical tabs on one side.
let navigationLayouts: Set<String> = ["top", "left", "right"]
/// Classic: opaque panes over a sidebar blur. Glass: the whole window blurs and panes float as tinted glass (Rex's Interface style).
let interfaceStyles: Set<String> = ["classic", "glass"]
/// The app's accent (Settings → General → Color de acento). "system" follows the macOS accent colour.
let accentColors: Set<String> = ["green", "blue", "purple", "pink", "red", "orange", "yellow", "graphite", "system"]

/// Rectangles in page coordinates (CSS px, top-left origin) where a mouse-down moves the window.
struct DragRegions {
    var regions: [CGRect] = []
    var exclude: [CGRect] = []
    func contains(_ point: CGPoint) -> Bool {
        regions.contains { $0.contains(point) } && !exclude.contains { $0.contains(point) }
    }
}

func parseRects(_ value: Any?) -> [CGRect] {
    guard let list = value as? [[Any]] else { return [] }
    return list.prefix(200).compactMap { item in
        let n = item.compactMap { ($0 as? NSNumber)?.doubleValue }
        guard n.count == 4, n.allSatisfy({ $0.isFinite }), n[2] > 0, n[3] > 0 else { return nil }
        return CGRect(x: n[0], y: n[1], width: n[2], height: n[3])
    }
}

extension AppDelegate {
    /// Puts the page over a behind-window blur. The page must be transparent (drawsBackground false).
    func vibrantContainer(for page: WKWebView, material: NSVisualEffectView.Material = .sidebar) -> NSView {
        let blur = NSVisualEffectView()
        blur.material = material
        blur.blendingMode = .behindWindow
        blur.state = .followsWindowActiveState
        page.translatesAutoresizingMaskIntoConstraints = false
        blur.addSubview(page)
        NSLayoutConstraint.activate([
            page.leadingAnchor.constraint(equalTo: blur.leadingAnchor), page.trailingAnchor.constraint(equalTo: blur.trailingAnchor),
            page.topAnchor.constraint(equalTo: blur.topAnchor), page.bottomAnchor.constraint(equalTo: blur.bottomAnchor),
        ])
        return blur
    }

    // MARK: Appearance

    func applyAppearance(_ mode: String) {
        let value = appearanceModes.contains(mode) ? mode : "system"
        NSApp.appearance = value == "light" ? NSAppearance(named: .aqua) : value == "dark" ? NSAppearance(named: .darkAqua) : nil
        UserDefaults.standard.set(value, forKey: "appearance")
    }
    // Pages ask for the appearance once they load; the navigation layout travels with it.
    func emitAppearance() { emit("appearance", ["mode": UserDefaults.standard.string(forKey: "appearance") ?? "system"]); emitNavigationLayout(); emitInterfaceStyle(); emitAccentColor() }
    var interfaceStyle: String { UserDefaults.standard.string(forKey: "interfaceStyle") ?? "classic" }
    func emitInterfaceStyle() { emit("interfaceStyle", ["style": interfaceStyle]) }
    /// Glass blurs the whole window with a material that follows light and dark (.hudWindow is always dark and
    /// would drag the page into dark mode); the page then draws its panes as tinted glass over it.
    func applyInterfaceStyle() { (window?.contentView as? NSVisualEffectView)?.material = interfaceStyle == "glass" ? .fullScreenUI : .sidebar }
    func setInterfaceStyle(_ b: [String: Any]) {
        guard let style = b["style"] as? String, interfaceStyles.contains(style) else { return }
        UserDefaults.standard.set(style, forKey: "interfaceStyle"); applyInterfaceStyle(); emitInterfaceStyle()
    }
    var accentColor: String { UserDefaults.standard.string(forKey: "accentColor").flatMap { accentColors.contains($0) ? $0 : nil } ?? "green" }
    func emitAccentColor() { emit("accentColor", ["accent": accentColor]) }
    func setAccentColor(_ b: [String: Any]) {
        guard let accent = b["accent"] as? String, accentColors.contains(accent) else { return }
        UserDefaults.standard.set(accent, forKey: "accentColor"); emitAccentColor()
    }
    func emitNavigationLayout() { emit("navigationLayout", ["layout": UserDefaults.standard.string(forKey: "navigationLayout") ?? "top"]) }
    func setNavigationLayout(_ b: [String: Any]) {
        guard let layout = b["layout"] as? String, navigationLayouts.contains(layout) else { return }
        UserDefaults.standard.set(layout, forKey: "navigationLayout"); emitNavigationLayout()
    }

    // MARK: Language in every window

    func applyLanguage(_ language: String, from source: WKWebView?) {
        AppLanguage.set(language); setupMenu()
        for page in [web, settingsWeb].compactMap({ $0 }) {
            let controller = page.configuration.userContentController
            let otherScripts = controller.userScripts.filter { !$0.source.hasPrefix("window.islandsLanguage=") }
            controller.removeAllUserScripts()
            for script in otherScripts { controller.addUserScript(script) }
            controller.addUserScript(WKUserScript(source: AppLanguage.bootstrapSource, injectionTime: .atDocumentStart, forMainFrameOnly: true))
            // notify:false keeps the change from echoing back to native.
            if page !== source { page.evaluateJavaScript("window.I18n&&I18n.language!==\(jsonString(language))&&I18n.setLanguage(\(jsonString(language)),{notify:false})", completionHandler: nil) }
        }
        settingsWindow?.title = L("Ajustes")
        if let menu = statusItem?.menu { menu.removeAllItems(); menu.addItem(withTitle: L("Abrir Agent Islands"), action: #selector(showWindow), keyEquivalent: ""); menu.addItem(withTitle: L("Ajustes…"), action: #selector(openSettingsFromMenu), keyEquivalent: ""); menu.addItem(.separator()); menu.addItem(withTitle: L("Salir"), action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q") }
    }

    // MARK: Settings window

    /// One settings window, like the Apple apps: ⌘, focuses it if it is already open.
    func openSettings(section: String = "general") {
        let target = settingsSections.contains(section) ? section : "general"
        if let settingsWindow, let settingsWeb {
            settingsWeb.evaluateJavaScript("window.showSection&&showSection(\(jsonString(target)))", completionHandler: nil)
            centerOnMainScreen(settingsWindow)
            settingsWindow.makeKeyAndOrderFront(nil); NSApp.activate(ignoringOtherApps: true)
            return
        }
        let config = WKWebViewConfiguration()
        config.userContentController.add(self, name: "native")
        config.userContentController.addUserScript(WKUserScript(source: AppLanguage.bootstrapSource, injectionTime: .atDocumentStart, forMainFrameOnly: true))
        config.userContentController.addUserScript(WKUserScript(source: isAppSource, injectionTime: .atDocumentStart, forMainFrameOnly: true))
        config.preferences.javaScriptCanOpenWindowsAutomatically = false
        // Tab reaches every control, not only text fields, whatever the system Keyboard Navigation setting.
        config.preferences.tabFocusesLinks = true
        let page = WKWebView(frame: .zero, configuration: config)
        page.navigationDelegate = self
        page.uiDelegate = self
        page.setValue(false, forKey: "drawsBackground")
        let w = NSWindow(contentRect: NSRect(x: 0, y: 0, width: 760, height: 560), styleMask: [.titled, .closable, .miniaturizable, .resizable, .fullSizeContentView], backing: .buffered, defer: false)
        w.title = L("Ajustes")
        w.titlebarAppearsTransparent = true
        w.titleVisibility = .hidden
        w.minSize = NSSize(width: 640, height: 440)
        w.collectionBehavior.insert(.fullScreenNone)
        w.isReleasedWhenClosed = false
        w.contentView = vibrantContainer(for: page)
        w.setFrameAutosaveName("islands-settings")
        if !w.setFrameUsingName("islands-settings") { centerOnMainScreen(w, force: true) }
        settingsWindow = w; settingsWeb = page
        keepTrafficLightsCentered(in: w)
        NotificationCenter.default.addObserver(forName: NSWindow.willCloseNotification, object: w, queue: .main) { [weak self] _ in
            guard let self else { return }
            self.settingsWeb?.configuration.userContentController.removeScriptMessageHandler(forName: "native")
            if let page = self.settingsWeb { self.dragRegions[ObjectIdentifier(page)] = nil }
            self.settingsWeb = nil; self.settingsWindow = nil
        }
        let ui = Bundle.main.resourceURL!.appendingPathComponent("ui", isDirectory: true).resolvingSymlinksInPath()
        var parts = URLComponents(url: ui.appendingPathComponent("settings.html"), resolvingAgainstBaseURL: false)!
        parts.queryItems = [URLQueryItem(name: "section", value: target)]
        page.loadFileURL(parts.url!, allowingReadAccessTo: ui)
        w.makeKeyAndOrderFront(nil); NSApp.activate(ignoringOtherApps: true)
    }

    /// With several displays macOS would open a new window on the primary one; keep it with the main window.
    func centerOnMainScreen(_ w: NSWindow, force: Bool = false) {
        guard let screen = window?.screen ?? NSScreen.main else { return }
        if !force, w.screen == screen, w.isVisible { return }
        let area = screen.visibleFrame, size = w.frame.size
        w.setFrameOrigin(NSPoint(x: area.midX - size.width / 2, y: area.midY - size.height / 2))
    }

    func handleSettingsMessage(_ action: String, _ b: [String: Any]) {
        switch action {
        case "ready":
            emitAppearance(); publish()
            emit("settingsState", ["aiSource": aiConfiguration()?.source ?? "", "version": Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? ""])
        case "language":
            guard let language = b["language"] as? String, AppLanguage.supported.contains(language) else { return }
            applyLanguage(language, from: settingsWeb)
        case "notifications": enableNotifications()
        case "voice": voice.toggle(); UserDefaults.standard.set(voice, forKey: "voice"); publish()
        case "activityChannel": setActivityChannel(b)
        case "navigationLayout": setNavigationLayout(b)
        case "interfaceStyle": setInterfaceStyle(b)
        case "accentColor": setAccentColor(b)
        case "appearance":
            guard let mode = b["mode"] as? String, appearanceModes.contains(mode) else { return }
            applyAppearance(mode); emitAppearance()
        case "openOperations":
            let tab = ["ai", "profiles", "qa", "environments", "health"].contains(b["tab"] as? String ?? "") ? b["tab"] as! String : "ai"
            showWindow()
            web.evaluateJavaScript("window.openOperations&&openOperations(\(jsonString(tab)))", completionHandler: nil)
        case "dragRegions": if let page = settingsWeb { storeDragRegions(b, for: page) }
        default: break
        }
    }

    /// Messages from the main page that belong to the window shell rather than to agents. Returns true when handled.
    func handleShellMessage(_ action: String, _ b: [String: Any]) -> Bool {
        switch action {
        case "openSettings": openSettings(section: b["section"] as? String ?? "general")
        case "appearance":
            guard let mode = b["mode"] as? String, appearanceModes.contains(mode) else { return true }
            applyAppearance(mode); emitAppearance()
        case "dragRegions": storeDragRegions(b, for: web)
        case "navigationLayout": setNavigationLayout(b)
        case "interfaceStyle": setInterfaceStyle(b)
        case "accentColor": setAccentColor(b)
        default: return false
        }
        return true
    }

    // MARK: Window dragging from page regions

    func storeDragRegions(_ b: [String: Any], for page: WKWebView) {
        dragRegions[ObjectIdentifier(page)] = DragRegions(regions: parseRects(b["regions"]), exclude: parseRects(b["exclude"]))
    }

    /// WKWebView swallows mouse-downs, so the window never moves from the transparent titlebar area.
    /// The page reports where its [data-drag] strips are; a press there drags the window, a double-click zooms.
    /// Close, minimize and zoom, with a margin around them so a slightly missed click still reaches the button.
    func isOnWindowButton(_ w: NSWindow, _ event: NSEvent) -> Bool {
        [.closeButton, .miniaturizeButton, .zoomButton].compactMap { w.standardWindowButton($0) }.contains { button in
            button.bounds.insetBy(dx: -4, dy: -4).contains(button.convert(event.locationInWindow, from: nil))
        }
    }
    /// Centres the traffic lights in the 52pt toolbar strip, as Finder, Mail and System Settings do with a unified
    /// toolbar. The window has no NSToolbar (the page draws its own), so AppKit would leave them in a 28pt title bar.
    /// AppKit lays the title bar out again on resize and full screen, so this runs after each of those.
    func centerTrafficLights(in w: NSWindow, stripHeight: CGFloat = 52, leading: CGFloat = 20) {
        guard !w.styleMask.contains(.fullScreen), let close = w.standardWindowButton(.closeButton),
              let titlebar = close.superview, let container = titlebar.superview else { return }
        let buttons = [NSWindow.ButtonType.closeButton, .miniaturizeButton, .zoomButton].compactMap { w.standardWindowButton($0) }
        let spacing = buttons.count > 1 ? buttons[1].frame.minX - buttons[0].frame.minX : 20
        var frame = container.frame
        frame.size.height = stripHeight
        frame.origin.y = w.frame.height - stripHeight
        if container.frame != frame { container.frame = frame }
        for (i, button) in buttons.enumerated() {
            let origin = NSPoint(x: leading + CGFloat(i) * spacing, y: ((titlebar.frame.height - button.frame.height) / 2).rounded())
            if button.frame.origin != origin { button.setFrameOrigin(origin) }
        }
    }

    func keepTrafficLightsCentered(in w: NSWindow) {
        centerTrafficLights(in: w)
        for name in [NSWindow.didResizeNotification, NSWindow.didEndLiveResizeNotification, NSWindow.didExitFullScreenNotification, NSWindow.didBecomeKeyNotification] {
            NotificationCenter.default.addObserver(forName: name, object: w, queue: .main) { [weak self, weak w] _ in
                guard let self, let w else { return }
                self.centerTrafficLights(in: w)
            }
        }
    }

    func installWindowDragMonitor() {
        guard dragMonitor == nil else { return }
        dragMonitor = NSEvent.addLocalMonitorForEvents(matching: .leftMouseDown) { [weak self] event in
            guard let self, let w = event.window, !event.modifierFlags.contains(.control) else { return event }
            let page: WKWebView? = w === self.window ? self.web : w === self.settingsWindow ? self.settingsWeb : nil
            guard let page, let regions = self.dragRegions[ObjectIdentifier(page)] else { return event }
            // Controls AppKit draws over the page (the traffic lights) keep their clicks. The title bar view itself
            // also sits over the top strip of a full-size content window, so it must not block a drag there.
            if self.isOnWindowButton(w, event) { return event }
            // The window's resize border overlaps the top strip of a full-size content view: presses on the edges
            // resize (AppKit's own tracking), they never start a move.
            let p = event.locationInWindow, edge: CGFloat = 6
            if w.styleMask.contains(.resizable), p.y > w.frame.height - edge || p.x < edge || p.x > w.frame.width - edge { return event }
            if let hit = w.contentView?.superview?.hitTest(event.locationInWindow), hit is NSControl, !hit.isDescendant(of: page) { return event }
            let local = page.convert(event.locationInWindow, from: nil)
            let point = CGPoint(x: local.x, y: page.isFlipped ? local.y : page.bounds.height - local.y)
            guard regions.contains(point) else { return event }
            if event.clickCount == 2 {
                switch UserDefaults.standard.string(forKey: "AppleActionOnDoubleClick") {
                case "Minimize": w.performMiniaturize(nil)
                case "None": break
                default: w.performZoom(nil)
                }
                return nil
            }
            // The page never sees this press, so open menus would stay open behind a moved window.
            page.evaluateJavaScript("window.dismissMenus&&dismissMenus()", completionHandler: nil)
            w.performDrag(with: event)
            return nil
        }
    }

    // MARK: Menu actions

    @objc func openSettingsFromMenu() { openSettings() }
    @objc func helpFromMenu() { openSettings(section: "help") }
    @objc func newAgentFromMenu() { showWindow(); web.evaluateJavaScript("window.launchDialog&&launchDialog()", completionHandler: nil) }
    @objc func addIslandFromMenu() { showWindow(); chooseProject() }
    @objc func goTerminalsFromMenu() { showWindow(); web.evaluateJavaScript("window.setView&&setView('terminals')", completionHandler: nil) }
    @objc func goWorldFromMenu() { showWindow(); web.evaluateJavaScript("window.setView&&setView('world')", completionHandler: nil) }
    @objc func searchFromMenu() { showWindow(); web.evaluateJavaScript("window.openSearch&&openSearch()", completionHandler: nil) }
    @objc func toggleSidebarFromMenu() { web.evaluateJavaScript("window.toggleSidebar&&toggleSidebar()", completionHandler: nil) }
}

func settingsSelfTests() {
    var regions = DragRegions(regions: [CGRect(x: 0, y: 0, width: 200, height: 52)], exclude: [CGRect(x: 150, y: 10, width: 30, height: 30)])
    precondition(regions.contains(CGPoint(x: 20, y: 20)))
    precondition(!regions.contains(CGPoint(x: 160, y: 20)), "Buttons inside a drag strip stay clickable")
    precondition(!regions.contains(CGPoint(x: 20, y: 80)))
    regions.regions = parseRects([[0, 0, 10, 10], [1, 2], ["x", 1, 2, 3], [0, 0, -1, 4]])
    precondition(regions.regions.count == 1, "Malformed rectangles are dropped")
}
