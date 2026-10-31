import Foundation
import Security

struct CertError: Error {
  let code: String
  let message: String
}

// Client certificates for servers behind mTLS. The identity lives in the
// Keychain, device only and readable after the first unlock so background
// sync can use it. Which host uses which identity is kept in UserDefaults.
enum ClientIdentity {
  private static let hostsKey = "termix.net.hosts"

  private static func label(_ accountId: String) -> String { "termix.\(accountId)" }

  private static func chainKey(_ accountId: String) -> String { "termix.net.chain.\(accountId)" }

  static func importPfx(accountId: String, host: String, pfxBase64: String, passphrase: String) throws -> [String: Any?] {
    guard let data = Data(base64Encoded: pfxBase64, options: .ignoreUnknownCharacters) else {
      throw CertError(code: "BAD_FILE", message: "The file could not be read.")
    }
    var items: CFArray?
    let status = SecPKCS12Import(data as CFData, [kSecImportExportPassphrase as String: passphrase] as CFDictionary, &items)
    if status == errSecAuthFailed {
      throw CertError(code: "BAD_PASSPHRASE", message: "The file or its passphrase is wrong.")
    }
    guard status == errSecSuccess,
      let first = (items as? [[String: Any]])?.first,
      let identityRef = first[kSecImportItemIdentity as String]
    else {
      throw CertError(code: "NO_KEY", message: "The file has no private key.")
    }
    let identity = identityRef as! SecIdentity
    let chain = (first[kSecImportItemCertChain as String] as? [SecCertificate]) ?? []

    remove(accountId: accountId)
    let add: [String: Any] = [
      kSecValueRef as String: identity,
      kSecAttrLabel as String: label(accountId),
      kSecAttrAccessible as String: kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly,
    ]
    let added = SecItemAdd(add as CFDictionary, nil)
    guard added == errSecSuccess || added == errSecDuplicateItem else {
      throw CertError(code: "KEYCHAIN", message: "The certificate could not be saved (\(added)).")
    }

    // Intermediates are public; the leaf comes from the identity itself.
    let intermediates = chain.dropFirst().map { SecCertificateCopyData($0) as Data }
    UserDefaults.standard.set(intermediates, forKey: chainKey(accountId))
    var hosts = UserDefaults.standard.dictionary(forKey: hostsKey) as? [String: String] ?? [:]
    hosts = hosts.filter { $0.value != accountId }
    hosts[host.lowercased()] = accountId
    UserDefaults.standard.set(hosts, forKey: hostsKey)

    var certificate: SecCertificate?
    SecIdentityCopyCertificate(identity, &certificate)
    let subject = certificate.flatMap { SecCertificateCopySubjectSummary($0) as String? }
    return ["subject": subject, "notAfter": nil]
  }

  static func remove(accountId: String) {
    let query: [String: Any] = [
      kSecClass as String: kSecClassIdentity,
      kSecAttrLabel as String: label(accountId),
    ]
    SecItemDelete(query as CFDictionary)
    UserDefaults.standard.removeObject(forKey: chainKey(accountId))
    var hosts = UserDefaults.standard.dictionary(forKey: hostsKey) as? [String: String] ?? [:]
    hosts = hosts.filter { $0.value != accountId }
    UserDefaults.standard.set(hosts, forKey: hostsKey)
  }

  static func identity(accountId: String) -> SecIdentity? {
    let query: [String: Any] = [
      kSecClass as String: kSecClassIdentity,
      kSecAttrLabel as String: label(accountId),
      kSecReturnRef as String: true,
      kSecMatchLimit as String: kSecMatchLimitOne,
    ]
    var result: CFTypeRef?
    guard SecItemCopyMatching(query as CFDictionary, &result) == errSecSuccess, let found = result else {
      return nil
    }
    return (found as! SecIdentity)
  }

  static func has(accountId: String) -> Bool { identity(accountId: accountId) != nil }

  /** The credential for a TLS client certificate challenge from this host. */
  static func credential(host: String) -> URLCredential? {
    let hosts = UserDefaults.standard.dictionary(forKey: hostsKey) as? [String: String] ?? [:]
    guard let accountId = hosts[host.lowercased()], let identity = identity(accountId: accountId) else {
      return nil
    }
    let chain = (UserDefaults.standard.array(forKey: chainKey(accountId)) as? [Data] ?? [])
      .compactMap { SecCertificateCreateWithData(nil, $0 as CFData) }
    return URLCredential(identity: identity, certificates: chain.isEmpty ? nil : chain, persistence: .forSession)
  }
}
