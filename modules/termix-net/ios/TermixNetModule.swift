import ExpoModulesCore
import Foundation
import WebKit

struct NetRequest: Record {
  @Field var url: String = ""
  @Field var method: String = "GET"
  @Field var headers: [String: String] = [:]
  @Field var body: String? = nil
  @Field var bodyBase64: String? = nil
  @Field var timeoutMs: Double = 30000
  @Field var binary: Bool = false
}

extension NetRequest {
  var bodyData: Data? {
    if let bodyBase64 { return Data(base64Encoded: bodyBase64) }
    return body?.data(using: .utf8)
  }
}

struct NetCookie: Record {
  @Field var name: String = ""
  @Field var value: String = ""
  @Field var domain: String? = nil
  @Field var path: String? = nil
  @Field var expires: Double? = nil
  @Field var secure: Bool = false
  @Field var httpOnly: Bool = false
}

public class TermixNetModule: Module {
  private lazy var net = NetSession { [weak self] name, body in
    self?.sendEvent(name, body)
  }

  public func definition() -> ModuleDefinition {
    Name("TermixNet")

    Events("onStream", "onSocket")

    // iOS sends certificates only from its own session, so JS routes
    // requests, streams and sockets through it when an account has one.
    Constant("nativeRequests") { true }

    AsyncFunction("importClientCert") { (accountId: String, host: String, pfxBase64: String, passphrase: String) throws -> [String: Any?] in
      do {
        return try ClientIdentity.importPfx(accountId: accountId, host: host, pfxBase64: pfxBase64, passphrase: passphrase)
      } catch let error as CertError {
        throw Exception(name: error.code, description: error.message, code: error.code)
      }
    }

    AsyncFunction("removeClientCert") { (accountId: String) in
      ClientIdentity.remove(accountId: accountId)
    }

    AsyncFunction("hasClientCert") { (accountId: String) -> Bool in
      ClientIdentity.has(accountId: accountId)
    }

    AsyncFunction("setServerPins") { (host: String, pins: [String]) in
      ServerPins.set(host: host, pins: pins)
    }

    AsyncFunction("peekServerKey") { (host: String, port: Int) -> [String: Any] in
      try await ServerPins.peek(host: host, port: port)
    }

    AsyncFunction("request") { (request: NetRequest, promise: Promise) in
      self.net.request(url: request.url, method: request.method, headers: request.headers, body: request.bodyData,
                       timeoutMs: request.timeoutMs) { result in
        switch result {
        case .success(let response):
          promise.resolve(response.mapValues { $0 ?? NSNull() })
        case .failure(let error):
          promise.reject("NETWORK", error.localizedDescription)
        }
      }
    }

    Function("startStream") { (id: String, request: NetRequest) in
      self.net.startStream(id: id, url: request.url, method: request.method, headers: request.headers,
                           body: request.bodyData, binary: request.binary)
    }

    Function("cancelStream") { (id: String) in
      self.net.cancelStream(id: id)
    }

    Function("openSocket") { (id: String, url: String, protocols: [String], headers: [String: String]) in
      self.net.openSocket(id: id, url: url, protocols: protocols, headers: headers)
    }

    Function("sendSocket") { (id: String, text: String?, base64: String?) in
      self.net.sendSocket(id: id, text: text, base64: base64)
    }

    Function("closeSocket") { (id: String, code: Int, reason: String) in
      self.net.closeSocket(id: id, code: code, reason: reason)
    }

    AsyncFunction("tcpProbe") { (host: String, port: Int, timeoutMs: Int, promise: Promise) in
      LanProbe.tcp(host: host, port: port, timeoutMs: timeoutMs) { promise.resolve($0) }
    }

    AsyncFunction("udpSend") { (host: String, port: Int, base64: String) throws in
      guard let data = Data(base64Encoded: base64) else {
        throw Exception(name: "BAD_DATA", description: "The packet is not base64", code: "BAD_DATA")
      }
      do {
        try LanProbe.udp(host: host, port: port, data: data)
      } catch LanError.failed(let message) {
        throw Exception(name: "UDP_FAILED", description: message, code: "UDP_FAILED")
      }
    }

    // Cookies a proxy set in the sign in web view, HttpOnly ones too.
    AsyncFunction("readWebCookies") { (url: String, promise: Promise) in
      guard let host = URL(string: url)?.host?.lowercased() else {
        promise.resolve([])
        return
      }
      DispatchQueue.main.async {
        WKWebsiteDataStore.default().httpCookieStore.getAllCookies { cookies in
          let matching = cookies.filter { NetCookies.matches($0, host: host) }
          promise.resolve(matching.map(NetCookies.describe))
        }
      }
    }

    // The jar the app's requests use, with any value a proxy renewed.
    AsyncFunction("readJarCookies") { (url: String) -> [[String: Any]] in
      guard let target = URL(string: url) else { return [] }
      return (HTTPCookieStorage.shared.cookies(for: target) ?? []).map(NetCookies.describe)
    }

    // Puts cookies in the jar every request and socket here reads from.
    AsyncFunction("setCookies") { (url: String, cookies: [NetCookie]) in
      guard let host = URL(string: url)?.host else { return }
      for cookie in cookies {
        var props: [HTTPCookiePropertyKey: Any] = [
          .name: cookie.name,
          .value: cookie.value,
          .domain: cookie.domain ?? host,
          .path: cookie.path ?? "/",
        ]
        if let expires = cookie.expires { props[.expires] = Date(timeIntervalSince1970: expires / 1000) }
        if cookie.secure { props[.secure] = "TRUE" }
        if let made = HTTPCookie(properties: props) { HTTPCookieStorage.shared.setCookie(made) }
      }
    }

    AsyncFunction("clearCookie") { (url: String, name: String) in
      guard let target = URL(string: url) else { return }
      for cookie in HTTPCookieStorage.shared.cookies(for: target) ?? [] where cookie.name == name {
        HTTPCookieStorage.shared.deleteCookie(cookie)
      }
    }

    AsyncFunction("clearWebCookies") { (url: String, promise: Promise) in
      guard let host = URL(string: url)?.host?.lowercased() else {
        promise.resolve(nil)
        return
      }
      DispatchQueue.main.async {
        let store = WKWebsiteDataStore.default().httpCookieStore
        store.getAllCookies { cookies in
          let matching = cookies.filter { NetCookies.matches($0, host: host) }
          let group = DispatchGroup()
          for cookie in matching {
            group.enter()
            store.delete(cookie) { group.leave() }
          }
          group.notify(queue: .main) { promise.resolve(nil) }
        }
      }
    }
  }
}

enum NetCookies {
  static func matches(_ cookie: HTTPCookie, host: String) -> Bool {
    let domain = cookie.domain.lowercased().trimmingCharacters(in: CharacterSet(charactersIn: "."))
    return host == domain || host.hasSuffix("." + domain)
  }

  static func describe(_ cookie: HTTPCookie) -> [String: Any] {
    var out: [String: Any] = [
      "name": cookie.name,
      "value": cookie.value,
      "domain": cookie.domain,
      "path": cookie.path,
      "secure": cookie.isSecure,
      "httpOnly": cookie.isHTTPOnly,
    ]
    if let expires = cookie.expiresDate { out["expires"] = expires.timeIntervalSince1970 * 1000 }
    return out
  }
}
