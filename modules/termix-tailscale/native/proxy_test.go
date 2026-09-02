package main

import (
	"context"
	"crypto/tls"
	"crypto/x509"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"
)

func localDialer(target string) forwardDialContext {
	return func(ctx context.Context, network, _ string) (net.Conn, error) {
		var d net.Dialer
		return d.DialContext(ctx, network, target)
	}
}

func TestNormalizeForwardProtocol(t *testing.T) {
	for _, test := range []struct {
		input string
		want  string
	}{
		{"http", "http"},
		{"HTTPS:", "https"},
	} {
		got, err := normalizeForwardProtocol(test.input)
		if err != nil || got != test.want {
			t.Fatalf("normalizeForwardProtocol(%q) = %q, %v; want %q", test.input, got, err, test.want)
		}
	}
	if _, err := normalizeForwardProtocol("ftp:"); err == nil {
		t.Fatal("expected unsupported protocol to fail")
	}
}

func TestHTTPForwardPreservesRemoteAuthority(t *testing.T) {
	var gotHost, gotProto string
	backend := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotHost = r.Host
		gotProto = r.Header.Get("X-Forwarded-Proto")
		w.Header().Add("Set-Cookie", "sid=abc; Path=/; Domain=backend.example; Secure; HttpOnly; SameSite=None")
		w.Header().Set("Location", "http://backend.example:8080/next")
		w.WriteHeader(http.StatusFound)
	}))
	defer backend.Close()

	backendURL, _ := url.Parse(backend.URL)
	proxy, err := newForwardProxy("http:", "backend.example", 8080, 45678, localDialer(backendURL.Host))
	if err != nil {
		t.Fatal(err)
	}
	frontend := httptest.NewServer(proxy)
	defer frontend.Close()

	client := &http.Client{CheckRedirect: func(_ *http.Request, _ []*http.Request) error {
		return http.ErrUseLastResponse
	}}
	response, err := client.Get(frontend.URL + "/login")
	if err != nil {
		t.Fatal(err)
	}
	defer response.Body.Close()

	if response.StatusCode != http.StatusFound {
		t.Fatalf("status = %d; want %d", response.StatusCode, http.StatusFound)
	}
	if gotHost != "backend.example:8080" {
		t.Fatalf("backend Host = %q; want backend.example:8080", gotHost)
	}
	if gotProto != "http" {
		t.Fatalf("X-Forwarded-Proto = %q; want http", gotProto)
	}
	if cookie := response.Header.Get("Set-Cookie"); cookie != "sid=abc; Path=/; HttpOnly; SameSite=Lax" {
		t.Fatalf("Set-Cookie = %q; want local-safe cookie", cookie)
	}
	if location := response.Header.Get("Location"); location != "http://127.0.0.1:45678/next" {
		t.Fatalf("Location = %q; want local redirect", location)
	}
}

func TestHTTPSForwardUsesRemoteSNIAndCertificate(t *testing.T) {
	var gotSNI, gotHost string
	certPEM, keyPEM := testCertificate(t, "termix.example")
	certificate, err := tls.X509KeyPair(certPEM, keyPEM)
	if err != nil {
		t.Fatal(err)
	}
	backend := httptest.NewUnstartedServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotHost = r.Host
		w.WriteHeader(http.StatusNoContent)
	}))
	backend.TLS = &tls.Config{
		Certificates: []tls.Certificate{certificate},
		GetConfigForClient: func(hello *tls.ClientHelloInfo) (*tls.Config, error) {
			gotSNI = hello.ServerName
			return nil, nil
		},
	}
	backend.StartTLS()
	defer backend.Close()

	backendURL, _ := url.Parse(backend.URL)
	rootPool := x509.NewCertPool()
	rootPool.AppendCertsFromPEM(certPEM)
	proxy, err := newForwardProxyWithTLSConfig(
		"https:",
		"termix.example",
		8443,
		45679,
		localDialer(backendURL.Host),
		&tls.Config{RootCAs: rootPool},
	)
	if err != nil {
		t.Fatal(err)
	}
	frontend := httptest.NewServer(proxy)
	defer frontend.Close()

	response, err := http.Get(frontend.URL + "/health")
	if err != nil {
		t.Fatal(err)
	}
	defer response.Body.Close()

	if response.StatusCode != http.StatusNoContent {
		t.Fatalf("status = %d; want %d", response.StatusCode, http.StatusNoContent)
	}
	if gotSNI != "termix.example" {
		t.Fatalf("TLS SNI = %q; want termix.example", gotSNI)
	}
	if gotHost != "termix.example:8443" {
		t.Fatalf("backend Host = %q; want termix.example:8443", gotHost)
	}
}

func TestForwardSupportsUpgrade(t *testing.T) {
	backend := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if !strings.EqualFold(r.Header.Get("Connection"), "upgrade") ||
			!strings.EqualFold(r.Header.Get("Upgrade"), "websocket") {
			http.Error(w, "missing upgrade", http.StatusBadRequest)
			return
		}
		w.Header().Set("Connection", "Upgrade")
		w.Header().Set("Upgrade", "websocket")
		w.WriteHeader(http.StatusSwitchingProtocols)
		if hj, ok := w.(http.Hijacker); ok {
			connection, _, err := hj.Hijack()
			if err != nil {
				return
			}
			defer connection.Close()
			_, _ = connection.Write([]byte("upgrade-ok"))
		}
	}))
	defer backend.Close()
	backendURL, _ := url.Parse(backend.URL)
	proxy, err := newForwardProxy("http", "backend.example", 8080, 45680, localDialer(backendURL.Host))
	if err != nil {
		t.Fatal(err)
	}
	frontend := httptest.NewServer(proxy)
	defer frontend.Close()

	client := &http.Client{Transport: &http.Transport{}}
	req, err := http.NewRequest(http.MethodGet, frontend.URL, nil)
	if err != nil {
		t.Fatal(err)
	}
	req.Header.Set("Connection", "Upgrade")
	req.Header.Set("Upgrade", "websocket")
	response, err := client.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer response.Body.Close()
	body, _ := io.ReadAll(response.Body)
	if response.StatusCode != http.StatusSwitchingProtocols {
		t.Fatalf("status = %d; want %d (body=%q)", response.StatusCode, http.StatusSwitchingProtocols, body)
	}
}

func TestForwardRejectsInvalidTarget(t *testing.T) {
	_, err := newForwardProxy("ftp", "backend.example", 8080, 45681, func(context.Context, string, string) (net.Conn, error) {
		return nil, fmt.Errorf("unused")
	})
	if err == nil {
		t.Fatal("expected invalid protocol to fail")
	}
}

func TestHTTPSForwardRewritesMatchingAndProtocolRelativeRedirects(t *testing.T) {
	certPEM, keyPEM := testCertificate(t, "backend.example")
	certificate, err := tls.X509KeyPair(certPEM, keyPEM)
	if err != nil {
		t.Fatal(err)
	}
	backend := httptest.NewUnstartedServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/protocol-relative":
			w.Header().Set("Location", "//backend.example/next")
		case "/opposite-scheme":
			w.Header().Set("Location", "http://backend.example:443/next")
		default:
			w.WriteHeader(http.StatusNoContent)
			return
		}
		w.WriteHeader(http.StatusFound)
	}))
	backend.TLS = &tls.Config{Certificates: []tls.Certificate{certificate}}
	backend.StartTLS()
	defer backend.Close()

	backendURL, _ := url.Parse(backend.URL)
	rootPool := x509.NewCertPool()
	rootPool.AppendCertsFromPEM(certPEM)
	proxy, err := newForwardProxyWithTLSConfig(
		"https",
		"backend.example",
		443,
		45682,
		localDialer(backendURL.Host),
		&tls.Config{RootCAs: rootPool},
	)
	if err != nil {
		t.Fatal(err)
	}
	frontend := httptest.NewServer(proxy)
	defer frontend.Close()

	client := &http.Client{CheckRedirect: func(_ *http.Request, _ []*http.Request) error {
		return http.ErrUseLastResponse
	}}

	response, err := client.Get(frontend.URL + "/protocol-relative")
	if err != nil {
		t.Fatal(err)
	}
	if got := response.Header.Get("Location"); got != "http://127.0.0.1:45682/next" {
		t.Fatalf("protocol-relative Location = %q; want local redirect", got)
	}
	response.Body.Close()

	response, err = client.Get(frontend.URL + "/opposite-scheme")
	if err != nil {
		t.Fatal(err)
	}
	if got := response.Header.Get("Location"); got != "http://backend.example:443/next" {
		t.Fatalf("opposite-scheme Location = %q; want unchanged redirect", got)
	}
	response.Body.Close()
}

func TestForwardNormalizesIPv6Authority(t *testing.T) {
	var gotHost string
	backend := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotHost = r.Host
		w.Header().Set("Location", "http://[fd7a::1]:8080/next")
		w.WriteHeader(http.StatusFound)
	}))
	defer backend.Close()

	backendURL, _ := url.Parse(backend.URL)
	proxy, err := newForwardProxy(
		"http",
		"[fd7a::1]",
		8080,
		45683,
		localDialer(backendURL.Host),
	)
	if err != nil {
		t.Fatal(err)
	}
	frontend := httptest.NewServer(proxy)
	defer frontend.Close()

	client := &http.Client{CheckRedirect: func(_ *http.Request, _ []*http.Request) error {
		return http.ErrUseLastResponse
	}}
	response, err := client.Get(frontend.URL + "/")
	if err != nil {
		t.Fatal(err)
	}
	defer response.Body.Close()

	if gotHost != "[fd7a::1]:8080" {
		t.Fatalf("backend Host = %q; want [fd7a::1]:8080", gotHost)
	}
	if got := response.Header.Get("Location"); got != "http://127.0.0.1:45683/next" {
		t.Fatalf("IPv6 Location = %q; want local redirect", got)
	}
}

func TestRewriteLocalCookiesPreservesSecureForms(t *testing.T) {
	response := &http.Response{Header: http.Header{}}
	response.Header.Add("Set-Cookie", "__Host-sid=host; Path=/; Secure; HttpOnly")
	response.Header.Add("Set-Cookie", "__Secure-sid=secure; Path=/; Secure")
	response.Header.Add("Set-Cookie", "part=value; Path=/; Secure; Partitioned")
	response.Header.Add("Set-Cookie", "sid=plain; Path=/; Domain=backend.example; Secure; SameSite=None")

	rewriteLocalCookies(response)

	got := response.Header.Values("Set-Cookie")
	want := []string{
		"__Host-sid=host; Path=/; Secure; HttpOnly",
		"__Secure-sid=secure; Path=/; Secure",
		"part=value; Path=/; Secure; Partitioned",
		"sid=plain; Path=/; SameSite=Lax",
	}
	if strings.Join(got, "\n") != strings.Join(want, "\n") {
		t.Fatalf("Set-Cookie = %q; want %q", got, want)
	}
}

func TestLocalForwardOriginIsRewrittenOnlyForLoopback(t *testing.T) {
	if !isLocalForwardOrigin("http://127.0.0.1:45684", 45684) {
		t.Fatal("expected loopback origin to be recognized")
	}
	if !isLocalForwardOrigin("http://[::1]:45684", 45684) {
		t.Fatal("expected IPv6 loopback origin to be recognized")
	}
	for _, origin := range []string{
		"https://backend.example:45684",
		"http://127.0.0.1:45685",
		"null",
		"http://127.0.0.1:45684/path",
	} {
		if isLocalForwardOrigin(origin, 45684) {
			t.Fatalf("origin %q should not be treated as local", origin)
		}
	}
}
