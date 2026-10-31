import CommonCrypto
import Foundation
import Security

// Pinned server keys, per host. A pinned host is trusted by its key alone, so
// a self-signed server works, and a different key is refused even when a
// trusted authority signed it. The web view reaches this by its Objective-C
// name, since it can't link the module.
@objc(TermixServerPins)
public class ServerPins: NSObject {
  private static let prefix = "termix.pin."

  static func set(host: String, pins: [String]) {
    let key = prefix + host.lowercased()
    if pins.isEmpty {
      UserDefaults.standard.removeObject(forKey: key)
    } else {
      UserDefaults.standard.set(pins, forKey: key)
    }
  }

  static func pins(host: String) -> [String] {
    UserDefaults.standard.stringArray(forKey: prefix + host.lowercased()) ?? []
  }

  // DER headers that turn a raw public key into a SubjectPublicKeyInfo, so the
  // hash matches what Android and openssl give.
  private static let rsa2048: [UInt8] = [
    0x30, 0x82, 0x01, 0x22, 0x30, 0x0d, 0x06, 0x09, 0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x01,
    0x01, 0x05, 0x00, 0x03, 0x82, 0x01, 0x0f, 0x00,
  ]
  private static let rsa3072: [UInt8] = [
    0x30, 0x82, 0x01, 0xa2, 0x30, 0x0d, 0x06, 0x09, 0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x01,
    0x01, 0x05, 0x00, 0x03, 0x82, 0x01, 0x8f, 0x00,
  ]
  private static let rsa4096: [UInt8] = [
    0x30, 0x82, 0x02, 0x22, 0x30, 0x0d, 0x06, 0x09, 0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x01,
    0x01, 0x05, 0x00, 0x03, 0x82, 0x02, 0x0f, 0x00,
  ]
  private static let ecP256: [UInt8] = [
    0x30, 0x59, 0x30, 0x13, 0x06, 0x07, 0x2a, 0x86, 0x48, 0xce, 0x3d, 0x02, 0x01, 0x06, 0x08, 0x2a,
    0x86, 0x48, 0xce, 0x3d, 0x03, 0x01, 0x07, 0x03, 0x42, 0x00,
  ]
  private static let ecP384: [UInt8] = [
    0x30, 0x76, 0x30, 0x10, 0x06, 0x07, 0x2a, 0x86, 0x48, 0xce, 0x3d, 0x02, 0x01, 0x06, 0x05, 0x2b,
    0x81, 0x04, 0x00, 0x22, 0x03, 0x62, 0x00,
  ]

  /** base64 sha256 of the certificate's SubjectPublicKeyInfo. */
  static func spki(_ cert: SecCertificate) -> String? {
    guard let key = SecCertificateCopyKey(cert),
      let raw = SecKeyCopyExternalRepresentation(key, nil) as Data?,
      let attrs = SecKeyCopyAttributes(key) as? [CFString: Any],
      let type = attrs[kSecAttrKeyType] as? String,
      let bits = attrs[kSecAttrKeySizeInBits] as? Int
    else { return nil }
    let rsa = type == (kSecAttrKeyTypeRSA as String)
    let ec = type == (kSecAttrKeyTypeECSECPrimeRandom as String)
    let headers: [Int: [UInt8]] =
      rsa ? [2048: rsa2048, 3072: rsa3072, 4096: rsa4096] : ec ? [256: ecP256, 384: ecP384] : [:]
    guard let header = headers[bits] else { return nil }
    var der = Data(header)
    der.append(raw)
    var digest = [UInt8](repeating: 0, count: Int(CC_SHA256_DIGEST_LENGTH))
    der.withUnsafeBytes { _ = CC_SHA256($0.baseAddress, CC_LONG(der.count), &digest) }
    return Data(digest).base64EncodedString()
  }

  static func leaf(of trust: SecTrust) -> SecCertificate? {
    if #available(iOS 15.0, *) {
      return (SecTrustCopyCertificateChain(trust) as? [SecCertificate])?.first
    }
    return SecTrustGetCertificateAtIndex(trust, 0)
  }

  /**
   * nil when the host has no pin (use the system check), else whether the
   * server's key is a pinned one.
   */
  static func check(trust: SecTrust, host: String) -> Bool? {
    let saved = pins(host: host)
    if saved.isEmpty { return nil }
    guard let leaf = leaf(of: trust), let pin = spki(leaf) else { return false }
    return saved.contains(pin)
  }

  /** For the web view: 0 no pin for the host, 1 the key matches, 2 it doesn't. */
  @objc public static func pinState(_ trust: AnyObject, host: String) -> Int {
    // swiftlint:disable:next force_cast
    switch check(trust: trust as! SecTrust, host: host) {
    case nil: return 0
    case true?: return 1
    case false?: return 2
    }
  }

  /** Answers a server trust challenge for a pinned host; false when it has no pin. */
  static func answer(
    _ challenge: URLAuthenticationChallenge,
    _ completion: @escaping (URLSession.AuthChallengeDisposition, URLCredential?) -> Void
  ) -> Bool {
    guard challenge.protectionSpace.authenticationMethod == NSURLAuthenticationMethodServerTrust,
      let trust = challenge.protectionSpace.serverTrust,
      let ok = check(trust: trust, host: challenge.protectionSpace.host)
    else { return false }
    if ok {
      completion(.useCredential, URLCredential(trust: trust))
    } else {
      completion(.cancelAuthenticationChallenge, nil)
    }
    return true
  }

  /** Reads the key a server shows, without trusting it, so the user can pin it. */
  static func peek(host: String, port: Int) async throws -> [String: Any] {
    let peeker = Peeker()
    let session = URLSession(configuration: .ephemeral, delegate: peeker, delegateQueue: nil)
    defer { session.invalidateAndCancel() }
    var request = URLRequest(url: URL(string: "https://\(host):\(port)/")!)
    request.timeoutInterval = 8
    _ = try? await session.data(for: request)
    guard let cert = peeker.leaf, let pin = spki(cert) else {
      throw NSError(domain: "TermixNet", code: 1, userInfo: [
        NSLocalizedDescriptionKey: "Could not read the server's key",
      ])
    }
    return [
      "pin": pin,
      "subject": SecCertificateCopySubjectSummary(cert) as String? ?? "",
      "issuer": NSNull(),
      "notAfter": NSNull(),
      "selfSigned": NSNull(),
    ]
  }

  private final class Peeker: NSObject, URLSessionDelegate {
    var leaf: SecCertificate?

    func urlSession(
      _ session: URLSession, didReceive challenge: URLAuthenticationChallenge,
      completionHandler: @escaping (URLSession.AuthChallengeDisposition, URLCredential?) -> Void
    ) {
      if let trust = challenge.protectionSpace.serverTrust {
        leaf = ServerPins.leaf(of: trust)
      }
      // Only the key was wanted; the request goes no further.
      completionHandler(.cancelAuthenticationChallenge, nil)
    }
  }
}
