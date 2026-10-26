import Foundation

// One URLSession that answers client certificate challenges, for requests,
// event streams and WebSockets to servers behind mTLS. React Native's own
// networking can't do that on iOS.
final class NetSession: NSObject, URLSessionDataDelegate, URLSessionWebSocketDelegate {
  private let emit: (String, [String: Any?]) -> Void
  private let lock = NSLock()
  private var streams: [Int: String] = [:]
  private var streamTasks: [String: URLSessionDataTask] = [:]
  // File downloads, whose chunks go out as base64.
  private var binaryStreams: Set<String> = []
  private var sockets: [String: URLSessionWebSocketTask] = [:]
  private var socketIds: [Int: String] = [:]

  private lazy var session: URLSession = {
    let config = URLSessionConfiguration.default
    config.httpCookieStorage = .shared
    config.httpShouldSetCookies = true
    config.timeoutIntervalForRequest = 60
    config.timeoutIntervalForResource = 7 * 24 * 60 * 60
    return URLSession(configuration: config, delegate: self, delegateQueue: nil)
  }()

  init(emit: @escaping (String, [String: Any?]) -> Void) {
    self.emit = emit
  }

  private func makeRequest(url: String, method: String, headers: [String: String], body: Data?, timeoutMs: Double) throws -> URLRequest {
    guard let target = URL(string: url) else {
      throw CertError(code: "BAD_URL", message: "Bad address: \(url)")
    }
    var request = URLRequest(url: target)
    request.httpMethod = method.uppercased()
    for (name, value) in headers {
      request.setValue(value, forHTTPHeaderField: name)
    }
    if let body {
      request.httpBody = body
    }
    if timeoutMs > 0 {
      request.timeoutInterval = timeoutMs / 1000
    }
    return request
  }

  private static func headerMap(_ response: HTTPURLResponse) -> [String: String] {
    var out: [String: String] = [:]
    for (key, value) in response.allHeaderFields {
      out[String(describing: key).lowercased()] = String(describing: value)
    }
    return out
  }

  func request(url: String, method: String, headers: [String: String], body: Data?, timeoutMs: Double,
               done: @escaping (Result<[String: Any?], Error>) -> Void) {
    do {
      let request = try makeRequest(url: url, method: method, headers: headers, body: body, timeoutMs: timeoutMs)
      session.dataTask(with: request) { data, response, error in
        if let error {
          done(.failure(error))
          return
        }
        let http = response as? HTTPURLResponse
        done(.success([
          "status": http?.statusCode ?? 0,
          "headers": http.map(NetSession.headerMap) ?? [:],
          "body": data.map { String(decoding: $0, as: UTF8.self) } ?? "",
          "url": http?.url?.absoluteString ?? url,
        ]))
      }.resume()
    } catch {
      done(.failure(error))
    }
  }

  // Streams

  func startStream(id: String, url: String, method: String, headers: [String: String], body: Data?, binary: Bool) {
    do {
      let request = try makeRequest(url: url, method: method, headers: headers, body: body, timeoutMs: 0)
      let task = session.dataTask(with: request)
      lock.lock()
      streams[task.taskIdentifier] = id
      streamTasks[id] = task
      if binary { binaryStreams.insert(id) }
      lock.unlock()
      task.resume()
    } catch {
      emit("onStream", ["id": id, "type": "error", "message": error.localizedDescription])
    }
  }

  func cancelStream(id: String) {
    lock.lock()
    let task = streamTasks.removeValue(forKey: id)
    lock.unlock()
    task?.cancel()
  }

  private func streamId(_ task: URLSessionTask) -> String? {
    lock.lock()
    defer { lock.unlock() }
    return streams[task.taskIdentifier]
  }

  func urlSession(_ session: URLSession, dataTask: URLSessionDataTask, didReceive response: URLResponse,
                  completionHandler: @escaping (URLSession.ResponseDisposition) -> Void) {
    if let id = streamId(dataTask), let http = response as? HTTPURLResponse {
      emit("onStream", ["id": id, "type": "response", "status": http.statusCode, "headers": NetSession.headerMap(http)])
    }
    completionHandler(.allow)
  }

  func urlSession(_ session: URLSession, dataTask: URLSessionDataTask, didReceive data: Data) {
    guard let id = streamId(dataTask) else { return }
    lock.lock()
    let binary = binaryStreams.contains(id)
    lock.unlock()
    let chunk = binary ? data.base64EncodedString() : String(decoding: data, as: UTF8.self)
    emit("onStream", ["id": id, "type": "data", "chunk": chunk])
  }

  func urlSession(_ session: URLSession, task: URLSessionTask, didCompleteWithError error: Error?) {
    guard let id = streamId(task) else { return }
    lock.lock()
    streams.removeValue(forKey: task.taskIdentifier)
    streamTasks.removeValue(forKey: id)
    binaryStreams.remove(id)
    lock.unlock()
    if let error {
      emit("onStream", ["id": id, "type": "error", "message": error.localizedDescription])
    } else {
      emit("onStream", ["id": id, "type": "end"])
    }
  }

  // Sockets

  func openSocket(id: String, url: String, protocols: [String], headers: [String: String]) {
    do {
      var request = try makeRequest(url: url, method: "GET", headers: headers, body: nil, timeoutMs: 10000)
      if !protocols.isEmpty {
        request.setValue(protocols.joined(separator: ", "), forHTTPHeaderField: "Sec-WebSocket-Protocol")
      }
      let task = session.webSocketTask(with: request)
      lock.lock()
      sockets[id] = task
      socketIds[task.taskIdentifier] = id
      lock.unlock()
      task.resume()
      receive(id: id, task: task)
    } catch {
      emit("onSocket", ["id": id, "type": "error", "message": error.localizedDescription])
    }
  }

  private func receive(id: String, task: URLSessionWebSocketTask) {
    task.receive { [weak self] result in
      guard let self else { return }
      switch result {
      case .success(.string(let text)):
        self.emit("onSocket", ["id": id, "type": "message", "data": text, "binary": false])
        self.receive(id: id, task: task)
      case .success(.data(let data)):
        self.emit("onSocket", ["id": id, "type": "message", "data": data.base64EncodedString(), "binary": true])
        self.receive(id: id, task: task)
      case .success:
        self.receive(id: id, task: task)
      case .failure(let error):
        self.finishSocket(id: id, code: task.closeCode.rawValue, reason: error.localizedDescription, failed: true)
      }
    }
  }

  func sendSocket(id: String, text: String?, base64: String?) {
    lock.lock()
    let task = sockets[id]
    lock.unlock()
    guard let task else { return }
    let message: URLSessionWebSocketTask.Message
    if let base64, let data = Data(base64Encoded: base64) {
      message = .data(data)
    } else {
      message = .string(text ?? "")
    }
    task.send(message) { [weak self] error in
      if let error {
        self?.emit("onSocket", ["id": id, "type": "error", "message": error.localizedDescription])
      }
    }
  }

  func closeSocket(id: String, code: Int, reason: String) {
    lock.lock()
    let task = sockets[id]
    lock.unlock()
    let closeCode = URLSessionWebSocketTask.CloseCode(rawValue: code) ?? .normalClosure
    task?.cancel(with: closeCode, reason: reason.data(using: .utf8))
  }

  private func finishSocket(id: String, code: Int, reason: String, failed: Bool) {
    lock.lock()
    let task = sockets.removeValue(forKey: id)
    if let task { socketIds.removeValue(forKey: task.taskIdentifier) }
    lock.unlock()
    guard task != nil else { return }
    if failed {
      emit("onSocket", ["id": id, "type": "error", "message": reason])
    }
    emit("onSocket", ["id": id, "type": "close", "code": code == 0 ? 1006 : code, "reason": reason])
  }

  func urlSession(_ session: URLSession, webSocketTask: URLSessionWebSocketTask, didOpenWithProtocol protocol: String?) {
    lock.lock()
    let id = socketIds[webSocketTask.taskIdentifier]
    lock.unlock()
    if let id {
      emit("onSocket", ["id": id, "type": "open", "protocol": `protocol` ?? ""])
    }
  }

  func urlSession(_ session: URLSession, webSocketTask: URLSessionWebSocketTask,
                  didCloseWith closeCode: URLSessionWebSocketTask.CloseCode, reason: Data?) {
    lock.lock()
    let id = socketIds[webSocketTask.taskIdentifier]
    lock.unlock()
    if let id {
      let text = reason.map { String(decoding: $0, as: UTF8.self) } ?? ""
      finishSocket(id: id, code: closeCode.rawValue, reason: text, failed: false)
    }
  }

  // Client certificates and pinned server keys

  func urlSession(_ session: URLSession, task: URLSessionTask, didReceive challenge: URLAuthenticationChallenge,
                  completionHandler: @escaping (URLSession.AuthChallengeDisposition, URLCredential?) -> Void) {
    if ServerPins.answer(challenge, completionHandler) { return }
    if challenge.protectionSpace.authenticationMethod == NSURLAuthenticationMethodClientCertificate,
      let credential = ClientIdentity.credential(host: challenge.protectionSpace.host) {
      completionHandler(.useCredential, credential)
      return
    }
    completionHandler(.performDefaultHandling, nil)
  }
}
