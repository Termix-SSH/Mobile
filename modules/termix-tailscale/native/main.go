// Termix Tailscale bridge: userspace tsnet node + local TCP port forwards.
//
// Built as a C archive/shared library and linked into the Expo native module.
// JS talks to 127.0.0.1:<localPort>; this process dials the real remote over the tailnet.
package main

/*
#include <stdlib.h>
*/
import "C"

import (
	"context"
	"fmt"
	"net"
	"net/http"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"sync"
	"time"
	"unsafe"

	"tailscale.com/tsnet"
)

func main() {}

//export TermixTS_IsAvailable
func TermixTS_IsAvailable() C.int {
	return 1
}

type forwardEntry struct {
	protocol    string
	remoteHost  string
	remotePort  int
	localPort   int
	listener    net.Listener
	cancel      context.CancelFunc
	requestCtx  context.Context
	proxy       *http.Server
	transport   *http.Transport
	connections map[net.Conn]struct{}
	connMu      sync.Mutex
	stopOnce    sync.Once
}

type nodeState uint8

const (
	nodeIdle nodeState = iota
	nodeStarting
	nodeRunning
	nodeClosing
)

var (
	// mu protects the tsnet lifecycle and configuration. It is never held while
	// calling tsnet.Server.Up or Close because both may block on I/O.
	mu             sync.Mutex
	lifecycleCond  = sync.NewCond(&mu)
	configureMu    sync.Mutex
	errorMu        sync.Mutex
	forwardMu      sync.Mutex
	server         *tsnet.Server
	startingServer *tsnet.Server
	started        bool
	state          = nodeIdle
	upCancel       context.CancelFunc
	upDone         chan struct{}
	generation     uint64
	forwards       = map[string]*forwardEntry{}
	lastError      string
	configured     bool

	cfgAuthKey   string
	cfgHostname  string
	cfgStateDir  string
	cfgEphemeral bool
)

// clearConfigLocked forgets credentials and state-directory ownership after a
// native close. The caller must hold mu.
func clearConfigLocked() {
	configured = false
	cfgAuthKey = ""
	cfgHostname = ""
	cfgStateDir = ""
	cfgEphemeral = false
}

func setErr(err error) {
	errorMu.Lock()
	defer errorMu.Unlock()
	if err == nil {
		lastError = ""
		return
	}
	lastError = err.Error()
}

func forwardKey(protocol, host string, remotePort, localPort int) string {
	return fmt.Sprintf(
		"%s://%s:%d->%d",
		strings.ToLower(strings.TrimSpace(protocol)),
		normalizeForwardHost(host),
		remotePort,
		localPort,
	)
}

//export TermixTS_Configure
func TermixTS_Configure(authKey, hostname, stateDir *C.char, ephemeral C.int) C.int {
	auth := C.GoString(authKey)
	host := strings.TrimSpace(C.GoString(hostname))
	dir := strings.TrimSpace(C.GoString(stateDir))
	if host == "" {
		host = "termix-mobile"
	}
	if dir == "" {
		setErr(fmt.Errorf("state directory is required"))
		return -1
	}
	if err := os.MkdirAll(dir, 0o700); err != nil {
		setErr(fmt.Errorf("create state dir: %w", err))
		return -1
	}

	configureMu.Lock()
	defer configureMu.Unlock()

	mu.Lock()
	defer mu.Unlock()
	for state == nodeClosing {
		lifecycleCond.Wait()
	}
	if state != nodeIdle || started {
		setErr(fmt.Errorf("already started; call TermixTS_Close before reconfigure"))
		return -1
	}

	cfgAuthKey = auth
	cfgHostname = host
	cfgStateDir = dir
	cfgEphemeral = ephemeral != 0
	configured = true

	// On Android, $XDG_CACHE_HOME / $HOME are unset, so logpolicy's
	// os.UserCacheDir() fails and tsnet panics ("no safe place found to store
	// log state"). Point XDG_CACHE_HOME at our writable state directory parent.
	// iOS uses the darwin branch of UserCacheDir and is unaffected.
	if runtime.GOOS == "android" {
		cacheParent := filepath.Dir(cfgStateDir)
		if err := os.MkdirAll(cacheParent, 0o700); err == nil {
			_ = os.Setenv("XDG_CACHE_HOME", cacheParent)
		}
	}

	setErr(nil)
	return 0
}

//export TermixTS_Up
func TermixTS_Up() C.int {
	for {
		mu.Lock()
		switch state {
		case nodeRunning:
			if started && server != nil {
				mu.Unlock()
				setErr(nil)
				return 0
			}
			state = nodeIdle
		case nodeStarting:
			done := upDone
			mu.Unlock()
			if done != nil {
				<-done
			}
			continue
		case nodeClosing:
			lifecycleCond.Wait()
			mu.Unlock()
			continue
		}

		if !configured || cfgStateDir == "" {
			mu.Unlock()
			setErr(fmt.Errorf("tailscale is not configured"))
			return -1
		}

		s := &tsnet.Server{
			Hostname:  cfgHostname,
			AuthKey:   cfgAuthKey,
			Dir:       cfgStateDir,
			Ephemeral: cfgEphemeral,
		}
		ctx, cancel := context.WithTimeout(context.Background(), 90*time.Second)
		done := make(chan struct{})
		generation++
		myGeneration := generation
		state = nodeStarting
		startingServer = s
		upCancel = cancel
		upDone = done
		mu.Unlock()

		// On Android, net.Interfaces() is blocked by SELinux (netlink). Register the
		// ioctl-based interface getter BEFORE tsnet starts so netmon.New succeeds.
		registerAndroidInterfaceGetter()

		_, upErr := s.Up(ctx)
		cancel()
		if upErr != nil {
			_ = s.Close()
		}

		mu.Lock()
		publish := upErr == nil && state == nodeStarting &&
			generation == myGeneration && startingServer == s
		if publish {
			server = s
			started = true
			state = nodeRunning
		} else {
			// Keep the lifecycle in a closing state until the candidate server has
			// been closed, so Configure/Up cannot reuse its state directory early.
			server = nil
			started = false
			state = nodeClosing
		}
		mu.Unlock()

		if !publish && upErr == nil {
			_ = s.Close()
		}

		mu.Lock()
		if startingServer == s {
			startingServer = nil
		}
		if upDone == done {
			upCancel = nil
			close(done)
			upDone = nil
		}
		if !publish {
			state = nodeIdle
		}
		lifecycleCond.Broadcast()
		mu.Unlock()

		if publish {
			setErr(nil)
			return 0
		}
		if upErr == nil {
			setErr(fmt.Errorf("tailscale up canceled"))
		} else {
			setErr(fmt.Errorf("tailscale up: %w", upErr))
		}
		return -1
	}
}

//export TermixTS_StartForward
func TermixTS_StartForward(protocol *C.char, remoteHost *C.char, remotePort C.int, localPortOut *C.int) C.int {
	scheme, err := normalizeForwardProtocol(C.GoString(protocol))
	if err != nil {
		setErr(err)
		return -1
	}
	host := normalizeForwardHost(C.GoString(remoteHost))
	rport := int(remotePort)
	if host == "" || rport <= 0 || rport > 65535 {
		setErr(fmt.Errorf("invalid remote host/port"))
		return -1
	}

	mu.Lock()
	if state != nodeRunning || !started || server == nil {
		mu.Unlock()
		setErr(fmt.Errorf("tailscale is not connected; call Up first"))
		return -1
	}
	s := server
	myGeneration := generation
	mu.Unlock()

	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		setErr(fmt.Errorf("listen localhost: %w", err))
		return -1
	}

	localPort := ln.Addr().(*net.TCPAddr).Port
	requestCtx, cancel := context.WithCancel(context.Background())
	entry := &forwardEntry{
		protocol:    scheme,
		remoteHost:  host,
		remotePort:  rport,
		localPort:   localPort,
		listener:    ln,
		cancel:      cancel,
		requestCtx:  requestCtx,
		connections: make(map[net.Conn]struct{}),
	}

	proxy, err := newForwardProxy(scheme, host, rport, localPort, s.Dial)
	if err != nil {
		_ = ln.Close()
		cancel()
		setErr(err)
		return -1
	}
	entry.transport, _ = proxy.Transport.(*http.Transport)
	entry.proxy = &http.Server{
		Handler: forwardHandler(entry, proxy),
		ConnState: func(conn net.Conn, connState http.ConnState) {
			entry.trackConnection(conn, connState)
		},
	}
	key := forwardKey(scheme, host, rport, localPort)

	// Serialize publication with Close/StopAll. A close that began after the
	// initial lifecycle check must not leave a listener behind the old node.
	forwardMu.Lock()
	mu.Lock()
	canPublish := state == nodeRunning && server == s && generation == myGeneration
	mu.Unlock()
	if canPublish {
		forwards[key] = entry
	}
	forwardMu.Unlock()
	if !canPublish {
		stopEntry(entry)
		setErr(fmt.Errorf("tailscale is closing; forward was not started"))
		return -1
	}

	go func() {
		if serveErr := entry.proxy.Serve(ln); serveErr != nil && serveErr != http.ErrServerClosed {
			forwardMu.Lock()
			if forwards[key] == entry {
				delete(forwards, key)
			}
			forwardMu.Unlock()
			stopEntry(entry)
			setErr(fmt.Errorf("serve localhost forward: %w", serveErr))
		}
	}()

	if localPortOut != nil {
		*localPortOut = C.int(localPort)
	}
	setErr(nil)
	return 0
}

func normalizeForwardHost(host string) string {
	host = strings.TrimSpace(host)
	if len(host) >= 2 && strings.HasPrefix(host, "[") && strings.HasSuffix(host, "]") {
		host = host[1 : len(host)-1]
	}
	return strings.ToLower(host)
}

func forwardHandler(entry *forwardEntry, proxy http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		parent := entry.requestCtx
		if parent == nil {
			parent = context.Background()
		}
		ctx, cancel := context.WithCancel(parent)
		requestDone := make(chan struct{})
		go func() {
			select {
			case <-r.Context().Done():
				cancel()
			case <-parent.Done():
				cancel()
			case <-requestDone:
			}
		}()
		defer func() {
			close(requestDone)
			cancel()
		}()
		proxy.ServeHTTP(w, r.WithContext(ctx))
	})
}

func (entry *forwardEntry) trackConnection(conn net.Conn, state http.ConnState) {
	entry.connMu.Lock()
	defer entry.connMu.Unlock()
	if state == http.StateClosed {
		delete(entry.connections, conn)
		return
	}
	entry.connections[conn] = struct{}{}
}

//export TermixTS_StopForward
func TermixTS_StopForward(protocol *C.char, remoteHost *C.char, remotePort C.int, localPort C.int) C.int {
	scheme, err := normalizeForwardProtocol(C.GoString(protocol))
	if err != nil {
		setErr(err)
		return -1
	}
	key := forwardKey(scheme, C.GoString(remoteHost), int(remotePort), int(localPort))

	forwardMu.Lock()
	entry, ok := forwards[key]
	if ok {
		delete(forwards, key)
		stopEntry(entry)
	}
	forwardMu.Unlock()

	if !ok {
		setErr(fmt.Errorf("forward not found"))
		return -1
	}
	setErr(nil)
	return 0
}

//export TermixTS_StopAllForwards
func TermixTS_StopAllForwards() C.int {
	stopAllForwardEntries()
	setErr(nil)
	return 0
}

//export TermixTS_IsForwardActive
func TermixTS_IsForwardActive(protocol *C.char, remoteHost *C.char, remotePort C.int, localPort C.int) C.int {
	scheme, err := normalizeForwardProtocol(C.GoString(protocol))
	if err != nil {
		setErr(err)
		return 0
	}
	key := forwardKey(scheme, C.GoString(remoteHost), int(remotePort), int(localPort))

	forwardMu.Lock()
	_, ok := forwards[key]
	forwardMu.Unlock()
	if ok {
		return 1
	}
	return 0
}

func stopAllForwardEntries() {
	forwardMu.Lock()
	defer forwardMu.Unlock()

	entries := make([]*forwardEntry, 0, len(forwards))
	for key, entry := range forwards {
		delete(forwards, key)
		entries = append(entries, entry)
	}
	for _, entry := range entries {
		stopEntry(entry)
	}
}

func stopEntry(entry *forwardEntry) {
	if entry == nil {
		return
	}
	entry.stopOnce.Do(func() {
		if entry.cancel != nil {
			entry.cancel()
		}
		if entry.proxy != nil {
			_ = entry.proxy.Close()
		}
		if entry.listener != nil {
			_ = entry.listener.Close()
		}
		if entry.transport != nil {
			entry.transport.CloseIdleConnections()
		}

		entry.connMu.Lock()
		connections := make([]net.Conn, 0, len(entry.connections))
		for conn := range entry.connections {
			connections = append(connections, conn)
		}
		entry.connMu.Unlock()
		for _, conn := range connections {
			_ = conn.Close()
		}
	})
}

//export TermixTS_IsUp
func TermixTS_IsUp() C.int {
	mu.Lock()
	if state != nodeRunning || !started || server == nil {
		mu.Unlock()
		return 0
	}
	s := server
	myGeneration := generation
	mu.Unlock()

	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()
	client, err := s.LocalClient()
	if err != nil {
		return 0
	}
	status, err := client.StatusWithoutPeers(ctx)
	if err != nil || status == nil || !strings.EqualFold(status.BackendState, "Running") {
		return 0
	}

	mu.Lock()
	stillRunning := state == nodeRunning && started && server == s && generation == myGeneration
	mu.Unlock()
	if stillRunning {
		return 1
	}
	return 0
}

//export TermixTS_GetIPs
func TermixTS_GetIPs() *C.char {
	// Keep the server pointer protected while reading its addresses. Close can
	// otherwise invalidate the tsnet server immediately after this snapshot.
	mu.Lock()
	if state != nodeRunning || !started || server == nil {
		mu.Unlock()
		return C.CString("")
	}
	ip4, ip6 := server.TailscaleIPs()
	mu.Unlock()

	parts := make([]string, 0, 2)
	if ip4.IsValid() {
		parts = append(parts, ip4.String())
	}
	if ip6.IsValid() {
		parts = append(parts, ip6.String())
	}
	return C.CString(strings.Join(parts, ","))
}

//export TermixTS_LastError
func TermixTS_LastError() *C.char {
	errorMu.Lock()
	defer errorMu.Unlock()
	return C.CString(lastError)
}

//export TermixTS_Close
func TermixTS_Close() C.int {
	mu.Lock()
	for state == nodeClosing {
		lifecycleCond.Wait()
	}
	if state == nodeStarting {
		state = nodeClosing
		cancel := upCancel
		done := upDone
		mu.Unlock()
		if cancel != nil {
			cancel()
		}
		if done != nil {
			<-done
		}
		mu.Lock()
		clearConfigLocked()
		lifecycleCond.Broadcast()
		mu.Unlock()
		setErr(nil)
		return 0
	}
	if state == nodeIdle || server == nil {
		clearConfigLocked()
		lifecycleCond.Broadcast()
		mu.Unlock()
		setErr(nil)
		return 0
	}

	state = nodeClosing
	generation++
	s := server
	server = nil
	started = false
	mu.Unlock()

	stopAllForwardEntries()
	var closeErr error
	if s != nil {
		closeErr = s.Close()
	}

	mu.Lock()
	state = nodeIdle
	clearConfigLocked()
	lifecycleCond.Broadcast()
	mu.Unlock()

	if closeErr != nil {
		setErr(fmt.Errorf("close tailscale: %w", closeErr))
		return -1
	}
	setErr(nil)
	return 0
}

//export TermixTS_FreeString
func TermixTS_FreeString(p *C.char) {
	if p != nil {
		C.free(unsafe.Pointer(p))
	}
}
