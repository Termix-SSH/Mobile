// JNI bridge for the Termix Tailscale Go library (libtermix_ts.so).
//
// TermixTS_* are the C ABI exported by the Go tsnet wrapper. This thin C layer
// exposes them as JNI methods on expo.modules.termixtailscale.TermixTailscaleModule
// so Kotlin can call them with `external fun` and System.loadLibrary.

#include <jni.h>
#include <string.h>
#include "termix_ts.h"

// ---- jstring helpers -------------------------------------------------------

static char *get_utf_chars(JNIEnv *env, jstring js) {
  if (js == NULL) return NULL;
  const char *s = (*env)->GetStringUTFChars(env, js, NULL);
  if (s == NULL) return NULL;
  return (char *)s;
}

static void release_utf_chars(JNIEnv *env, jstring js, char *c) {
  if (js != NULL && c != NULL) {
    (*env)->ReleaseStringUTFChars(env, js, c);
  }
}

static jstring new_utf(JNIEnv *env, const char *c) {
  if (c == NULL) return (*env)->NewStringUTF(env, "");
  return (*env)->NewStringUTF(env, c);
}

// ---- Configure -------------------------------------------------------------

JNIEXPORT jint JNICALL
Java_expo_modules_termixtailscale_TermixTailscaleModule_nativeConfigure(
    JNIEnv *env, jobject thiz, jstring authKey, jstring hostname,
    jstring stateDir, jboolean ephemeral) {
  char *ak = get_utf_chars(env, authKey);
  char *hn = get_utf_chars(env, hostname);
  char *sd = get_utf_chars(env, stateDir);
  int rc = TermixTS_Configure(ak ? ak : "", hn ? hn : "", sd ? sd : "",
                              ephemeral ? 1 : 0);
  release_utf_chars(env, authKey, ak);
  release_utf_chars(env, hostname, hn);
  release_utf_chars(env, stateDir, sd);
  return rc;
}

// ---- Up / close ------------------------------------------------------------

JNIEXPORT jint JNICALL
Java_expo_modules_termixtailscale_TermixTailscaleModule_nativeUp(
    JNIEnv *env, jobject thiz) {
  return TermixTS_Up();
}

JNIEXPORT jint JNICALL
Java_expo_modules_termixtailscale_TermixTailscaleModule_nativeClose(
    JNIEnv *env, jobject thiz) {
  return TermixTS_Close();
}

// ---- Forwarding ------------------------------------------------------------

JNIEXPORT jint JNICALL
Java_expo_modules_termixtailscale_TermixTailscaleModule_nativeStartForward(
    JNIEnv *env, jobject thiz, jstring protocol, jstring remoteHost,
    jint remotePort) {
  char *p = get_utf_chars(env, protocol);
  char *h = get_utf_chars(env, remoteHost);
  int localPort = 0;
  int rc = TermixTS_StartForward(p ? p : "http:", h ? h : "", remotePort,
                                  &localPort);
  release_utf_chars(env, protocol, p);
  release_utf_chars(env, remoteHost, h);
  return rc == 0 ? localPort : -1;
}

JNIEXPORT jint JNICALL
Java_expo_modules_termixtailscale_TermixTailscaleModule_nativeStopForward(
    JNIEnv *env, jobject thiz, jstring protocol, jstring remoteHost,
    jint remotePort, jint localPort) {
  char *p = get_utf_chars(env, protocol);
  char *h = get_utf_chars(env, remoteHost);
  int rc = TermixTS_StopForward(p ? p : "http:", h ? h : "", remotePort,
                                 localPort);
  release_utf_chars(env, protocol, p);
  release_utf_chars(env, remoteHost, h);
  return rc;
}

JNIEXPORT jint JNICALL
Java_expo_modules_termixtailscale_TermixTailscaleModule_nativeStopAllForwards(
    JNIEnv *env, jobject thiz) {
  return TermixTS_StopAllForwards();
}

JNIEXPORT jboolean JNICALL
Java_expo_modules_termixtailscale_TermixTailscaleModule_nativeIsForwardActive(
    JNIEnv *env, jobject thiz, jstring protocol, jstring remoteHost,
    jint remotePort, jint localPort) {
  char *p = get_utf_chars(env, protocol);
  char *h = get_utf_chars(env, remoteHost);
  int active = TermixTS_IsForwardActive(p ? p : "http:", h ? h : "",
                                         remotePort, localPort);
  release_utf_chars(env, protocol, p);
  release_utf_chars(env, remoteHost, h);
  return active == 1 ? JNI_TRUE : JNI_FALSE;
}

// ---- Status / info ---------------------------------------------------------

JNIEXPORT jboolean JNICALL
Java_expo_modules_termixtailscale_TermixTailscaleModule_nativeIsUp(
    JNIEnv *env, jobject thiz) {
  return TermixTS_IsUp() == 1 ? JNI_TRUE : JNI_FALSE;
}

JNIEXPORT jstring JNICALL
Java_expo_modules_termixtailscale_TermixTailscaleModule_nativeGetIPs(
    JNIEnv *env, jobject thiz) {
  char *ips = TermixTS_GetIPs();
  jstring result = new_utf(env, ips ? ips : "");
  if (ips) TermixTS_FreeString(ips);
  return result;
}

JNIEXPORT jstring JNICALL
Java_expo_modules_termixtailscale_TermixTailscaleModule_nativeLastError(
    JNIEnv *env, jobject thiz) {
  char *msg = TermixTS_LastError();
  jstring result = new_utf(env, msg ? msg : "");
  if (msg) TermixTS_FreeString(msg);
  return result;
}
