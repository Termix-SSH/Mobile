/* JNI glue for the libssh2 core. Kotlin side: termix.ssh.libssh2.Native. */
#include <jni.h>
#include <pthread.h>
#include <stdlib.h>
#include <string.h>

#include "termix_ssh2.h"

static JavaVM *jvm;
static pthread_key_t env_key;
static jclass error_class, entry_class;

static void detach(void *unused) {
    (void)unused;
    (*jvm)->DetachCurrentThread(jvm);
}

/* Native session threads attach once and detach when they end. */
static JNIEnv *env_for_thread(void) {
    JNIEnv *env = NULL;
    if ((*jvm)->GetEnv(jvm, (void **)&env, JNI_VERSION_1_6) == JNI_OK) return env;
#ifdef __ANDROID__
    (*jvm)->AttachCurrentThread(jvm, &env, NULL);
#else
    (*jvm)->AttachCurrentThread(jvm, (void **)&env, NULL);
#endif
    pthread_setspecific(env_key, env);
    return env;
}

JNIEXPORT jint JNI_OnLoad(JavaVM *vm, void *reserved) {
    (void)reserved;
    jvm = vm;
    pthread_key_create(&env_key, detach);
    JNIEnv *env;
    (*vm)->GetEnv(vm, (void **)&env, JNI_VERSION_1_6);
    error_class = (*env)->NewGlobalRef(env, (*env)->FindClass(env, "termix/ssh/libssh2/NativeError"));
    entry_class = (*env)->NewGlobalRef(env, (*env)->FindClass(env, "termix/ssh/libssh2/NativeEntry"));
    return JNI_VERSION_1_6;
}

static void throw_err(JNIEnv *env, const tx_error *e) {
    jmethodID ctor = (*env)->GetMethodID(env, error_class, "<init>", "(ILjava/lang/String;)V");
    jstring msg = (*env)->NewStringUTF(env, e->message);
    jobject ex = (*env)->NewObject(env, error_class, ctor, e->code ? e->code : TX_ERR_IO, msg);
    (*env)->Throw(env, (jthrowable)ex);
}

static char *jstr(JNIEnv *env, jstring s) {
    if (!s) return NULL;
    const char *c = (*env)->GetStringUTFChars(env, s, NULL);
    char *d = strdup(c);
    (*env)->ReleaseStringUTFChars(env, s, c);
    return d;
}

/* ---------- session callbacks ---------- */

typedef struct {
    jobject cb; /* global ref to NativeCallbacks */
} session_ctx;

static int j_verify(void *ctx, const tx_host_key *k) {
    session_ctx *c = ctx;
    JNIEnv *env = env_for_thread();
    jclass cls = (*env)->GetObjectClass(env, c->cb);
    jmethodID m = (*env)->GetMethodID(env, cls, "verifyHostKey",
        "(Ljava/lang/String;Ljava/lang/String;Ljava/lang/String;ZLjava/lang/String;Ljava/lang/String;)Z");
    jboolean ok = (*env)->CallBooleanMethod(env, c->cb, m, (*env)->NewStringUTF(env, k->key_type),
        (*env)->NewStringUTF(env, k->blob_hex), (*env)->NewStringUTF(env, k->sha256), (jboolean)k->is_certificate,
        (*env)->NewStringUTF(env, k->ca_sha256), (*env)->NewStringUTF(env, k->principals));
    if ((*env)->ExceptionCheck(env)) { (*env)->ExceptionClear(env); return 0; }
    (*env)->DeleteLocalRef(env, cls);
    return ok ? 1 : 0;
}

static int j_kbd(void *ctx, const char *name, const char *ins, int n, const char **prompts, const int *echo,
                 char **answers, int round) {
    session_ctx *c = ctx;
    JNIEnv *env = env_for_thread();
    jclass cls = (*env)->GetObjectClass(env, c->cb);
    jmethodID m = (*env)->GetMethodID(env, cls, "keyboardInteractive",
        "(Ljava/lang/String;Ljava/lang/String;[Ljava/lang/String;[ZI)[Ljava/lang/String;");
    jclass strc = (*env)->FindClass(env, "java/lang/String");
    jobjectArray ps = (*env)->NewObjectArray(env, n, strc, NULL);
    jbooleanArray es = (*env)->NewBooleanArray(env, n);
    for (int i = 0; i < n; i++) {
        (*env)->SetObjectArrayElement(env, ps, i, (*env)->NewStringUTF(env, prompts[i]));
        jboolean b = (jboolean)echo[i];
        (*env)->SetBooleanArrayRegion(env, es, i, 1, &b);
    }
    jobjectArray res = (*env)->CallObjectMethod(env, c->cb, m, (*env)->NewStringUTF(env, name),
                                                (*env)->NewStringUTF(env, ins), ps, es, round);
    if ((*env)->ExceptionCheck(env)) { (*env)->ExceptionClear(env); return -1; }
    if (!res) return -1;
    for (int i = 0; i < n && i < (*env)->GetArrayLength(env, res); i++)
        answers[i] = jstr(env, (*env)->GetObjectArrayElement(env, res, i));
    return 0;
}

static void j_banner(void *ctx, const char *banner) {
    session_ctx *c = ctx;
    JNIEnv *env = env_for_thread();
    jclass cls = (*env)->GetObjectClass(env, c->cb);
    jmethodID m = (*env)->GetMethodID(env, cls, "onBanner", "(Ljava/lang/String;)V");
    (*env)->CallVoidMethod(env, c->cb, m, (*env)->NewStringUTF(env, banner));
    if ((*env)->ExceptionCheck(env)) (*env)->ExceptionClear(env);
}

static void j_disconnect(void *ctx, const char *reason) {
    session_ctx *c = ctx;
    JNIEnv *env = env_for_thread();
    jclass cls = (*env)->GetObjectClass(env, c->cb);
    jmethodID m = (*env)->GetMethodID(env, cls, "onDisconnect", "(Ljava/lang/String;)V");
    (*env)->CallVoidMethod(env, c->cb, m, (*env)->NewStringUTF(env, reason));
    if ((*env)->ExceptionCheck(env)) (*env)->ExceptionClear(env);
}

/* The session pointer plus its callback context travel to Kotlin as one handle. */
typedef struct {
    tx_session *s;
    session_ctx *ctx;
} handle;

static jlong do_connect(JNIEnv *env, jlong parent, jstring host, jint port, jstring user, jstring password,
                        jstring key, jstring passphrase, jstring cert, jboolean force_kbd, jboolean legacy,
                        jint timeout, jint ka_interval, jint ka_max, jobject callbacks) {
    tx_config cfg = {0};
    char *strs[7] = {jstr(env, host), jstr(env, user), jstr(env, password), jstr(env, key),
                     jstr(env, passphrase), jstr(env, cert), NULL};
    cfg.host = strs[0];
    cfg.port = port;
    cfg.username = strs[1];
    cfg.password = strs[2];
    cfg.private_key = strs[3];
    cfg.passphrase = strs[4];
    cfg.certificate = strs[5];
    cfg.force_keyboard_interactive = force_kbd;
    cfg.allow_legacy_algorithms = legacy;
    cfg.connect_timeout_secs = timeout;
    cfg.keepalive_interval_secs = ka_interval;
    cfg.keepalive_count_max = ka_max;
    session_ctx *ctx = calloc(1, sizeof *ctx);
    ctx->cb = (*env)->NewGlobalRef(env, callbacks);
    tx_callbacks cb = {ctx, j_verify, j_kbd, j_banner, j_disconnect};
    tx_error err = {0};
    tx_session *s = parent ? tx_connect_via(((handle *)(intptr_t)parent)->s, &cfg, &cb, &err)
                           : tx_connect(&cfg, &cb, &err);
    for (int i = 0; i < 6; i++) free(strs[i]);
    if (!s) {
        (*env)->DeleteGlobalRef(env, ctx->cb);
        free(ctx);
        throw_err(env, &err);
        return 0;
    }
    handle *h = calloc(1, sizeof *h);
    h->s = s;
    h->ctx = ctx;
    return (jlong)(intptr_t)h;
}

#define FN(name) Java_termix_ssh_libssh2_Native_##name
#define H(x) ((handle *)(intptr_t)(x))

JNIEXPORT jlong JNICALL FN(connect)(JNIEnv *env, jclass c, jlong parent, jstring host, jint port, jstring user,
                                    jstring password, jstring key, jstring passphrase, jstring cert,
                                    jboolean force_kbd, jboolean legacy, jint timeout, jint ka_interval,
                                    jint ka_max, jobject callbacks) {
    (void)c;
    return do_connect(env, parent, host, port, user, password, key, passphrase, cert, force_kbd, legacy, timeout,
                      ka_interval, ka_max, callbacks);
}

JNIEXPORT jobjectArray JNICALL FN(algorithms)(JNIEnv *env, jclass c, jlong h) {
    (void)c;
    tx_algorithms a;
    tx_algorithms_info(H(h)->s, &a);
    jobjectArray arr = (*env)->NewObjectArray(env, 4, (*env)->FindClass(env, "java/lang/String"), NULL);
    const char *v[4] = {a.kex, a.host_key, a.cipher, a.mac};
    for (int i = 0; i < 4; i++) (*env)->SetObjectArrayElement(env, arr, i, (*env)->NewStringUTF(env, v[i]));
    return arr;
}

JNIEXPORT jboolean JNICALL FN(isClosed)(JNIEnv *env, jclass c, jlong h) {
    (void)env; (void)c;
    return (jboolean)tx_is_closed(H(h)->s);
}

JNIEXPORT void JNICALL FN(free)(JNIEnv *env, jclass c, jlong h) {
    (void)c;
    handle *x = H(h);
    tx_free(x->s);
    (*env)->DeleteGlobalRef(env, x->ctx->cb);
    free(x->ctx);
    free(x);
}

static jbyteArray bytes(JNIEnv *env, const char *d, size_t n) {
    jbyteArray a = (*env)->NewByteArray(env, (jsize)n);
    (*env)->SetByteArrayRegion(env, a, 0, (jsize)n, (const jbyte *)d);
    return a;
}

JNIEXPORT jobjectArray JNICALL FN(exec)(JNIEnv *env, jclass c, jlong h, jstring cmd) {
    (void)c;
    char *command = jstr(env, cmd);
    char *out = NULL, *er = NULL;
    size_t ol = 0, el = 0;
    int code = -1;
    tx_error err = {0};
    int rc = tx_exec(H(h)->s, command, &out, &ol, &er, &el, &code, &err);
    free(command);
    if (rc) { throw_err(env, &err); return NULL; }
    jobjectArray arr = (*env)->NewObjectArray(env, 3, (*env)->FindClass(env, "java/lang/Object"), NULL);
    (*env)->SetObjectArrayElement(env, arr, 0, bytes(env, out, ol));
    (*env)->SetObjectArrayElement(env, arr, 1, bytes(env, er, el));
    jclass ic = (*env)->FindClass(env, "java/lang/Integer");
    jobject boxed = (*env)->NewObject(env, ic, (*env)->GetMethodID(env, ic, "<init>", "(I)V"), code);
    (*env)->SetObjectArrayElement(env, arr, 2, boxed);
    free(out);
    free(er);
    return arr;
}

/* ---------- shell ---------- */

typedef struct {
    jobject cb;
    jmethodID on_data, on_exit;
} shell_ctx;

typedef struct {
    tx_shell *sh;
    shell_ctx *ctx;
} shell_handle;

static void j_data(void *ctx, const char *d, size_t n) {
    shell_ctx *c = ctx;
    JNIEnv *env = env_for_thread();
    jbyteArray a = bytes(env, d, n);
    (*env)->CallVoidMethod(env, c->cb, c->on_data, a);
    (*env)->DeleteLocalRef(env, a);
    if ((*env)->ExceptionCheck(env)) (*env)->ExceptionClear(env);
}

static void j_exit(void *ctx, int has, int code) {
    shell_ctx *c = ctx;
    JNIEnv *env = env_for_thread();
    (*env)->CallVoidMethod(env, c->cb, c->on_exit, (jboolean)has, code);
    if ((*env)->ExceptionCheck(env)) (*env)->ExceptionClear(env);
}

JNIEXPORT jlong JNICALL FN(shellOpen)(JNIEnv *env, jclass c, jlong h, jstring term, jint cols, jint rows,
                                      jobjectArray names, jobjectArray values, jobject callbacks) {
    (void)c;
    int n = names ? (*env)->GetArrayLength(env, names) : 0;
    char **ns = calloc(n + 1, sizeof *ns), **vs = calloc(n + 1, sizeof *vs);
    for (int i = 0; i < n; i++) {
        ns[i] = jstr(env, (*env)->GetObjectArrayElement(env, names, i));
        vs[i] = jstr(env, (*env)->GetObjectArrayElement(env, values, i));
    }
    shell_ctx *ctx = calloc(1, sizeof *ctx);
    ctx->cb = (*env)->NewGlobalRef(env, callbacks);
    jclass cls = (*env)->GetObjectClass(env, callbacks);
    ctx->on_data = (*env)->GetMethodID(env, cls, "onData", "([B)V");
    ctx->on_exit = (*env)->GetMethodID(env, cls, "onExit", "(ZI)V");
    tx_shell_callbacks cb = {ctx, j_data, j_exit};
    char *t = jstr(env, term);
    tx_error err = {0};
    tx_shell *sh = tx_shell_open(H(h)->s, t, cols, rows, (const char **)ns, (const char **)vs, n, &cb, &err);
    free(t);
    for (int i = 0; i < n; i++) { free(ns[i]); free(vs[i]); }
    free(ns);
    free(vs);
    if (!sh) {
        (*env)->DeleteGlobalRef(env, ctx->cb);
        free(ctx);
        throw_err(env, &err);
        return 0;
    }
    shell_handle *x = calloc(1, sizeof *x);
    x->sh = sh;
    x->ctx = ctx;
    return (jlong)(intptr_t)x;
}

#define SH(x) ((shell_handle *)(intptr_t)(x))

JNIEXPORT void JNICALL FN(shellWrite)(JNIEnv *env, jclass c, jlong sh, jbyteArray data) {
    (void)c;
    jsize n = (*env)->GetArrayLength(env, data);
    jbyte *b = (*env)->GetByteArrayElements(env, data, NULL);
    int rc = tx_shell_write(SH(sh)->sh, (const char *)b, (size_t)n);
    (*env)->ReleaseByteArrayElements(env, data, b, JNI_ABORT);
    if (rc) {
        tx_error e = {rc, "shell closed"};
        throw_err(env, &e);
    }
}

JNIEXPORT void JNICALL FN(shellResize)(JNIEnv *env, jclass c, jlong sh, jint cols, jint rows) {
    (void)env; (void)c;
    tx_shell_resize(SH(sh)->sh, cols, rows);
}

JNIEXPORT void JNICALL FN(shellClose)(JNIEnv *env, jclass c, jlong sh) {
    (void)env; (void)c;
    tx_shell_close(SH(sh)->sh);
}

/* Only call after the session is freed or the shell has exited. */
JNIEXPORT void JNICALL FN(shellFree)(JNIEnv *env, jclass c, jlong sh) {
    (void)c;
    shell_handle *x = SH(sh);
    tx_shell_free(x->sh);
    (*env)->DeleteGlobalRef(env, x->ctx->cb);
    free(x->ctx);
    free(x);
}

/* ---------- sftp ---------- */

JNIEXPORT jobjectArray JNICALL FN(sftpList)(JNIEnv *env, jclass c, jlong h, jstring path) {
    (void)c;
    char *p = jstr(env, path);
    tx_file_entry *ents = NULL;
    int count = 0;
    tx_error err = {0};
    int rc = tx_sftp_list(H(h)->s, p, &ents, &count, &err);
    free(p);
    if (rc) { throw_err(env, &err); return NULL; }
    jobjectArray arr = (*env)->NewObjectArray(env, count, entry_class, NULL);
    jmethodID ctor = (*env)->GetMethodID(env, entry_class, "<init>", "(Ljava/lang/String;JZZII)V");
    for (int i = 0; i < count; i++) {
        jobject o = (*env)->NewObject(env, entry_class, ctor, (*env)->NewStringUTF(env, ents[i].name),
                                      (jlong)ents[i].size, (jboolean)ents[i].is_dir, (jboolean)ents[i].is_symlink,
                                      (jint)ents[i].permissions, (jint)ents[i].mtime);
        (*env)->SetObjectArrayElement(env, arr, i, o);
        (*env)->DeleteLocalRef(env, o);
    }
    tx_free_entries(ents, count);
    return arr;
}

typedef struct {
    JNIEnv *env;
    jobject cb;
    jmethodID m;
} progress_ctx;

static void j_progress(void *ctx, uint64_t done, uint64_t total) {
    progress_ctx *p = ctx;
    JNIEnv *env = env_for_thread();
    (*env)->CallVoidMethod(env, p->cb, p->m, (jlong)done, (jlong)total);
    if ((*env)->ExceptionCheck(env)) (*env)->ExceptionClear(env);
}

static jlongArray transfer(JNIEnv *env, jlong h, jstring from, jstring to, jobject progress, int up) {
    char *a = jstr(env, from), *b = jstr(env, to);
    progress_ctx pc = {0};
    if (progress) {
        pc.cb = (*env)->NewGlobalRef(env, progress);
        pc.m = (*env)->GetMethodID(env, (*env)->GetObjectClass(env, progress), "onProgress", "(JJ)V");
    }
    uint64_t bytes_done = 0, ms = 0;
    tx_error err = {0};
    int rc = up ? tx_sftp_upload(H(h)->s, a, b, progress ? j_progress : NULL, &pc, &bytes_done, &ms, &err)
                : tx_sftp_download(H(h)->s, a, b, progress ? j_progress : NULL, &pc, &bytes_done, &ms, &err);
    free(a);
    free(b);
    if (pc.cb) (*env)->DeleteGlobalRef(env, pc.cb);
    if (rc) { throw_err(env, &err); return NULL; }
    jlongArray out = (*env)->NewLongArray(env, 2);
    jlong v[2] = {(jlong)bytes_done, (jlong)ms};
    (*env)->SetLongArrayRegion(env, out, 0, 2, v);
    return out;
}

JNIEXPORT jlongArray JNICALL FN(sftpDownload)(JNIEnv *env, jclass c, jlong h, jstring remote, jstring local,
                                              jobject progress) {
    (void)c;
    return transfer(env, h, remote, local, progress, 0);
}

JNIEXPORT jlongArray JNICALL FN(sftpUpload)(JNIEnv *env, jclass c, jlong h, jstring local, jstring remote,
                                            jobject progress) {
    (void)c;
    return transfer(env, h, local, remote, progress, 1);
}

JNIEXPORT void JNICALL FN(sftpRemove)(JNIEnv *env, jclass c, jlong h, jstring path) {
    (void)c;
    char *p = jstr(env, path);
    tx_error err = {0};
    int rc = tx_sftp_remove(H(h)->s, p, &err);
    free(p);
    if (rc) throw_err(env, &err);
}

/* ---------- forwards ---------- */

JNIEXPORT jlong JNICALL FN(forwardLocal)(JNIEnv *env, jclass c, jlong h, jstring bind, jint bport, jstring host,
                                         jint port) {
    (void)c;
    char *b = jstr(env, bind), *r = jstr(env, host);
    tx_error err = {0};
    tx_forward *f = tx_forward_local(H(h)->s, b, bport, r, port, &err);
    free(b);
    free(r);
    if (!f) { throw_err(env, &err); return 0; }
    return (jlong)(intptr_t)f;
}

JNIEXPORT jlong JNICALL FN(forwardDynamic)(JNIEnv *env, jclass c, jlong h, jstring bind, jint bport) {
    (void)c;
    char *b = jstr(env, bind);
    tx_error err = {0};
    tx_forward *f = tx_forward_dynamic(H(h)->s, b, bport, &err);
    free(b);
    if (!f) { throw_err(env, &err); return 0; }
    return (jlong)(intptr_t)f;
}

JNIEXPORT jint JNICALL FN(forwardPort)(JNIEnv *env, jclass c, jlong f) {
    (void)env; (void)c;
    return tx_forward_port((tx_forward *)(intptr_t)f);
}

JNIEXPORT void JNICALL FN(forwardClose)(JNIEnv *env, jclass c, jlong f) {
    (void)env; (void)c;
    tx_forward_close((tx_forward *)(intptr_t)f);
}

JNIEXPORT jstring JNICALL FN(version)(JNIEnv *env, jclass c) {
    (void)c;
    return (*env)->NewStringUTF(env, tx_version());
}
