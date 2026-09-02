//go:build android

// Android interface enumeration replacement.
//
// Android SDK 30+ forbids ordinary apps from using NETLINK sockets that Go's
// net.Interfaces() relies on, producing:
//
//	route ip+net: netlinkrib: permission denied
//
// Tailscale exposes netmon.RegisterInterfaceGetter() precisely so a host app
// can register an alternate implementation. anet (github.com/wlynxg/anet)
// reimplements interface enumeration via ioctl, which Android permits.
//
// We register the anet-backed getter before tsnet.Up() runs so netmon.New()
// (which enumerates interfaces) succeeds.

package main

import (
	"fmt"
	"net"
	"sync"

	"tailscale.com/net/netmon"

	"github.com/wlynxg/anet"
)

// registerAndroidInterfaceGetter makes tsnet use ioctl-based interface
// enumeration on Android instead of the (blocked) netlink-based one.
var registerAndroidInterfaceGetterOnce sync.Once

// Safe to call multiple times; the package-level hook is registered once.
func registerAndroidInterfaceGetter() {
	registerAndroidInterfaceGetterOnce.Do(func() {
		netmon.RegisterInterfaceGetter(func() ([]netmon.Interface, error) {
			ifs, err := anet.Interfaces()
			if err != nil {
				return nil, err
			}
			out := make([]netmon.Interface, 0, len(ifs))
			for i := range ifs {
				// anet returns *net.Interface whose Addrs() may still hit the
				// blocked path on Android, so pre-fetch addresses and stash them in
				// AltAddrs (netmon reads AltAddrs first).
				addrs, aerr := anet.InterfaceAddrsByInterface(&ifs[i])
				if aerr != nil {
					return nil, fmt.Errorf("read addresses for %s: %w", ifs[i].Name, aerr)
				}
				out = append(out, netmon.Interface{
					Interface: &ifs[i],
					AltAddrs:  addrs,
				})
			}
			return out, nil
		})
	})
}

// Keep net referenced across GOOS builds.
var _ = net.IPv4len
