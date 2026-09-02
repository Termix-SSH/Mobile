package main

import (
	"context"
	"crypto/tls"
	"fmt"
	"net"
	"net/http"
	"net/http/httputil"
	"net/url"
	"strconv"
	"strings"
	"time"
)

type forwardDialContext func(context.Context, string, string) (net.Conn, error)

func normalizeForwardProtocol(protocol string) (string, error) {
	scheme := strings.TrimSuffix(strings.ToLower(strings.TrimSpace(protocol)), ":")
	if scheme != "http" && scheme != "https" {
		return "", fmt.Errorf("invalid forward protocol %q", protocol)
	}
	return scheme, nil
}

func newForwardProxy(
	protocol string,
	remoteHost string,
	remotePort int,
	localPort int,
	dialContext forwardDialContext,
) (*httputil.ReverseProxy, error) {
	return newForwardProxyWithTLSConfig(
		protocol,
		remoteHost,
		remotePort,
		localPort,
		dialContext,
		nil,
	)
}

func newForwardProxyWithTLSConfig(
	protocol string,
	remoteHost string,
	remotePort int,
	localPort int,
	dialContext forwardDialContext,
	tlsConfig *tls.Config,
) (*httputil.ReverseProxy, error) {
	scheme, err := normalizeForwardProtocol(protocol)
	if err != nil {
		return nil, err
	}
	remoteHost = normalizeForwardHost(remoteHost)
	if remoteHost == "" || remotePort <= 0 || remotePort > 65535 {
		return nil, fmt.Errorf("invalid remote host/port")
	}
	if dialContext == nil {
		return nil, fmt.Errorf("forward dialer is required")
	}

	remoteDialAuthority := net.JoinHostPort(remoteHost, strconv.Itoa(remotePort))
	remoteAuthority := forwardAuthority(scheme, remoteHost, remotePort)
	localAuthority := net.JoinHostPort("127.0.0.1", strconv.Itoa(localPort))
	target := &url.URL{Scheme: scheme, Host: remoteDialAuthority}

	proxy := httputil.NewSingleHostReverseProxy(target)
	if tlsConfig == nil {
		tlsConfig = &tls.Config{
			MinVersion: tls.VersionTLS12,
			ServerName: remoteHost,
		}
	} else {
		tlsConfig = tlsConfig.Clone()
		if tlsConfig.ServerName == "" {
			tlsConfig.ServerName = remoteHost
		}
	}
	proxy.Transport = &http.Transport{
		Proxy:                 nil,
		DialContext:           dialContext,
		ForceAttemptHTTP2:     false,
		TLSClientConfig:       tlsConfig,
		TLSHandshakeTimeout:   10 * time.Second,
		ResponseHeaderTimeout: 30 * time.Second,
		ExpectContinueTimeout: 1 * time.Second,
		IdleConnTimeout:       60 * time.Second,
		MaxIdleConns:          16,
		MaxIdleConnsPerHost:   8,
	}

	defaultDirector := proxy.Director
	proxy.Director = func(req *http.Request) {
		defaultDirector(req)

		// The loopback request is only an app-local transport. Preserve the
		// actual backend authority so virtual hosts and reverse proxies route it
		// exactly as they do for a direct connection.
		req.Host = remoteAuthority
		req.Header.Set("X-Forwarded-Host", remoteAuthority)
		req.Header.Set("X-Forwarded-Port", strconv.Itoa(remotePort))
		req.Header.Set("X-Forwarded-Proto", scheme)

		// NativeWebSocketManager connects to the loopback URL, so some clients
		// send a loopback Origin. Translate only that known local origin; leave
		// arbitrary origins untouched so the backend's origin policy still applies.
		if isLocalForwardOrigin(req.Header.Get("Origin"), localPort) {
			req.Header.Set("Origin", scheme+"://"+remoteAuthority)
		}
	}

	proxy.ModifyResponse = func(resp *http.Response) error {
		rewriteLocalCookies(resp)

		location := resp.Header.Get("Location")
		if location == "" {
			return nil
		}

		parsed, err := url.Parse(location)
		if err != nil || parsed.Hostname() == "" {
			return nil
		}
		if !sameRemoteAuthority(parsed, scheme, remoteHost, remotePort) {
			return nil
		}

		// Keep redirects inside the local transport. Otherwise a backend that
		// emits an absolute HTTPS URL would bypass the Tailscale forward and
		// send the mobile client directly to the LAN/DNS address.
		parsed.Scheme = "http"
		parsed.Host = localAuthority
		resp.Header.Set("Location", parsed.String())
		return nil
	}

	proxy.ErrorHandler = func(w http.ResponseWriter, _ *http.Request, proxyErr error) {
		http.Error(w, "Tailscale forward failed: "+proxyErr.Error(), http.StatusBadGateway)
	}

	return proxy, nil
}

func rewriteLocalCookies(resp *http.Response) {
	cookies := resp.Header.Values("Set-Cookie")
	if len(cookies) == 0 {
		return
	}

	resp.Header.Del("Set-Cookie")
	for _, raw := range cookies {
		// These cookie forms are deliberately not downgraded. Removing Secure
		// would violate the __Host-/__Secure-/Partitioned invariants, and a user
		// agent must reject them on the app's plain HTTP loopback transport rather
		// than silently accepting a weaker cookie.
		if cookieRequiresSecure(raw) {
			resp.Header.Add("Set-Cookie", raw)
			continue
		}

		parts := strings.Split(raw, ";")
		filtered := make([]string, 0, len(parts))
		for i, part := range parts {
			trimmed := strings.TrimSpace(part)
			if i > 0 {
				name, value := cookieAttribute(trimmed)
				switch name {
				case "domain", "secure":
					continue
				case "samesite":
					if strings.EqualFold(value, "none") {
						trimmed = "SameSite=Lax"
					}
				}
			}
			filtered = append(filtered, trimmed)
		}
		if len(filtered) > 0 {
			resp.Header.Add("Set-Cookie", strings.Join(filtered, "; "))
		}
	}
}

func cookieRequiresSecure(raw string) bool {
	name, _ := cookieAttribute(strings.TrimSpace(strings.SplitN(raw, ";", 2)[0]))
	if strings.HasPrefix(name, "__host-") || strings.HasPrefix(name, "__secure-") {
		return true
	}
	for _, part := range strings.Split(raw, ";")[1:] {
		attribute, _ := cookieAttribute(part)
		if attribute == "partitioned" {
			return true
		}
	}
	return false
}

func cookieAttribute(part string) (string, string) {
	pieces := strings.SplitN(strings.TrimSpace(part), "=", 2)
	name := strings.ToLower(strings.TrimSpace(pieces[0]))
	if len(pieces) == 1 {
		return name, ""
	}
	return name, strings.TrimSpace(pieces[1])
}

func sameRemoteAuthority(u *url.URL, remoteScheme, remoteHost string, remotePort int) bool {
	if !strings.EqualFold(normalizeForwardHost(u.Hostname()), normalizeForwardHost(remoteHost)) {
		return false
	}

	redirectScheme := strings.ToLower(strings.TrimSpace(u.Scheme))
	if redirectScheme == "" {
		// A protocol-relative redirect inherits the scheme of the forward. It is
		// safe to rewrite only after applying that inherited scheme.
		redirectScheme = strings.ToLower(remoteScheme)
	}
	if redirectScheme != strings.ToLower(remoteScheme) {
		return false
	}

	if u.Port() == "" {
		return remotePort == defaultPortForScheme(redirectScheme)
	}
	port, err := strconv.Atoi(u.Port())
	return err == nil && port == remotePort
}

func forwardAuthority(scheme, host string, port int) string {
	if port == defaultPortForScheme(scheme) {
		if strings.Contains(host, ":") {
			return "[" + host + "]"
		}
		return host
	}
	return net.JoinHostPort(host, strconv.Itoa(port))
}

func isLocalForwardOrigin(raw string, localPort int) bool {
	parsed, err := url.Parse(strings.TrimSpace(raw))
	if err != nil || parsed.User != nil || parsed.Path != "" || parsed.RawQuery != "" || parsed.Fragment != "" {
		return false
	}
	if parsed.Scheme != "http" && parsed.Scheme != "https" {
		return false
	}
	port, err := strconv.Atoi(parsed.Port())
	if err != nil || port != localPort {
		return false
	}

	host := normalizeForwardHost(parsed.Hostname())
	if host == "localhost" {
		return true
	}
	ip := net.ParseIP(host)
	return ip != nil && ip.IsLoopback()
}

func defaultPortForScheme(scheme string) int {
	if strings.EqualFold(scheme, "https") {
		return 443
	}
	return 80
}
