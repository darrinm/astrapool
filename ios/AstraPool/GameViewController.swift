import UIKit
import WebKit
import AVFAudio

final class GameViewController: UIViewController, WKNavigationDelegate, WKUIDelegate, WKScriptMessageHandlerWithReply {
    private(set) var webView: WKWebView!
    private var server: AssetServer?
    private var origin: URL?
    private var pendingInvite: String?
    private var ready = false
    private var active = true
    private var sockets: [String: URLSessionWebSocketTask] = [:]
    private let remote = "https://astrapool.darrinm.com"
    private let status = UILabel()
    private let retry = UIButton(type: .system)
    private lazy var network = URLSession(configuration: .ephemeral)
    override var prefersStatusBarHidden: Bool { true }
    override var preferredScreenEdgesDeferringSystemGestures: UIRectEdge { [.bottom] }
    override func viewDidLoad() {
        super.viewDidLoad(); view.backgroundColor = UIColor(red: 0.05, green: 0.04, blue: 0.04, alpha: 1)
        let config = WKWebViewConfiguration()
        config.allowsInlineMediaPlayback = true
        config.mediaTypesRequiringUserActionForPlayback = []
        config.userContentController.addScriptMessageHandler(self, contentWorld: .page, name: "astra")
        webView = WKWebView(frame: .zero, configuration: config)
        webView.navigationDelegate = self; webView.uiDelegate = self
        webView.isOpaque = false; webView.backgroundColor = view.backgroundColor
        webView.scrollView.isScrollEnabled = false; webView.scrollView.contentInsetAdjustmentBehavior = .never
        #if DEBUG
        webView.isInspectable = true
        #endif
        webView.translatesAutoresizingMaskIntoConstraints = false; view.addSubview(webView)
        NSLayoutConstraint.activate([webView.leadingAnchor.constraint(equalTo: view.leadingAnchor), webView.trailingAnchor.constraint(equalTo: view.trailingAnchor), webView.topAnchor.constraint(equalTo: view.topAnchor), webView.bottomAnchor.constraint(equalTo: view.bottomAnchor)])
        status.textColor = .white; status.textAlignment = .center; status.numberOfLines = 0
        status.text = "Starting Astra Pool…"; status.translatesAutoresizingMaskIntoConstraints = false; view.addSubview(status)
        retry.setTitle("Try again", for: .normal); retry.addTarget(self, action: #selector(start), for: .touchUpInside)
        retry.translatesAutoresizingMaskIntoConstraints = false; retry.isHidden = true; view.addSubview(retry)
        NSLayoutConstraint.activate([status.centerXAnchor.constraint(equalTo: view.centerXAnchor), status.centerYAnchor.constraint(equalTo: view.centerYAnchor), status.widthAnchor.constraint(lessThanOrEqualTo: view.widthAnchor, constant: -48), retry.topAnchor.constraint(equalTo: status.bottomAnchor, constant: 16), retry.centerXAnchor.constraint(equalTo: view.centerXAnchor)])
        try? AVAudioSession.sharedInstance().setCategory(.ambient, mode: .default, options: [.mixWithOthers])
        NotificationCenter.default.addObserver(self, selector: #selector(audioInterrupted(_:)), name: AVAudioSession.interruptionNotification, object: nil)
        start()
    }
    @objc private func start() {
        guard let root = Bundle.main.url(forResource: "Web", withExtension: nil), FileManager.default.fileExists(atPath: root.appendingPathComponent("index.html").path) else {
            status.text = "Game assets are missing. Run npm run ios:prepare, then rebuild the app."; return
        }
        ready = false; status.isHidden = false; retry.isHidden = true
        server?.stop()
        var port: UInt16 = 49173
        #if targetEnvironment(simulator)
        // Simulators share the Mac's loopback interface. Keep each simulator's
        // origin stable without colliding with an app running on another device.
        if let id = ProcessInfo.processInfo.environment["SIMULATOR_UDID"] {
            let hash = id.utf8.reduce(UInt32(0)) { ($0 &* 31) &+ UInt32($1) }
            port = UInt16(40000 + hash % 10000)
        }
        #endif
        let server = AssetServer(root: root, port: port); self.server = server
        server.start { [weak self] result in DispatchQueue.main.async {
            guard let self else { return }
            switch result {
            case .success(let url): self.origin = url; self.webView.load(URLRequest(url: url))
            case .failure: self.status.text = "Couldn’t start the bundled game. Please try again."; self.retry.isHidden = false
            }
        } }
    }
    func setActive(_ value: Bool) {
        active = value; UIApplication.shared.isIdleTimerDisabled = value
        if value { try? AVAudioSession.sharedInstance().setActive(true) }
        emit("astra-lifecycle", ["active": value])
        if !value {
            for id in Array(sockets.keys) { closeSocket(id) }
            try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
        }
    }
    @objc private func audioInterrupted(_ notification: Notification) {
        guard let raw = notification.userInfo?[AVAudioSessionInterruptionTypeKey] as? UInt else { return }
        setActive(raw == AVAudioSession.InterruptionType.ended.rawValue && UIApplication.shared.applicationState == .active)
    }
    static func inviteID(_ url: URL) -> String? {
        let id: String?
        if url.scheme == "astra-pool", url.host == "room" { id = url.pathComponents.last }
        else if url.scheme == "https", url.host == "astrapool.darrinm.com", url.path == "/" {
            id = URLComponents(string: "?" + (url.fragment ?? ""))?.queryItems?.first(where: { $0.name == "room" })?.value
        } else { id = nil }
        return id.flatMap { UUID(uuidString: $0) != nil ? $0.lowercased() : nil }
    }
    @discardableResult func openInvite(_ url: URL) -> Bool {
        guard let id = Self.inviteID(url) else { return false }
        pendingInvite = id; deliverInvite(); return true
    }
    private func deliverInvite() {
        guard ready, let id = pendingInvite else { return }; pendingInvite = nil
        // Only validated UUID text reaches JavaScript. Hide the chooser through its existing control.
        webView.callAsyncJavaScript("if (!document.getElementById('welcome').hidden) document.querySelector('#welcome [data-game=free]')?.click(); document.getElementById('hud-sheet').close(); location.hash = 'room=' + room;", arguments: ["room": id], in: nil, in: .page) { _ in }
    }
    private func emit(_ name: String, _ detail: [String: Any]) {
        guard webView != nil else { return }
        webView.callAsyncJavaScript("window.dispatchEvent(new CustomEvent(name, {detail}));", arguments: ["name": name, "detail": detail], in: nil, in: .page) { _ in }
    }
    private func closeSocket(_ id: String, code: Int = 1000, reason: String = "") {
        guard let task = sockets.removeValue(forKey: id) else { return }
        task.cancel(with: .normalClosure, reason: nil)
        emit("astra-socket", ["id": id, "type": "close", "code": code, "reason": reason])
    }
    private func readSocket(_ task: URLSessionWebSocketTask, id: String) {
        task.receive { [weak self, weak task] result in DispatchQueue.main.async {
            guard let self, let task, self.sockets[id] === task else { return }
            switch result {
            case .success(let message):
                if case .string(let data) = message { self.emit("astra-socket", ["id": id, "type": "message", "data": data]) }
                self.readSocket(task, id: id)
            case .failure:
                let code = task.closeCode.rawValue
                self.closeSocket(id, code: code == 0 ? 1006 : code, reason: task.closeReason.flatMap { String(data: $0, encoding: .utf8) } ?? "")
            }
        } }
    }
    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage, replyHandler reply: @escaping (Any?, String?) -> Void) {
        guard message.frameInfo.isMainFrame, let origin,
              message.frameInfo.securityOrigin.host == origin.host,
              message.frameInfo.securityOrigin.port == origin.port,
              let data = message.body as? [String: Any], let action = data["action"] as? String else { reply(nil, "Untrusted message"); return }
        switch action {
        case "request":
            guard let path = data["path"] as? String, ["/api/rooms", "/api/analytics/game"].contains(path),
                  let body = data["body"] as? String, body.utf8.count <= 4096 else { reply(nil, "Invalid request"); return }
            var request = URLRequest(url: URL(string: remote + path)!); request.httpMethod = "POST"
            request.setValue(remote, forHTTPHeaderField: "Origin"); request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            request.httpBody = Data(body.utf8); request.timeoutInterval = 20
            network.dataTask(with: request) { bytes, response, error in DispatchQueue.main.async {
                guard error == nil, let response = response as? HTTPURLResponse else { reply(nil, "Server unavailable"); return }
                reply(["status": response.statusCode, "body": String(data: bytes ?? Data(), encoding: .utf8) ?? ""], nil)
            } }.resume()
        case "socketOpen":
            guard let id = data["id"] as? String, UUID(uuidString: id) != nil, sockets.count < 2,
                  let text = data["url"] as? String, let url = URL(string: text), url.scheme == "wss", url.host == "astrapool.darrinm.com", url.port == nil,
                  url.query == nil, url.fragment == nil, url.user == nil,
                  url.path.range(of: "^/api/rooms/[0-9a-f-]{36}/socket$", options: .regularExpression) != nil else { reply(nil, "Invalid room"); return }
            var request = URLRequest(url: url); request.setValue(remote, forHTTPHeaderField: "Origin")
            let task = network.webSocketTask(with: request); task.maximumMessageSize = 262144; sockets[id] = task; task.resume()
            // URLSession queues the hello until the handshake completes.
            emit("astra-socket", ["id": id, "type": "open"]); readSocket(task, id: id); reply(true, nil)
        case "socketSend":
            guard let id = data["id"] as? String, let task = sockets[id], let text = data["data"] as? String, text.utf8.count <= 262144 else { reply(nil, "Invalid socket"); return }
            task.send(.string(text)) { error in DispatchQueue.main.async { reply(error == nil, error == nil ? nil : "Send failed") } }
        case "socketClose":
            if let id = data["id"] as? String { closeSocket(id) }; reply(true, nil)
        case "join":
            let alert = UIAlertController(title: "Join a friend", message: "Paste their Astra Pool invite link.", preferredStyle: .alert)
            alert.addTextField { $0.placeholder = "https://astrapool.darrinm.com/#room=…"; $0.keyboardType = .URL; $0.autocapitalizationType = .none; $0.autocorrectionType = .no }
            alert.addAction(UIAlertAction(title: "Cancel", style: .cancel))
            alert.addAction(UIAlertAction(title: "Join", style: .default) { [weak self, weak alert] _ in
                guard let text = alert?.textFields?.first?.text?.trimmingCharacters(in: .whitespacesAndNewlines), let url = URL(string: text), self?.openInvite(url) == true else {
                    let error = UIAlertController(title: "Invalid invite", message: "Use the complete link shared by your friend.", preferredStyle: .alert)
                    error.addAction(UIAlertAction(title: "OK", style: .default)); self?.present(error, animated: true); return
                }
            })
            present(alert, animated: true); reply(true, nil)
        case "share":
            guard let text = data["url"] as? String, let url = URL(string: text), Self.inviteID(url) != nil else { reply(nil, "Invalid invite"); return }
            let sheet = UIActivityViewController(activityItems: [url], applicationActivities: nil)
            sheet.popoverPresentationController?.sourceView = view
            sheet.popoverPresentationController?.sourceRect = CGRect(x: view.bounds.midX, y: view.bounds.midY, width: 1, height: 1)
            present(sheet, animated: true); reply(true, nil)
        default: reply(nil, "Unknown action")
        }
    }
    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        status.isHidden = true
        webView.callAsyncJavaScript("await import('/' + document.querySelector('script[type=module][src]').getAttribute('src').replace(/^\\//, ''));", arguments: [:], in: nil, in: .page) { [weak self] _ in
            self?.ready = true; self?.setActive(self?.active ?? true); self?.deliverInvite()
        }
    }
    func webView(_ webView: WKWebView, didStartProvisionalNavigation navigation: WKNavigation!) {
        ready = false; for id in Array(sockets.keys) { closeSocket(id) }
    }
    func webViewWebContentProcessDidTerminate(_ webView: WKWebView) { ready = false; webView.reload() }
    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) { status.text = "Couldn’t load Astra Pool."; status.isHidden = false; retry.isHidden = false }
    func webView(_ webView: WKWebView, decidePolicyFor action: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        guard let url = action.request.url else { decisionHandler(.cancel); return }
        if url.scheme == origin?.scheme && url.host == origin?.host && url.port == origin?.port {
            if url.path == "/privacy.html" {
                decisionHandler(.cancel)
                if presentedViewController == nil {
                    present(UINavigationController(rootViewController: PrivacyViewController(url: url)), animated: true)
                }
                return
            }
            decisionHandler(.allow); return
        }
        decisionHandler(.cancel)
        if ["https", "mailto"].contains(url.scheme ?? "") { UIApplication.shared.open(url) }
    }
    func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration, for action: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? { nil }
    func webView(_ webView: WKWebView, runJavaScriptConfirmPanelWithMessage message: String, initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping (Bool) -> Void) {
        let alert = UIAlertController(title: "Astra Pool", message: message, preferredStyle: .alert)
        alert.addAction(UIAlertAction(title: "Cancel", style: .cancel) { _ in completionHandler(false) })
        alert.addAction(UIAlertAction(title: "Continue", style: .default) { _ in completionHandler(true) }); present(alert, animated: true)
    }
}

// A separate local page keeps the current game alive and works without internet.
final class PrivacyViewController: UIViewController, WKNavigationDelegate {
    let webView = WKWebView()
    private let policyURL: URL
    init(url: URL) { policyURL = url; super.init(nibName: nil, bundle: nil) }
    required init?(coder: NSCoder) { fatalError("init(coder:) has not been implemented") }
    override func viewDidLoad() {
        super.viewDidLoad()
        title = "Privacy Policy"
        navigationItem.rightBarButtonItem = UIBarButtonItem(systemItem: .done, primaryAction: UIAction { [weak self] _ in self?.dismiss(animated: true) })
        webView.navigationDelegate = self
        view = webView
        webView.load(URLRequest(url: policyURL))
    }
    func webView(_ webView: WKWebView, decidePolicyFor action: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        guard let url = action.request.url else { decisionHandler(.cancel); return }
        if url == policyURL { decisionHandler(.allow); return }
        decisionHandler(.cancel)
        if url.scheme == policyURL.scheme && url.host == policyURL.host && url.port == policyURL.port && url.path == "/" {
            dismiss(animated: true)
        } else if ["https", "mailto"].contains(url.scheme ?? "") { UIApplication.shared.open(url) }
    }
}
