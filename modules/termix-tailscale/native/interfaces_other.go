//go:build !android

package main

// On non-Android platforms tsnet's standard net.Interfaces() works fine, so no
// injection is needed.
func registerAndroidInterfaceGetter() {}
