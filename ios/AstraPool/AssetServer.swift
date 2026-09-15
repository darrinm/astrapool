import Foundation
import Network
import UniformTypeIdentifiers

// A loopback-only HTTP origin keeps WebKit's standard module workers, fetch and
// WebAssembly loading. No public listener, remote proxy or third-party server.
final class AssetServer {
    private let root: URL
    private let port: UInt16
    private let queue = DispatchQueue(label: "AstraPool.assets")
    private var listener: NWListener?
    init(root: URL, port: UInt16 = 49173) { self.root = root.resolvingSymlinksInPath(); self.port = port }
    func start(completion: @escaping (Result<URL, Error>) -> Void) {
        do {
            let parameters = NWParameters.tcp
            parameters.requiredLocalEndpoint = .hostPort(host: "127.0.0.1", port: NWEndpoint.Port(rawValue: port)!)
            let listener = try NWListener(using: parameters)
            self.listener = listener
            var reported = false
            listener.stateUpdateHandler = { state in
                switch state {
                case .ready where !reported:
                    reported = true
                    completion(.success(URL(string: "http://127.0.0.1:\(listener.port!.rawValue)/")!))
                case .failed(let error) where !reported:
                    reported = true; completion(.failure(error))
                default: break
                }
            }
            listener.newConnectionHandler = { [weak self] connection in
                connection.start(queue: self?.queue ?? .global())
                self?.read(connection, data: Data())
                self?.queue.asyncAfter(deadline: .now() + 15) { connection.cancel() }
            }
            listener.start(queue: queue)
        } catch { completion(.failure(error)) }
    }
    func stop() { listener?.cancel(); listener = nil }
    deinit { stop() }

    // Decode once and reject traversal, including encoded slashes and symlinks.
    static func assetURL(target: String, root: URL) -> URL? {
        let root = root.resolvingSymlinksInPath()
        guard let path = target.split(separator: "?", maxSplits: 1).first.map(String.init)?.removingPercentEncoding,
              path.hasPrefix("/"), !path.contains("\\"), !path.contains("\0"),
              !path.split(separator: "/").contains("..") else { return nil }
        let file = root.appendingPathComponent(path == "/" ? "index.html" : String(path.dropFirst())).resolvingSymlinksInPath()
        return file.path.hasPrefix(root.path + "/") ? file : nil
    }
    private func read(_ connection: NWConnection, data: Data) {
        connection.receive(minimumIncompleteLength: 1, maximumLength: 8192) { [weak self] bytes, _, complete, error in
            guard let self else { connection.cancel(); return }
            var data = data; if let bytes { data.append(bytes) }
            guard data.count < 16384, error == nil else { connection.cancel(); return }
            if let range = data.range(of: Data("\r\n\r\n".utf8)),
               let header = String(data: data[..<range.lowerBound], encoding: .utf8) {
                let fields = header.components(separatedBy: "\r\n")[0].split(separator: " ")
                guard fields.count == 3, ["GET", "HEAD"].contains(fields[0]),
                      let file = Self.assetURL(target: String(fields[1]), root: self.root),
                      let body = try? Data(contentsOf: file, options: .mappedIfSafe) else {
                    self.respond(connection, status: "404 Not Found", type: "text/plain", body: Data()); return
                }
                let type: String
                switch file.pathExtension.lowercased() {
                case "js", "mjs": type = "text/javascript"
                case "wasm": type = "application/wasm"
                case "html": type = "text/html; charset=utf-8"
                case "css": type = "text/css"
                case "json": type = "application/json"
                case "svg": type = "image/svg+xml"
                default: type = UTType(filenameExtension: file.pathExtension)?.preferredMIMEType ?? "application/octet-stream"
                }
                self.respond(connection, status: "200 OK", type: type, body: body, head: fields[0] == "HEAD")
            } else if !complete { self.read(connection, data: data) }
            else { connection.cancel() }
        }
    }
    private func respond(_ connection: NWConnection, status: String, type: String, body: Data, head: Bool = false) {
        var response = Data("HTTP/1.1 \(status)\r\nContent-Type: \(type)\r\nContent-Length: \(body.count)\r\nCache-Control: no-cache\r\nX-Content-Type-Options: nosniff\r\nConnection: close\r\n\r\n".utf8)
        if !head { response.append(body) }
        connection.send(content: response, completion: .contentProcessed { _ in connection.cancel() })
    }
}
