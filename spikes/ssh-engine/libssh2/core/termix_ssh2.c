/* Termix SSH engine on libssh2. Every session owns one thread running a
 * non-blocking poll loop. Public calls post a command to that thread and
 * wait for it, so libssh2 is only ever touched from one thread. */
#define _GNU_SOURCE
#include "termix_ssh2.h"

#include <libssh2.h>
#include <libssh2_sftp.h>
#include <openssl/evp.h>

#include <arpa/inet.h>
#include <errno.h>
#include <fcntl.h>
#include <netdb.h>
#include <netinet/in.h>
#include <netinet/tcp.h>
#include <poll.h>
#include <pthread.h>
#include <stdarg.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/ioctl.h>
#include <sys/socket.h>
#include <sys/stat.h>
#include <time.h>
#include <unistd.h>

#ifndef MSG_NOSIGNAL
#define MSG_NOSIGNAL 0
#endif

#define CHUNK (256 * 1024)
#define PUMP_BUF (64 * 1024)
#define PROGRESS_EVERY (4ull * 1024 * 1024)
#define MAX_POLL 512

enum { STEP_IDLE = 0, STEP_PROGRESS = 1, STEP_DONE = 2 };

typedef struct tx_task tx_task;
typedef struct tx_cmd tx_cmd;

struct tx_cmd {
    int (*start)(tx_session *s, tx_cmd *c); /* runs on the loop thread */
    int done;
    tx_error err;
    void *arg;    /* command specific input */
    void *result; /* command specific output */
    tx_cmd *next;
};

struct tx_task {
    int id;
    int (*step)(tx_session *s, tx_task *t);
    int (*fds)(tx_session *s, tx_task *t, struct pollfd *p, int max);
    void (*destroy)(tx_session *s, tx_task *t);
    int uses_channel; /* reads the session transport, so idle checks are not needed */
    tx_cmd *cmd;      /* completed when the task finishes, may be NULL */
    void *state;
    tx_task *next;
};

struct tx_session {
    LIBSSH2_SESSION *ssh;
    LIBSSH2_SFTP *sftp;
    int sftp_users;
    int sock;
    pthread_t thread;
    int thread_started;
    int wake[2];
    pthread_mutex_t mu;
    pthread_cond_t cv;
    tx_cmd *queue;
    tx_task *tasks;
    int next_id;
    tx_callbacks cb;
    tx_config cfg;
    char *strings[8]; /* owned copies of cfg strings */
    tx_host_key host_key;
    tx_algorithms algos;
    int closed;
    int quitting;
    char close_reason[256];
    int64_t last_rx;
    int64_t quiet_until;
    int idle_pending; /* bytes waiting in the kernel when we last looked */
    int kbd_round;
    int kbd_cancelled;
    /* connect handshake result */
    int ready;
    tx_error connect_err;
    /* jump: the parent keeps a pump task bridging our socket */
    tx_session *parent;
    int parent_bridge_id;
};

typedef struct shell_state shell_state;
struct tx_shell {
    tx_session *s;
    shell_state *h;
};

struct tx_forward {
    tx_session *s;
    int id;
    int port;
};

static pthread_once_t init_once = PTHREAD_ONCE_INIT;
static void global_init(void) { libssh2_init(0); }

static int64_t now_ms(void) {
    struct timespec ts;
    clock_gettime(CLOCK_MONOTONIC, &ts);
    return (int64_t)ts.tv_sec * 1000 + ts.tv_nsec / 1000000;
}

static void set_err(tx_error *e, int code, const char *fmt, ...) {
    if (!e) return;
    e->code = code;
    va_list ap;
    va_start(ap, fmt);
    vsnprintf(e->message, sizeof e->message, fmt, ap);
    va_end(ap);
}

static void set_ssh_err(tx_session *s, tx_error *e, int code, const char *what) {
    char *msg = NULL;
    libssh2_session_last_error(s->ssh, &msg, NULL, 0);
    set_err(e, code, "%s: %s", what, msg ? msg : "unknown");
}

static char *dup_or_null(const char *v) { return v ? strdup(v) : NULL; }

static void set_nonblock(int fd) {
    fcntl(fd, F_SETFL, fcntl(fd, F_GETFL, 0) | O_NONBLOCK);
#ifdef SO_NOSIGPIPE
    int one = 1;
    setsockopt(fd, SOL_SOCKET, SO_NOSIGPIPE, &one, sizeof one);
#endif
}

static int socket_dead(int rc) {
    return rc == LIBSSH2_ERROR_SOCKET_DISCONNECT || rc == LIBSSH2_ERROR_SOCKET_RECV ||
           rc == LIBSSH2_ERROR_SOCKET_SEND || rc == LIBSSH2_ERROR_SOCKET_TIMEOUT;
}

/* ---------- commands ---------- */

static void wake_loop(tx_session *s) {
    char b = 1;
    if (write(s->wake[1], &b, 1) < 0) { /* pipe full means the loop is awake anyway */ }
}

static void finish_cmd(tx_session *s, tx_cmd *c) {
    pthread_mutex_lock(&s->mu);
    c->done = 1;
    pthread_cond_broadcast(&s->cv);
    pthread_mutex_unlock(&s->mu);
}

/* Posts a command and waits. Returns the command's error code. */
static int run_cmd(tx_session *s, tx_cmd *c) {
    pthread_mutex_lock(&s->mu);
    if (s->closed) {
        pthread_mutex_unlock(&s->mu);
        set_err(&c->err, TX_ERR_DISCONNECTED, "session closed: %s", s->close_reason);
        return c->err.code;
    }
    c->next = NULL;
    tx_cmd **tail = &s->queue;
    while (*tail) tail = &(*tail)->next;
    *tail = c;
    pthread_mutex_unlock(&s->mu);
    wake_loop(s);
    pthread_mutex_lock(&s->mu);
    while (!c->done) pthread_cond_wait(&s->cv, &s->mu);
    pthread_mutex_unlock(&s->mu);
    return c->err.code;
}

static tx_task *add_task(tx_session *s) {
    tx_task *t = calloc(1, sizeof *t);
    t->id = ++s->next_id;
    t->next = s->tasks;
    s->tasks = t;
    return t;
}


/* ---------- connect and login ---------- */

static LIBSSH2_RECV_FUNC(counting_recv) {
    tx_session *s = (tx_session *)*abstract;
    ssize_t n = recv(socket, buffer, length, flags);
    if (n > 0) s->last_rx = now_ms();
    if (n < 0) return -errno;
    return n;
}

static int wait_socket(tx_session *s, int timeout_ms) {
    struct pollfd p = {.fd = s->sock, .events = 0};
    int dir = libssh2_session_block_directions(s->ssh);
    if (dir & LIBSSH2_SESSION_BLOCK_INBOUND) p.events |= POLLIN;
    if (dir & LIBSSH2_SESSION_BLOCK_OUTBOUND) p.events |= POLLOUT;
    if (!p.events) p.events = POLLIN;
    return poll(&p, 1, timeout_ms);
}

/* Repeats a non-blocking libssh2 call until it is not EAGAIN or the deadline passes. */
#define BLOCKING(s, deadline, expr)                                                     \
    ({                                                                                  \
        long _rc;                                                                       \
        while ((_rc = (long)(expr)) == LIBSSH2_ERROR_EAGAIN) {                          \
            if (now_ms() > (deadline)) { _rc = LIBSSH2_ERROR_TIMEOUT; break; }          \
            wait_socket((s), 200);                                                      \
        }                                                                               \
        _rc;                                                                            \
    })

#define BLOCKING_PTR(s, deadline, ptr, expr)                                            \
    do {                                                                                \
        while (!((ptr) = (expr)) &&                                                     \
               libssh2_session_last_errno((s)->ssh) == LIBSSH2_ERROR_EAGAIN) {          \
            if (now_ms() > (deadline)) break;                                           \
            wait_socket((s), 200);                                                      \
        }                                                                               \
    } while (0)

static int tcp_connect(const char *host, int port, int timeout_s, tx_error *err) {
    char ports[16];
    snprintf(ports, sizeof ports, "%d", port);
    struct addrinfo hints = {0}, *res = NULL;
    hints.ai_socktype = SOCK_STREAM;
    hints.ai_family = AF_UNSPEC;
    int rc = getaddrinfo(host, ports, &hints, &res);
    if (rc) {
        set_err(err, TX_ERR_CONNECT, "dns: %s", gai_strerror(rc));
        return -1;
    }
    int fd = -1;
    for (struct addrinfo *a = res; a; a = a->ai_next) {
        fd = socket(a->ai_family, a->ai_socktype, a->ai_protocol);
        if (fd < 0) continue;
        set_nonblock(fd);
        int r = connect(fd, a->ai_addr, a->ai_addrlen);
        if (r < 0 && errno == EINPROGRESS) {
            struct pollfd p = {.fd = fd, .events = POLLOUT};
            r = poll(&p, 1, timeout_s * 1000) == 1 ? 0 : -1;
            int soerr = 0;
            socklen_t len = sizeof soerr;
            if (r == 0) getsockopt(fd, SOL_SOCKET, SO_ERROR, &soerr, &len);
            if (soerr) { errno = soerr; r = -1; }
        }
        if (r == 0) break;
        close(fd);
        fd = -1;
    }
    freeaddrinfo(res);
    if (fd < 0) set_err(err, TX_ERR_CONNECT, "tcp: %s", strerror(errno));
    int one = 1;
    if (fd >= 0) setsockopt(fd, IPPROTO_TCP, TCP_NODELAY, &one, sizeof one);
    return fd;
}

static const char *KEX =
    "curve25519-sha256,curve25519-sha256@libssh.org,ecdh-sha2-nistp521,ecdh-sha2-nistp384,"
    "ecdh-sha2-nistp256,diffie-hellman-group-exchange-sha256,diffie-hellman-group18-sha512,"
    "diffie-hellman-group16-sha512,diffie-hellman-group14-sha256";
static const char *KEX_LEGACY =
    ",diffie-hellman-group14-sha1,diffie-hellman-group-exchange-sha1,diffie-hellman-group1-sha1";
static const char *HOSTKEYS =
    "ssh-ed25519,ecdsa-sha2-nistp521,ecdsa-sha2-nistp384,"
    "ecdsa-sha2-nistp256,rsa-sha2-512,rsa-sha2-256";
static const char *HOSTKEYS_LEGACY = ",ssh-rsa,ssh-dss";
static const char *CIPHERS =
    "chacha20-poly1305@openssh.com,aes256-gcm@openssh.com,aes128-gcm@openssh.com,aes256-ctr,"
    "aes192-ctr,aes128-ctr,aes256-cbc,aes192-cbc,aes128-cbc";
static const char *CIPHERS_LEGACY = ",3des-cbc";
static const char *MACS =
    "hmac-sha2-512-etm@openssh.com,hmac-sha2-256-etm@openssh.com,hmac-sha2-512,hmac-sha2-256";
static const char *MACS_LEGACY = ",hmac-sha1-etm@openssh.com,hmac-sha1";

static void set_pref(tx_session *s, int method, const char *base, const char *legacy) {
    char buf[1024];
    snprintf(buf, sizeof buf, "%s%s", base, s->cfg.allow_legacy_algorithms ? legacy : "");
    libssh2_session_method_pref(s->ssh, method, buf);
}

/* Minimal SSH wire reader for host certificates. */
typedef struct { const unsigned char *p; size_t n; } rd;
static int rd_u32(rd *r, uint32_t *v) {
    if (r->n < 4) return -1;
    *v = ((uint32_t)r->p[0] << 24) | ((uint32_t)r->p[1] << 16) | ((uint32_t)r->p[2] << 8) | r->p[3];
    r->p += 4; r->n -= 4;
    return 0;
}
static int rd_str(rd *r, const unsigned char **s, uint32_t *len) {
    if (rd_u32(r, len) || r->n < *len) return -1;
    *s = r->p; r->p += *len; r->n -= *len;
    return 0;
}
static int rd_skip(rd *r, size_t n) {
    if (r->n < n) return -1;
    r->p += n; r->n -= n;
    return 0;
}

static void sha256_b64(const unsigned char *data, size_t len, char *out, size_t outlen) {
    unsigned char md[32];
    unsigned int mdlen = 0;
    EVP_Digest(data, len, md, &mdlen, EVP_sha256(), NULL);
    char b64[48];
    int n = EVP_EncodeBlock((unsigned char *)b64, md, 32);
    while (n > 0 && b64[n - 1] == '=') n--;
    b64[n] = 0;
    snprintf(out, outlen, "SHA256:%s", b64);
}

static void hex_into(const unsigned char *p, size_t n, char *out, size_t outlen) {
    static const char *h = "0123456789abcdef";
    size_t i = 0;
    for (; i < n && i * 2 + 2 < outlen; i++) {
        out[i * 2] = h[p[i] >> 4];
        out[i * 2 + 1] = h[p[i] & 15];
    }
    out[i * 2] = 0;
}

/* Fills host key info. For a certificate the blob and SHA256 are of the inner key. */
static void read_host_key(tx_session *s) {
    size_t len = 0;
    int type = 0;
    const char *blob = libssh2_session_hostkey(s->ssh, &len, &type);
    tx_host_key *k = &s->host_key;
    memset(k, 0, sizeof *k);
    if (!blob) return;
    rd r = {(const unsigned char *)blob, len};
    const unsigned char *name;
    uint32_t nlen;
    if (rd_str(&r, &name, &nlen)) return;
    snprintf(k->key_type, sizeof k->key_type, "%.*s", (int)nlen, name);
    if (!strstr(k->key_type, "-cert-v01@openssh.com")) {
        hex_into((const unsigned char *)blob, len, k->blob_hex, sizeof k->blob_hex);
        sha256_b64((const unsigned char *)blob, len, k->sha256, sizeof k->sha256);
        return;
    }
    k->is_certificate = 1;
    const unsigned char *x;
    uint32_t xl;
    rd_str(&r, &x, &xl); /* nonce */
    /* Rebuild the plain key blob: base type name, then the key fields. */
    char base[96];
    snprintf(base, sizeof base, "%.*s", (int)(strstr(k->key_type, "-cert-v01") - k->key_type), k->key_type);
    int fields = 1;
    if (!strncmp(base, "ecdsa", 5)) fields = 2;
    else if (!strcmp(base, "ssh-rsa")) fields = 2;
    unsigned char inner[2048];
    size_t il = 0;
    uint32_t bl = (uint32_t)strlen(base);
    inner[il++] = bl >> 24; inner[il++] = bl >> 16; inner[il++] = bl >> 8; inner[il++] = bl;
    memcpy(inner + il, base, bl); il += bl;
    for (int i = 0; i < fields; i++) {
        const unsigned char *start = r.p;
        if (rd_str(&r, &x, &xl) || il + 4 + xl > sizeof inner) return;
        memcpy(inner + il, start, 4 + xl);
        il += 4 + xl;
    }
    hex_into(inner, il, k->blob_hex, sizeof k->blob_hex);
    sha256_b64(inner, il, k->sha256, sizeof k->sha256);
    uint32_t tmp;
    rd_skip(&r, 8);                  /* serial */
    rd_u32(&r, &tmp);                /* type */
    rd_str(&r, &x, &xl);             /* key id */
    if (rd_str(&r, &x, &xl)) return; /* principals */
    rd pr = {x, xl};
    const unsigned char *pn;
    uint32_t pl;
    while (!rd_str(&pr, &pn, &pl)) {
        size_t cur = strlen(k->principals);
        snprintf(k->principals + cur, sizeof k->principals - cur, "%s%.*s", cur ? "," : "", (int)pl, pn);
    }
    rd_skip(&r, 16);     /* valid after, valid before */
    rd_str(&r, &x, &xl); /* critical options */
    rd_str(&r, &x, &xl); /* extensions */
    rd_str(&r, &x, &xl); /* reserved */
    if (!rd_str(&r, &x, &xl)) sha256_b64(x, xl, k->ca_sha256, sizeof k->ca_sha256);
}

static void read_algorithms(tx_session *s) {
    const char *v;
    if ((v = libssh2_session_methods(s->ssh, LIBSSH2_METHOD_KEX))) snprintf(s->algos.kex, 96, "%s", v);
    if ((v = libssh2_session_methods(s->ssh, LIBSSH2_METHOD_HOSTKEY))) snprintf(s->algos.host_key, 96, "%s", v);
    if ((v = libssh2_session_methods(s->ssh, LIBSSH2_METHOD_CRYPT_CS))) snprintf(s->algos.cipher, 96, "%s", v);
    if ((v = libssh2_session_methods(s->ssh, LIBSSH2_METHOD_MAC_CS))) snprintf(s->algos.mac, 96, "%s", v);
}

static LIBSSH2_USERAUTH_KBDINT_RESPONSE_FUNC(kbd_response) {
    tx_session *s = (tx_session *)*abstract;
    if (num_prompts <= 0) return;
    if (s->kbd_cancelled || !s->cb.keyboard_interactive) {
        s->kbd_cancelled = 1;
        return;
    }
    char nm[256], ins[1024];
    snprintf(nm, sizeof nm, "%.*s", name_len, name ? name : "");
    snprintf(ins, sizeof ins, "%.*s", instruction_len, instruction ? instruction : "");
    const char **ps = calloc(num_prompts, sizeof *ps);
    int *echo = calloc(num_prompts, sizeof *echo);
    char **answers = calloc(num_prompts, sizeof *answers);
    for (int i = 0; i < num_prompts; i++) {
        char *p = malloc(prompts[i].length + 1);
        memcpy(p, prompts[i].text, prompts[i].length);
        p[prompts[i].length] = 0;
        ps[i] = p;
        echo[i] = prompts[i].echo;
    }
    int rc = s->cb.keyboard_interactive(s->cb.ctx, nm, ins, num_prompts, ps, echo, answers, s->kbd_round++);
    for (int i = 0; i < num_prompts; i++) {
        if (rc == 0 && answers[i]) {
            responses[i].text = answers[i];
            responses[i].length = (unsigned int)strlen(answers[i]);
        } else {
            free(answers[i]);
        }
        free((void *)ps[i]);
    }
    if (rc != 0) s->kbd_cancelled = 1;
    free(ps); free(echo); free(answers);
}

static int key_is_encrypted(const char *text) {
    if (strstr(text, "ENCRYPTED")) return 1;
    const char *b = strstr(text, "-----BEGIN OPENSSH PRIVATE KEY-----");
    if (!b) return 0;
    b += strlen("-----BEGIN OPENSSH PRIVATE KEY-----");
    char clean[256];
    size_t n = 0;
    for (; *b && n < 200; b++)
        if (*b != '\n' && *b != '\r') clean[n++] = *b;
    clean[n - n % 4] = 0;
    unsigned char raw[200];
    int len = EVP_DecodeBlock(raw, (unsigned char *)clean, (int)(n - n % 4));
    /* "openssh-key-v1\0" then string ciphername */
    if (len < 19) return 0;
    rd r = {raw + 15, (size_t)len - 15};
    const unsigned char *c;
    uint32_t cl;
    if (rd_str(&r, &c, &cl)) return 0;
    return !(cl == 4 && !memcmp(c, "none", 4));
}

static int has_method(const char *list, const char *m) { return list && strstr(list, m) != NULL; }

static int authenticate(tx_session *s, int64_t deadline, tx_error *err) {
    const char *user = s->cfg.username;
    unsigned int ulen = (unsigned int)strlen(user);
    char *methods = NULL;
    BLOCKING_PTR(s, deadline, methods, libssh2_userauth_list(s->ssh, user, ulen));
    if (libssh2_userauth_authenticated(s->ssh)) return 0;
    char *banner = NULL;
    if (s->cb.on_banner && libssh2_userauth_banner(s->ssh, &banner) == 0 && banner) s->cb.on_banner(s->cb.ctx, banner);
    char last[256] = "no methods left";

    if (s->cfg.private_key) {
        const char *key = s->cfg.private_key;
        if (strstr(key, "PuTTY-User-Key-File")) {
            set_err(err, TX_ERR_INVALID_KEY, "PuTTY keys are not supported by libssh2");
            return -1;
        }
        int enc = key_is_encrypted(key);
        if (enc && !s->cfg.passphrase) {
            set_err(err, TX_ERR_PASSPHRASE_REQUIRED, "the key needs a passphrase");
            return -1;
        }
        const char *pub = s->cfg.certificate;
        long rc = BLOCKING(s, deadline,
                           libssh2_userauth_publickey_frommemory(
                               s->ssh, user, ulen, pub, pub ? strlen(pub) : 0, key, strlen(key),
                               s->cfg.passphrase ? s->cfg.passphrase : ""));
        if (rc == 0 && libssh2_userauth_authenticated(s->ssh)) return 0;
        if (rc == LIBSSH2_ERROR_FILE || rc == LIBSSH2_ERROR_METHOD_NOT_SUPPORTED) {
            if (enc) set_err(err, TX_ERR_BAD_PASSPHRASE, "wrong passphrase");
            else set_ssh_err(s, err, TX_ERR_INVALID_KEY, "key");
            return -1;
        }
        if (socket_dead((int)rc)) { set_ssh_err(s, err, TX_ERR_DISCONNECTED, "key login"); return -1; }
        snprintf(last, sizeof last, "key refused");
    }

    if (s->cfg.password && !s->cfg.force_keyboard_interactive) {
        long rc = BLOCKING(s, deadline,
                           libssh2_userauth_password_ex(s->ssh, user, ulen, s->cfg.password,
                                                        (unsigned int)strlen(s->cfg.password), NULL));
        if (rc == 0) return 0;
        snprintf(last, sizeof last, "password refused");
        methods = NULL;
        BLOCKING_PTR(s, deadline, methods, libssh2_userauth_list(s->ssh, user, ulen));
        if (!has_method(methods, "keyboard-interactive")) {
            set_err(err, TX_ERR_AUTH, "%s", last);
            return -1;
        }
    }

    s->kbd_round = 0;
    s->kbd_cancelled = 0;
    long rc = BLOCKING(s, deadline, libssh2_userauth_keyboard_interactive_ex(s->ssh, user, ulen, kbd_response));
    if (rc == 0) return 0;
    if (s->kbd_cancelled) set_err(err, TX_ERR_AUTH_CANCELLED, "login cancelled");
    else set_err(err, TX_ERR_AUTH, "%s, keyboard-interactive refused", last);
    return -1;
}

static int handshake_and_login(tx_session *s, tx_error *err) {
    int64_t deadline = now_ms() + (int64_t)(s->cfg.connect_timeout_secs > 0 ? s->cfg.connect_timeout_secs : 10) * 4000;
    void *abstract = s;
    s->ssh = libssh2_session_init_ex(NULL, NULL, NULL, abstract);
    if (!s->ssh) { set_err(err, TX_ERR_CONNECT, "out of memory"); return -1; }
    libssh2_session_callback_set2(s->ssh, LIBSSH2_CALLBACK_RECV, (libssh2_cb_generic *)counting_recv);
    libssh2_session_set_blocking(s->ssh, 0);
    libssh2_session_banner_set(s->ssh, "SSH-2.0-Termix");
    set_pref(s, LIBSSH2_METHOD_KEX, KEX, KEX_LEGACY);
    set_pref(s, LIBSSH2_METHOD_HOSTKEY, HOSTKEYS, HOSTKEYS_LEGACY);
    set_pref(s, LIBSSH2_METHOD_CRYPT_CS, CIPHERS, CIPHERS_LEGACY);
    set_pref(s, LIBSSH2_METHOD_CRYPT_SC, CIPHERS, CIPHERS_LEGACY);
    set_pref(s, LIBSSH2_METHOD_MAC_CS, MACS, MACS_LEGACY);
    set_pref(s, LIBSSH2_METHOD_MAC_SC, MACS, MACS_LEGACY);
    s->last_rx = now_ms();

    long rc = BLOCKING(s, deadline, libssh2_session_handshake(s->ssh, s->sock));
    if (rc) { set_ssh_err(s, err, TX_ERR_CONNECT, "handshake"); return -1; }
    read_host_key(s);
    read_algorithms(s);
    if (!s->cb.verify_host_key || !s->cb.verify_host_key(s->cb.ctx, &s->host_key)) {
        set_err(err, TX_ERR_HOSTKEY_REJECTED, "host key was rejected");
        return -1;
    }
    if (authenticate(s, deadline, err)) return -1;
    if (s->cfg.keepalive_interval_secs > 0) libssh2_keepalive_config(s->ssh, 1, s->cfg.keepalive_interval_secs);
    return 0;
}

/* ---------- loop ---------- */

static void close_session(tx_session *s, const char *reason) {
    if (s->closed) return;
    pthread_mutex_lock(&s->mu);
    s->closed = 1;
    snprintf(s->close_reason, sizeof s->close_reason, "%s", reason);
    pthread_mutex_unlock(&s->mu);
    if (s->cb.on_disconnect) s->cb.on_disconnect(s->cb.ctx, reason);
}

static void fail_all(tx_session *s) {
    while (s->tasks) {
        tx_task *t = s->tasks;
        s->tasks = t->next;
        tx_cmd *done = t->cmd;
        if (t->destroy) t->destroy(s, t);
        free(t);
        if (done) {
            set_err(&done->err, TX_ERR_DISCONNECTED, "session closed: %s", s->close_reason);
            finish_cmd(s, done);
        }
    }
    pthread_mutex_lock(&s->mu);
    tx_cmd *q = s->queue;
    s->queue = NULL;
    pthread_mutex_unlock(&s->mu);
    while (q) {
        tx_cmd *n = q->next;
        set_err(&q->err, TX_ERR_DISCONNECTED, "session closed: %s", s->close_reason);
        finish_cmd(s, q);
        q = n;
    }
}

static void *loop_main(void *arg) {
    tx_session *s = arg;
    tx_error err = {0};
    int ok = handshake_and_login(s, &err) == 0;
    pthread_mutex_lock(&s->mu);
    s->connect_err = err;
    s->ready = 1;
    if (!ok) s->closed = 1;
    pthread_cond_broadcast(&s->cv);
    pthread_mutex_unlock(&s->mu);
    if (!ok) return NULL;

    struct pollfd pfd[MAX_POLL];
    int keepalive_next = s->cfg.keepalive_interval_secs > 0 ? s->cfg.keepalive_interval_secs : 30;
    while (!s->closed) {
        /* new commands */
        pthread_mutex_lock(&s->mu);
        tx_cmd *q = s->queue;
        s->queue = NULL;
        pthread_mutex_unlock(&s->mu);
        while (q) {
            tx_cmd *n = q->next;
            if (q->start(s, q) != 0) finish_cmd(s, q); /* finished right away */
            q = n;
        }
        if (s->quitting) break;

        int progress = 0, channel_tasks = 0;
        tx_task **pp = &s->tasks;
        while (*pp) {
            tx_task *t = *pp;
            int r = t->step(s, t);
            if (r == STEP_DONE) {
                *pp = t->next;
                tx_cmd *done = t->cmd;
                if (t->destroy) t->destroy(s, t);
                free(t);
                if (done) finish_cmd(s, done);
                progress = 1;
                continue;
            }
            if (r == STEP_PROGRESS) progress = 1;
            if (t->uses_channel) channel_tasks++;
            pp = &t->next;
        }
        int lerr = libssh2_session_last_errno(s->ssh);
        if (socket_dead(lerr)) { close_session(s, "connection lost"); break; }

        int64_t now = now_ms();
        if (s->cfg.keepalive_interval_secs > 0) {
            int rc = libssh2_keepalive_send(s->ssh, &keepalive_next);
            if (socket_dead(rc)) { close_session(s, "connection lost"); break; }
            int64_t limit = (int64_t)s->cfg.keepalive_interval_secs * 1000 * (s->cfg.keepalive_count_max + 1);
            if (now - s->last_rx > limit) { close_session(s, "keepalive timeout"); break; }
        }

        int n = 0;
        pfd[n].fd = s->wake[0]; pfd[n].events = POLLIN; n++;
        int sock_idx = n;
        pfd[n].fd = s->sock;
        pfd[n].events = 0;
        int dir = libssh2_session_block_directions(s->ssh);
        if (dir & LIBSSH2_SESSION_BLOCK_OUTBOUND) pfd[n].events |= POLLOUT;
        if (channel_tasks) s->idle_pending = 0;
        if (channel_tasks || now >= s->quiet_until) pfd[n].events |= POLLIN;
        n++;
        for (tx_task *t = s->tasks; t && n < MAX_POLL; t = t->next)
            if (t->fds) n += t->fds(s, t, pfd + n, MAX_POLL - n);

        int timeout = progress ? 0 : (keepalive_next > 0 ? keepalive_next * 1000 : 1000);
        if (timeout > 1000) timeout = 1000;
        if (poll(pfd, n, timeout) < 0 && errno != EINTR) break;
        if (pfd[0].revents & POLLIN) {
            char buf[64];
            while (read(s->wake[0], buf, sizeof buf) > 0) {}
        }
        if (pfd[sock_idx].revents & (POLLHUP | POLLERR)) { close_session(s, "connection lost"); break; }
        if (!channel_tasks && (pfd[sock_idx].revents & POLLIN)) {
            /* Nothing reads the transport right now. Peek to see the server is alive,
               then stop watching input until the next keepalive. */
            char b;
            ssize_t r = recv(s->sock, &b, 1, MSG_PEEK);
            if (r == 0) { close_session(s, "connection lost"); break; }
            int pending = 0;
            ioctl(s->sock, FIONREAD, &pending);
            /* Old bytes stay queued until a channel reads them, so only growth counts. */
            if (r > 0 && pending > s->idle_pending) s->last_rx = now_ms();
            s->idle_pending = pending;
            s->quiet_until = now_ms() + (keepalive_next > 0 ? keepalive_next : 1) * 1000;
        }
    }
    if (!s->closed) close_session(s, s->quitting ? "closed by app" : "loop ended");
    if (s->sftp) { libssh2_sftp_shutdown(s->sftp); s->sftp = NULL; }
    fail_all(s);
    if (s->quitting) {
        int64_t deadline = now_ms() + 2000;
        BLOCKING(s, deadline, libssh2_session_disconnect(s->ssh, "bye"));
    }
    return NULL;
}

static tx_session *start_session(int sock, const tx_config *cfg, const tx_callbacks *cb, tx_error *err) {
    pthread_once(&init_once, global_init);
    tx_session *s = calloc(1, sizeof *s);
    s->sock = sock;
    s->cb = *cb;
    s->cfg = *cfg;
    s->cfg.host = s->strings[0] = dup_or_null(cfg->host);
    s->cfg.username = s->strings[1] = dup_or_null(cfg->username);
    s->cfg.password = s->strings[2] = dup_or_null(cfg->password);
    s->cfg.private_key = s->strings[3] = dup_or_null(cfg->private_key);
    s->cfg.passphrase = s->strings[4] = dup_or_null(cfg->passphrase);
    s->cfg.certificate = s->strings[5] = dup_or_null(cfg->certificate);
    s->parent_bridge_id = -1;
    pthread_mutex_init(&s->mu, NULL);
    pthread_cond_init(&s->cv, NULL);
    if (pipe(s->wake)) { set_err(err, TX_ERR_IO, "pipe"); free(s); return NULL; }
    set_nonblock(s->wake[0]);
    set_nonblock(s->wake[1]);
    pthread_create(&s->thread, NULL, loop_main, s);
    s->thread_started = 1;
    pthread_mutex_lock(&s->mu);
    while (!s->ready) pthread_cond_wait(&s->cv, &s->mu);
    pthread_mutex_unlock(&s->mu);
    if (s->connect_err.code) {
        if (err) *err = s->connect_err;
        tx_free(s);
        return NULL;
    }
    return s;
}

tx_session *tx_connect(const tx_config *cfg, const tx_callbacks *cb, tx_error *err) {
    if (err) memset(err, 0, sizeof *err);
    int fd = tcp_connect(cfg->host, cfg->port, cfg->connect_timeout_secs > 0 ? cfg->connect_timeout_secs : 10, err);
    if (fd < 0) return NULL;
    return start_session(fd, cfg, cb, err);
}

/* ---------- channel <-> fd pump (forwards, socks, jump bridge) ---------- */

typedef struct {
    LIBSSH2_CHANNEL *ch;
    int fd;
    char *host;
    int port;
    char c2f[PUMP_BUF];
    size_t c2f_len, c2f_off;
    char f2c[PUMP_BUF];
    size_t f2c_len, f2c_off;
    int ch_eof, fd_eof, eof_sent;
    /* socks handshake */
    int socks;
    unsigned char in[600];
    size_t in_len;
    int greeted;
    int replied;
} pump_state;

static void pump_destroy(tx_session *s, tx_task *t) {
    pump_state *p = t->state;
    (void)s;
    if (p->ch) { libssh2_channel_free(p->ch); }
    if (p->fd >= 0) close(p->fd);
    free(p->host);
    free(p);
}

static int pump_fds(tx_session *s, tx_task *t, struct pollfd *pf, int max) {
    pump_state *p = t->state;
    (void)s;
    if (max < 1 || p->fd < 0) return 0;
    pf->fd = p->fd;
    pf->events = 0;
    if (!p->fd_eof && p->f2c_len == 0 && (p->ch || p->socks)) pf->events |= POLLIN;
    if (p->c2f_len > p->c2f_off) pf->events |= POLLOUT;
    return 1;
}

static int write_all_nb(int fd, const void *b, size_t n) {
    return send(fd, b, n, MSG_NOSIGNAL) == (ssize_t)n ? 0 : -1;
}

/* Returns 1 while the handshake still needs bytes, 0 when host/port are known, -1 on error. */
static int socks_parse(pump_state *p) {
    for (;;) {
        ssize_t r = recv(p->fd, p->in + p->in_len, sizeof p->in - p->in_len, 0);
        if (r > 0) { p->in_len += r; continue; }
        if (r == 0) return -1;
        break;
    }
    if (!p->greeted) {
        if (p->in_len < 2 || p->in[0] != 5) return p->in_len >= 2 ? -1 : 1;
        size_t need = 2 + p->in[1];
        if (p->in_len < need) return 1;
        write_all_nb(p->fd, "\x05\x00", 2);
        memmove(p->in, p->in + need, p->in_len - need);
        p->in_len -= need;
        p->greeted = 1;
    }
    if (p->in_len < 5) return 1;
    if (p->in[1] != 1) return -1;
    char host[300];
    size_t need;
    if (p->in[3] == 1) {
        need = 4 + 4 + 2;
        if (p->in_len < need) return 1;
        inet_ntop(AF_INET, p->in + 4, host, sizeof host);
    } else if (p->in[3] == 3) {
        need = 5 + p->in[4] + 2;
        if (p->in_len < need) return 1;
        memcpy(host, p->in + 5, p->in[4]);
        host[p->in[4]] = 0;
    } else if (p->in[3] == 4) {
        need = 4 + 16 + 2;
        if (p->in_len < need) return 1;
        inet_ntop(AF_INET6, p->in + 4, host, sizeof host);
    } else {
        return -1;
    }
    p->port = (p->in[need - 2] << 8) | p->in[need - 1];
    p->host = strdup(host);
    return 0;
}

static int pump_step(tx_session *s, tx_task *t) {
    pump_state *p = t->state;
    int moved = 0;
    if (p->socks && !p->host) {
        int r = socks_parse(p);
        if (r < 0) return STEP_DONE;
        if (r > 0) return STEP_IDLE;
        moved = 1;
    }
    if (!p->ch) {
        p->ch = libssh2_channel_direct_tcpip_ex(s->ssh, p->host, p->port, "127.0.0.1", 0);
        if (!p->ch) {
            if (libssh2_session_last_errno(s->ssh) == LIBSSH2_ERROR_EAGAIN) return moved;
            if (p->socks) write_all_nb(p->fd, "\x05\x05\x00\x01\x00\x00\x00\x00\x00\x00", 10);
            if (t->cmd) set_ssh_err(s, &t->cmd->err, TX_ERR_CHANNEL, "direct-tcpip");
            return STEP_DONE;
        }
        if (p->socks) write_all_nb(p->fd, "\x05\x00\x00\x01\x00\x00\x00\x00\x00\x00", 10);
        if (t->cmd) { finish_cmd(s, t->cmd); t->cmd = NULL; }
        moved = 1;
    }
    /* channel -> fd */
    if (p->c2f_off == p->c2f_len && !p->ch_eof) {
        ssize_t r = libssh2_channel_read(p->ch, p->c2f, sizeof p->c2f);
        if (r > 0) { p->c2f_len = r; p->c2f_off = 0; moved = 1; }
        else if (r == 0 && libssh2_channel_eof(p->ch)) { p->ch_eof = 1; shutdown(p->fd, SHUT_WR); moved = 1; }
        else if (r < 0 && r != LIBSSH2_ERROR_EAGAIN) return STEP_DONE;
    }
    if (p->c2f_off < p->c2f_len) {
        ssize_t w = send(p->fd, p->c2f + p->c2f_off, p->c2f_len - p->c2f_off, MSG_NOSIGNAL);
        if (w > 0) { p->c2f_off += w; moved = 1; }
        else if (w < 0 && errno != EAGAIN && errno != EWOULDBLOCK) return STEP_DONE;
        if (p->c2f_off == p->c2f_len) p->c2f_off = p->c2f_len = 0;
    }
    /* fd -> channel */
    if (p->f2c_off == p->f2c_len && !p->fd_eof) {
        ssize_t r = recv(p->fd, p->f2c, sizeof p->f2c, 0);
        if (r > 0) { p->f2c_len = r; p->f2c_off = 0; moved = 1; }
        else if (r == 0) { p->fd_eof = 1; moved = 1; }
        else if (errno != EAGAIN && errno != EWOULDBLOCK) p->fd_eof = 1;
    }
    if (p->f2c_off < p->f2c_len) {
        ssize_t w = libssh2_channel_write(p->ch, p->f2c + p->f2c_off, p->f2c_len - p->f2c_off);
        if (w > 0) { p->f2c_off += w; moved = 1; }
        else if (w < 0 && w != LIBSSH2_ERROR_EAGAIN) return STEP_DONE;
        if (p->f2c_off == p->f2c_len) p->f2c_off = p->f2c_len = 0;
    }
    if (p->fd_eof && !p->eof_sent && p->f2c_len == 0) {
        int r = libssh2_channel_send_eof(p->ch);
        if (r == 0) p->eof_sent = 1;
    }
    if (p->ch_eof && p->fd_eof && p->c2f_len == 0) return STEP_DONE;
    return moved ? STEP_PROGRESS : STEP_IDLE;
}

static tx_task *add_pump(tx_session *s, int fd, const char *host, int port, int socks) {
    tx_task *t = add_task(s);
    pump_state *p = calloc(1, sizeof *p);
    p->fd = fd;
    p->host = host ? strdup(host) : NULL;
    p->port = port;
    p->socks = socks;
    set_nonblock(fd);
    t->state = p;
    t->step = pump_step;
    t->fds = pump_fds;
    t->destroy = pump_destroy;
    t->uses_channel = 1;
    return t;
}

/* ---------- jump host ---------- */

typedef struct {
    const char *host;
    int port;
    int fd;
} bridge_arg;

static int bridge_start(tx_session *s, tx_cmd *c) {
    bridge_arg *a = c->arg;
    tx_task *t = add_pump(s, a->fd, a->host, a->port, 0);
    t->cmd = c; /* finished once the channel opens */
    c->result = (void *)(intptr_t)t->id;
    return 0;
}

tx_session *tx_connect_via(tx_session *parent, const tx_config *cfg, const tx_callbacks *cb, tx_error *err) {
    if (err) memset(err, 0, sizeof *err);
    int sp[2];
    if (socketpair(AF_UNIX, SOCK_STREAM, 0, sp)) { set_err(err, TX_ERR_IO, "socketpair"); return NULL; }
    bridge_arg a = {cfg->host, cfg->port, sp[0]};
    tx_cmd c = {.start = bridge_start, .arg = &a};
    if (run_cmd(parent, &c)) {
        if (err) *err = c.err;
        close(sp[1]);
        return NULL;
    }
    set_nonblock(sp[1]);
    tx_session *child = start_session(sp[1], cfg, cb, err);
    if (child) {
        child->parent = parent;
        child->parent_bridge_id = (int)(intptr_t)c.result;
    }
    return child;
}

/* ---------- exec ---------- */

typedef struct {
    const char *command;
    LIBSSH2_CHANNEL *ch;
    int state;
    char *out, *err;
    size_t out_len, err_len;
    int exit_code;
} exec_state;

static void buf_add(char **b, size_t *len, const char *d, size_t n) {
    *b = realloc(*b, *len + n + 1);
    memcpy(*b + *len, d, n);
    *len += n;
    (*b)[*len] = 0;
}

static int exec_step(tx_session *s, tx_task *t) {
    exec_state *e = t->state;
    char buf[16384];
    switch (e->state) {
    case 0:
        e->ch = libssh2_channel_open_session(s->ssh);
        if (!e->ch) {
            if (libssh2_session_last_errno(s->ssh) == LIBSSH2_ERROR_EAGAIN) return STEP_IDLE;
            set_ssh_err(s, &t->cmd->err, TX_ERR_CHANNEL, "open session");
            return STEP_DONE;
        }
        e->state = 1; /* fallthrough */
    case 1: {
        int r = libssh2_channel_exec(e->ch, e->command);
        if (r == LIBSSH2_ERROR_EAGAIN) return STEP_IDLE;
        if (r) { set_ssh_err(s, &t->cmd->err, TX_ERR_CHANNEL, "exec"); return STEP_DONE; }
        e->state = 2;
    } /* fallthrough */
    case 2: {
        int moved = 0;
        ssize_t r;
        while ((r = libssh2_channel_read(e->ch, buf, sizeof buf)) > 0) { buf_add(&e->out, &e->out_len, buf, r); moved = 1; }
        ssize_t r2;
        while ((r2 = libssh2_channel_read_stderr(e->ch, buf, sizeof buf)) > 0) { buf_add(&e->err, &e->err_len, buf, r2); moved = 1; }
        if (!libssh2_channel_eof(e->ch)) return moved ? STEP_PROGRESS : STEP_IDLE;
        e->state = 3;
    } /* fallthrough */
    case 3: {
        int r = libssh2_channel_close(e->ch);
        if (r == LIBSSH2_ERROR_EAGAIN) return STEP_IDLE;
        e->state = 4;
    } /* fallthrough */
    case 4: {
        int r = libssh2_channel_wait_closed(e->ch);
        if (r == LIBSSH2_ERROR_EAGAIN) return STEP_IDLE;
        e->exit_code = libssh2_channel_get_exit_status(e->ch);
        return STEP_DONE;
    }
    }
    return STEP_DONE;
}

static void exec_destroy(tx_session *s, tx_task *t) {
    exec_state *e = t->state;
    (void)s;
    if (e->ch) libssh2_channel_free(e->ch);
    /* out/err are handed to the caller through the cmd */
}

static int exec_start(tx_session *s, tx_cmd *c) {
    tx_task *t = add_task(s);
    exec_state *e = calloc(1, sizeof *e);
    e->command = c->arg;
    t->state = e;
    t->step = exec_step;
    t->destroy = exec_destroy;
    t->uses_channel = 1;
    t->cmd = c;
    c->result = e;
    return 0;
}

int tx_exec(tx_session *s, const char *command, char **out, size_t *out_len, char **err_out,
            size_t *err_len, int *exit_code, tx_error *err) {
    tx_cmd c = {.start = exec_start, .arg = (void *)command};
    int rc = run_cmd(s, &c);
    exec_state *e = c.result;
    if (err) *err = c.err;
    if (!e) return rc;
    if (rc == 0) {
        *out = e->out ? e->out : strdup("");
        *out_len = e->out_len;
        *err_out = e->err ? e->err : strdup("");
        *err_len = e->err_len;
        *exit_code = e->exit_code;
    } else {
        free(e->out);
        free(e->err);
    }
    free(e);
    return rc;
}

/* ---------- shell ---------- */

struct shell_state {
    LIBSSH2_CHANNEL *ch;
    int state;
    char *term;
    int cols, rows;
    char **env_names, **env_values;
    int env_count, env_i;
    tx_shell_callbacks cb;
    /* filled from other threads under s->mu */
    char *out;
    size_t out_len, out_off;
    int resize_cols, resize_rows, close_requested;
    int refs; /* atomic, shared with the tx_shell handle */
    int dead; /* guarded by s->mu */
};

static void shell_free_state(shell_state *h) {
    for (int i = 0; i < h->env_count; i++) { free(h->env_names[i]); free(h->env_values[i]); }
    free(h->env_names);
    free(h->env_values);
    free(h->term);
    free(h->out);
    free(h);
}

static void shell_destroy(tx_session *s, tx_task *t) {
    shell_state *h = t->state;
    if (h->ch) libssh2_channel_free(h->ch);
    h->ch = NULL;
    pthread_mutex_lock(&s->mu);
    h->dead = 1;
    pthread_mutex_unlock(&s->mu);
    if (__atomic_sub_fetch(&h->refs, 1, __ATOMIC_SEQ_CST) == 0) shell_free_state(h);
}

static int shell_step(tx_session *s, tx_task *t) {
    shell_state *h = t->state;
    int moved = 0;
    switch (h->state) {
    case 0:
        h->ch = libssh2_channel_open_session(s->ssh);
        if (!h->ch) {
            if (libssh2_session_last_errno(s->ssh) == LIBSSH2_ERROR_EAGAIN) return STEP_IDLE;
            set_ssh_err(s, &t->cmd->err, TX_ERR_CHANNEL, "open session");
            return STEP_DONE;
        }
        h->state = 1; /* fallthrough */
    case 1:
        while (h->env_i < h->env_count) {
            int r = libssh2_channel_setenv(h->ch, h->env_names[h->env_i], h->env_values[h->env_i]);
            if (r == LIBSSH2_ERROR_EAGAIN) return STEP_IDLE;
            h->env_i++; /* refused env vars are fine */
        }
        h->state = 2; /* fallthrough */
    case 2: {
        int r = libssh2_channel_request_pty_ex(h->ch, h->term, (unsigned int)strlen(h->term), NULL, 0, h->cols, h->rows, 0, 0);
        if (r == LIBSSH2_ERROR_EAGAIN) return STEP_IDLE;
        if (r) { set_ssh_err(s, &t->cmd->err, TX_ERR_CHANNEL, "pty"); return STEP_DONE; }
        h->state = 3;
    } /* fallthrough */
    case 3: {
        int r = libssh2_channel_shell(h->ch);
        if (r == LIBSSH2_ERROR_EAGAIN) return STEP_IDLE;
        if (r) { set_ssh_err(s, &t->cmd->err, TX_ERR_CHANNEL, "shell"); return STEP_DONE; }
        h->state = 4;
        finish_cmd(s, t->cmd);
        t->cmd = NULL;
        moved = 1;
    } /* fallthrough */
    case 4: {
        char buf[32768];
        ssize_t r;
        while ((r = libssh2_channel_read(h->ch, buf, sizeof buf)) > 0) {
            h->cb.on_data(h->cb.ctx, buf, (size_t)r);
            moved = 1;
        }
        if (r < 0 && r != LIBSSH2_ERROR_EAGAIN) { h->state = 5; break; }
        pthread_mutex_lock(&s->mu);
        int rc = h->resize_cols, rr = h->resize_rows, want_close = h->close_requested;
        h->resize_cols = h->resize_rows = 0;
        pthread_mutex_unlock(&s->mu);
        if (rc && libssh2_channel_request_pty_size(h->ch, rc, rr) == LIBSSH2_ERROR_EAGAIN) {
            pthread_mutex_lock(&s->mu);
            if (!h->resize_cols) { h->resize_cols = rc; h->resize_rows = rr; }
            pthread_mutex_unlock(&s->mu);
        }
        pthread_mutex_lock(&s->mu);
        while (h->out_off < h->out_len) {
            ssize_t w = libssh2_channel_write(h->ch, h->out + h->out_off, h->out_len - h->out_off);
            if (w <= 0) break;
            h->out_off += w;
            moved = 1;
        }
        if (h->out_off == h->out_len) h->out_off = h->out_len = 0;
        pthread_mutex_unlock(&s->mu);
        if (want_close) { libssh2_channel_send_eof(h->ch); h->state = 5; break; }
        if (libssh2_channel_eof(h->ch)) { h->state = 5; break; }
        return moved ? STEP_PROGRESS : STEP_IDLE;
    }
    }
    if (h->state == 5) {
        int r = libssh2_channel_close(h->ch);
        if (r == LIBSSH2_ERROR_EAGAIN) return STEP_IDLE;
        h->state = 6;
    }
    if (h->state == 6) {
        int r = libssh2_channel_wait_closed(h->ch);
        if (r == LIBSSH2_ERROR_EAGAIN) return STEP_IDLE;
        int code = libssh2_channel_get_exit_status(h->ch);
        h->cb.on_exit(h->cb.ctx, 1, code);
        return STEP_DONE;
    }
    return STEP_DONE;
}

typedef struct {
    const char *term;
    int cols, rows;
    const char **names, **values;
    int count;
    const tx_shell_callbacks *cb;
} shell_arg;

static int shell_start(tx_session *s, tx_cmd *c) {
    shell_arg *a = c->arg;
    tx_task *t = add_task(s);
    shell_state *h = calloc(1, sizeof *h);
    h->term = strdup(a->term ? a->term : "xterm-256color");
    h->cols = a->cols;
    h->rows = a->rows;
    h->env_count = a->count;
    h->env_names = calloc(a->count + 1, sizeof(char *));
    h->env_values = calloc(a->count + 1, sizeof(char *));
    for (int i = 0; i < a->count; i++) { h->env_names[i] = strdup(a->names[i]); h->env_values[i] = strdup(a->values[i]); }
    h->cb = *a->cb;
    h->refs = 2;
    t->state = h;
    t->step = shell_step;
    t->destroy = shell_destroy;
    t->uses_channel = 1;
    t->cmd = c;
    c->result = h;
    return 0;
}

tx_shell *tx_shell_open(tx_session *s, const char *term, int cols, int rows, const char **env_names,
                        const char **env_values, int env_count, const tx_shell_callbacks *cb, tx_error *err) {
    shell_arg a = {term, cols, rows, env_names, env_values, env_count, cb};
    tx_cmd c = {.start = shell_start, .arg = &a};
    int rc = run_cmd(s, &c);
    if (err) *err = c.err;
    shell_state *h = c.result;
    if (rc) {
        if (h && __atomic_sub_fetch(&h->refs, 1, __ATOMIC_SEQ_CST) == 0) shell_free_state(h);
        return NULL;
    }
    tx_shell *sh = calloc(1, sizeof *sh);
    sh->s = s;
    sh->h = h;
    return sh;
}

/* Small changes to a live shell happen under the session lock, then the loop is woken. */
static shell_state *shell_locked(tx_shell *sh) { return sh->h->dead ? NULL : sh->h; }

int tx_shell_write(tx_shell *sh, const char *data, size_t len) {
    pthread_mutex_lock(&sh->s->mu);
    shell_state *h = sh->s->closed ? NULL : shell_locked(sh);
    if (h) buf_add(&h->out, &h->out_len, data, len);
    pthread_mutex_unlock(&sh->s->mu);
    if (!h) return TX_ERR_DISCONNECTED;
    wake_loop(sh->s);
    return 0;
}

int tx_shell_resize(tx_shell *sh, int cols, int rows) {
    pthread_mutex_lock(&sh->s->mu);
    shell_state *h = sh->s->closed ? NULL : shell_locked(sh);
    if (h) { h->resize_cols = cols; h->resize_rows = rows; }
    pthread_mutex_unlock(&sh->s->mu);
    if (!h) return TX_ERR_DISCONNECTED;
    wake_loop(sh->s);
    return 0;
}

void tx_shell_close(tx_shell *sh) {
    pthread_mutex_lock(&sh->s->mu);
    shell_state *h = sh->s->closed ? NULL : shell_locked(sh);
    if (h) h->close_requested = 1;
    pthread_mutex_unlock(&sh->s->mu);
    wake_loop(sh->s);
}

/* Safe after the session is freed: it only drops this handle's reference. */
void tx_shell_free(tx_shell *sh) {
    if (__atomic_sub_fetch(&sh->h->refs, 1, __ATOMIC_SEQ_CST) == 0) shell_free_state(sh->h);
    free(sh);
}

/* ---------- sftp ---------- */

enum { SF_LIST, SF_SIZE, SF_DOWN, SF_UP, SF_REMOVE };

typedef struct {
    int kind;
    int state;
    const char *path, *local;
    tx_progress_fn fn;
    void *ctx;
    LIBSSH2_SFTP_HANDLE *h;
    int fd;
    char *buf;
    size_t buf_len, buf_off;
    int local_eof;
    uint64_t total, done, last_report;
    int64_t started;
    tx_file_entry *entries;
    int count, cap;
} sftp_state;

static void sftp_report(sftp_state *f) {
    if (f->fn && (f->done - f->last_report >= PROGRESS_EVERY || f->done == f->total)) {
        f->last_report = f->done;
        f->fn(f->ctx, f->done, f->total);
    }
}

static int sftp_fail(tx_session *s, tx_task *t, const char *what) {
    unsigned long code = s->sftp ? libssh2_sftp_last_error(s->sftp) : 0;
    char *msg = NULL;
    libssh2_session_last_error(s->ssh, &msg, NULL, 0);
    set_err(&t->cmd->err, TX_ERR_SFTP, "%s: sftp status %lu, %s", what, code, msg ? msg : "");
    return STEP_DONE;
}

#define SF_AGAIN() (libssh2_session_last_errno(s->ssh) == LIBSSH2_ERROR_EAGAIN)

static int sftp_step(tx_session *s, tx_task *t) {
    sftp_state *f = t->state;
    int moved = 0;
    if (f->state == 0) {
        if (!s->sftp) {
            s->sftp = libssh2_sftp_init(s->ssh);
            if (!s->sftp) return SF_AGAIN() ? STEP_IDLE : sftp_fail(s, t, "init");
        }
        f->state = 1;
    }
    switch (f->kind) {
    case SF_SIZE: {
        LIBSSH2_SFTP_ATTRIBUTES a;
        int r = libssh2_sftp_stat_ex(s->sftp, f->path, (unsigned int)strlen(f->path), LIBSSH2_SFTP_STAT, &a);
        if (r == LIBSSH2_ERROR_EAGAIN) return STEP_IDLE;
        if (r) return sftp_fail(s, t, "stat");
        f->total = a.filesize;
        return STEP_DONE;
    }
    case SF_REMOVE: {
        int r = libssh2_sftp_unlink_ex(s->sftp, f->path, (unsigned int)strlen(f->path));
        if (r == LIBSSH2_ERROR_EAGAIN) return STEP_IDLE;
        if (r) return sftp_fail(s, t, "remove");
        return STEP_DONE;
    }
    case SF_LIST:
        if (f->state == 1) {
            f->h = libssh2_sftp_open_ex(s->sftp, f->path, (unsigned int)strlen(f->path), 0, 0, LIBSSH2_SFTP_OPENDIR);
            if (!f->h) return SF_AGAIN() ? STEP_IDLE : sftp_fail(s, t, "opendir");
            f->state = 2;
        }
        if (f->state == 2) {
            for (;;) {
                char name[512], longentry[1024];
                LIBSSH2_SFTP_ATTRIBUTES a;
                int r = libssh2_sftp_readdir_ex(f->h, name, sizeof name, longentry, sizeof longentry, &a);
                if (r == LIBSSH2_ERROR_EAGAIN) return moved ? STEP_PROGRESS : STEP_IDLE;
                if (r < 0) return sftp_fail(s, t, "readdir");
                if (r == 0) break;
                if (!strcmp(name, ".") || !strcmp(name, "..")) continue;
                if (f->count == f->cap) {
                    f->cap = f->cap ? f->cap * 2 : 32;
                    f->entries = realloc(f->entries, f->cap * sizeof *f->entries);
                }
                tx_file_entry *e = &f->entries[f->count++];
                e->name = strdup(name);
                e->size = a.filesize;
                e->permissions = (uint32_t)a.permissions;
                e->mtime = (uint32_t)a.mtime;
                e->is_dir = LIBSSH2_SFTP_S_ISDIR(a.permissions);
                e->is_symlink = LIBSSH2_SFTP_S_ISLNK(a.permissions);
                moved = 1;
            }
            f->state = 3;
        }
        if (libssh2_sftp_close_handle(f->h) == LIBSSH2_ERROR_EAGAIN) return STEP_IDLE;
        f->h = NULL;
        return STEP_DONE;
    case SF_DOWN:
        if (f->state == 1) {
            LIBSSH2_SFTP_ATTRIBUTES a;
            int r = libssh2_sftp_stat_ex(s->sftp, f->path, (unsigned int)strlen(f->path), LIBSSH2_SFTP_STAT, &a);
            if (r == LIBSSH2_ERROR_EAGAIN) return STEP_IDLE;
            if (r) return sftp_fail(s, t, "stat");
            f->total = a.filesize;
            f->state = 2;
        }
        if (f->state == 2) {
            f->h = libssh2_sftp_open_ex(s->sftp, f->path, (unsigned int)strlen(f->path), LIBSSH2_FXF_READ, 0, LIBSSH2_SFTP_OPENFILE);
            if (!f->h) return SF_AGAIN() ? STEP_IDLE : sftp_fail(s, t, "open");
            f->fd = open(f->local, O_WRONLY | O_CREAT | O_TRUNC, 0644);
            if (f->fd < 0) { set_err(&t->cmd->err, TX_ERR_IO, "open %s: %s", f->local, strerror(errno)); return STEP_DONE; }
            f->state = 3;
        }
        if (f->state == 3) {
            for (int i = 0; i < 64; i++) {
                ssize_t r = libssh2_sftp_read(f->h, f->buf, CHUNK);
                if (r == LIBSSH2_ERROR_EAGAIN) return moved ? STEP_PROGRESS : STEP_IDLE;
                if (r < 0) return sftp_fail(s, t, "read");
                if (r == 0) { f->state = 4; break; }
                for (ssize_t off = 0; off < r;) {
                    ssize_t w = write(f->fd, f->buf + off, r - off);
                    if (w < 0) { set_err(&t->cmd->err, TX_ERR_IO, "write: %s", strerror(errno)); return STEP_DONE; }
                    off += w;
                }
                f->done += r;
                sftp_report(f);
                moved = 1;
            }
            if (f->state == 3) return STEP_PROGRESS;
        }
        if (libssh2_sftp_close_handle(f->h) == LIBSSH2_ERROR_EAGAIN) return STEP_IDLE;
        f->h = NULL;
        return STEP_DONE;
    case SF_UP:
        if (f->state == 1) {
            f->fd = open(f->local, O_RDONLY);
            if (f->fd < 0) { set_err(&t->cmd->err, TX_ERR_IO, "open %s: %s", f->local, strerror(errno)); return STEP_DONE; }
            struct stat st;
            fstat(f->fd, &st);
            f->total = (uint64_t)st.st_size;
            f->state = 2;
        }
        if (f->state == 2) {
            f->h = libssh2_sftp_open_ex(s->sftp, f->path, (unsigned int)strlen(f->path),
                                        LIBSSH2_FXF_WRITE | LIBSSH2_FXF_CREAT | LIBSSH2_FXF_TRUNC, 0644, LIBSSH2_SFTP_OPENFILE);
            if (!f->h) return SF_AGAIN() ? STEP_IDLE : sftp_fail(s, t, "create");
            f->state = 3;
        }
        if (f->state == 3) {
            for (int i = 0; i < 64; i++) {
                if (f->buf_off == f->buf_len && !f->local_eof) {
                    ssize_t r = read(f->fd, f->buf, CHUNK);
                    if (r < 0) { set_err(&t->cmd->err, TX_ERR_IO, "read: %s", strerror(errno)); return STEP_DONE; }
                    if (r == 0) f->local_eof = 1;
                    f->buf_len = (size_t)r;
                    f->buf_off = 0;
                }
                if (f->buf_off == f->buf_len && f->local_eof) { f->state = 4; break; }
                ssize_t w = libssh2_sftp_write(f->h, f->buf + f->buf_off, f->buf_len - f->buf_off);
                if (w == LIBSSH2_ERROR_EAGAIN) return moved ? STEP_PROGRESS : STEP_IDLE;
                if (w < 0) return sftp_fail(s, t, "write");
                f->buf_off += w;
                f->done += w;
                sftp_report(f);
                moved = 1;
            }
            if (f->state == 3) return STEP_PROGRESS;
        }
        if (libssh2_sftp_close_handle(f->h) == LIBSSH2_ERROR_EAGAIN) return STEP_IDLE;
        f->h = NULL;
        return STEP_DONE;
    }
    return STEP_DONE;
}

static void sftp_destroy(tx_session *s, tx_task *t) {
    sftp_state *f = t->state;
    (void)s;
    if (f->h) libssh2_sftp_close_handle(f->h);
    if (f->fd >= 0) close(f->fd);
    free(f->buf);
    f->buf = NULL;
    /* the state itself goes back to the caller */
}

static int sftp_start(tx_session *s, tx_cmd *c) {
    sftp_state *f = c->arg;
    tx_task *t = add_task(s);
    f->fd = -1;
    f->started = now_ms();
    if (f->kind == SF_DOWN || f->kind == SF_UP) f->buf = malloc(CHUNK);
    t->state = f;
    t->step = sftp_step;
    t->destroy = sftp_destroy;
    t->uses_channel = 1;
    t->cmd = c;
    return 0;
}

static int run_sftp(tx_session *s, sftp_state *f, tx_error *err) {
    tx_cmd c = {.start = sftp_start, .arg = f};
    int rc = run_cmd(s, &c);
    if (err) *err = c.err;
    return rc;
}

int tx_sftp_list(tx_session *s, const char *path, tx_file_entry **entries, int *count, tx_error *err) {
    sftp_state f = {.kind = SF_LIST, .path = path};
    int rc = run_sftp(s, &f, err);
    if (rc) { tx_free_entries(f.entries, f.count); return rc; }
    *entries = f.entries;
    *count = f.count;
    return 0;
}

void tx_free_entries(tx_file_entry *entries, int count) {
    for (int i = 0; i < count; i++) free(entries[i].name);
    free(entries);
}

int tx_sftp_size(tx_session *s, const char *path, uint64_t *size, tx_error *err) {
    sftp_state f = {.kind = SF_SIZE, .path = path};
    int rc = run_sftp(s, &f, err);
    *size = f.total;
    return rc;
}

int tx_sftp_download(tx_session *s, const char *remote, const char *local, tx_progress_fn fn, void *ctx,
                     uint64_t *bytes, uint64_t *millis, tx_error *err) {
    sftp_state f = {.kind = SF_DOWN, .path = remote, .local = local, .fn = fn, .ctx = ctx};
    int rc = run_sftp(s, &f, err);
    *bytes = f.done;
    *millis = (uint64_t)(now_ms() - f.started);
    return rc;
}

int tx_sftp_upload(tx_session *s, const char *local, const char *remote, tx_progress_fn fn, void *ctx,
                   uint64_t *bytes, uint64_t *millis, tx_error *err) {
    sftp_state f = {.kind = SF_UP, .path = remote, .local = local, .fn = fn, .ctx = ctx};
    int rc = run_sftp(s, &f, err);
    *bytes = f.done;
    *millis = (uint64_t)(now_ms() - f.started);
    return rc;
}

int tx_sftp_remove(tx_session *s, const char *path, tx_error *err) {
    sftp_state f = {.kind = SF_REMOVE, .path = path};
    return run_sftp(s, &f, err);
}

/* ---------- forwards ---------- */

typedef struct {
    int fd;
    char *host;
    int port;
    int socks;
} listen_state;

static int listen_fds(tx_session *s, tx_task *t, struct pollfd *pf, int max) {
    listen_state *l = t->state;
    (void)s;
    if (max < 1) return 0;
    pf->fd = l->fd;
    pf->events = POLLIN;
    return 1;
}

static int listen_step(tx_session *s, tx_task *t) {
    listen_state *l = t->state;
    int moved = 0;
    for (;;) {
        int c = accept(l->fd, NULL, NULL);
        if (c < 0) break;
        add_pump(s, c, l->host, l->port, l->socks);
        moved = 1;
    }
    return moved ? STEP_PROGRESS : STEP_IDLE;
}

static void listen_destroy(tx_session *s, tx_task *t) {
    listen_state *l = t->state;
    (void)s;
    close(l->fd);
    free(l->host);
    free(l);
}

typedef struct {
    const char *bind_host;
    int bind_port;
    const char *host;
    int port;
    int socks;
    int bound_port;
} fwd_arg;

static int forward_start(tx_session *s, tx_cmd *c) {
    fwd_arg *a = c->arg;
    struct sockaddr_in addr = {0};
    addr.sin_family = AF_INET;
    addr.sin_port = htons((uint16_t)a->bind_port);
    inet_pton(AF_INET, a->bind_host, &addr.sin_addr);
    int fd = socket(AF_INET, SOCK_STREAM, 0);
    int one = 1;
    setsockopt(fd, SOL_SOCKET, SO_REUSEADDR, &one, sizeof one);
    if (bind(fd, (struct sockaddr *)&addr, sizeof addr) || listen(fd, 64)) {
        set_err(&c->err, TX_ERR_IO, "listen: %s", strerror(errno));
        close(fd);
        return 1;
    }
    socklen_t len = sizeof addr;
    getsockname(fd, (struct sockaddr *)&addr, &len);
    a->bound_port = ntohs(addr.sin_port);
    set_nonblock(fd);
    tx_task *t = add_task(s);
    listen_state *l = calloc(1, sizeof *l);
    l->fd = fd;
    l->host = a->host ? strdup(a->host) : NULL;
    l->port = a->port;
    l->socks = a->socks;
    t->state = l;
    t->step = listen_step;
    t->fds = listen_fds;
    t->destroy = listen_destroy;
    c->result = (void *)(intptr_t)t->id;
    return 1;
}

static tx_forward *make_forward(tx_session *s, fwd_arg *a, tx_error *err) {
    tx_cmd c = {.start = forward_start, .arg = a};
    int rc = run_cmd(s, &c);
    if (err) *err = c.err;
    if (rc) return NULL;
    tx_forward *f = calloc(1, sizeof *f);
    f->s = s;
    f->id = (int)(intptr_t)c.result;
    f->port = a->bound_port;
    return f;
}

tx_forward *tx_forward_local(tx_session *s, const char *bind_host, int bind_port, const char *remote_host,
                             int remote_port, tx_error *err) {
    fwd_arg a = {bind_host, bind_port, remote_host, remote_port, 0, 0};
    return make_forward(s, &a, err);
}

tx_forward *tx_forward_dynamic(tx_session *s, const char *bind_host, int bind_port, tx_error *err) {
    fwd_arg a = {bind_host, bind_port, NULL, 0, 1, 0};
    return make_forward(s, &a, err);
}

int tx_forward_port(tx_forward *f) { return f->port; }

static int remove_task_start(tx_session *s, tx_cmd *c) {
    int id = (int)(intptr_t)c->arg;
    for (tx_task **pp = &s->tasks; *pp; pp = &(*pp)->next) {
        if ((*pp)->id == id) {
            tx_task *t = *pp;
            *pp = t->next;
            if (t->destroy) t->destroy(s, t);
            free(t);
            break;
        }
    }
    return 1;
}

void tx_forward_close(tx_forward *f) {
    tx_cmd c = {.start = remove_task_start, .arg = (void *)(intptr_t)f->id};
    run_cmd(f->s, &c);
    free(f);
}

/* ---------- lifecycle ---------- */

void tx_host_key_info(tx_session *s, tx_host_key *out) { *out = s->host_key; }
void tx_algorithms_info(tx_session *s, tx_algorithms *out) { *out = s->algos; }

int tx_is_closed(tx_session *s) {
    pthread_mutex_lock(&s->mu);
    int c = s->closed;
    pthread_mutex_unlock(&s->mu);
    return c;
}

static int quit_start(tx_session *s, tx_cmd *c) {
    (void)c;
    s->quitting = 1;
    return 1;
}

void tx_disconnect(tx_session *s) {
    tx_cmd c = {.start = quit_start};
    run_cmd(s, &c);
}

void tx_free(tx_session *s) {
    if (!s) return;
    if (!tx_is_closed(s)) tx_disconnect(s);
    if (s->thread_started) pthread_join(s->thread, NULL);
    if (s->parent && s->parent_bridge_id >= 0 && !tx_is_closed(s->parent)) {
        tx_cmd c = {.start = remove_task_start, .arg = (void *)(intptr_t)s->parent_bridge_id};
        run_cmd(s->parent, &c);
    }
    if (s->ssh) libssh2_session_free(s->ssh);
    if (s->sock >= 0) close(s->sock);
    close(s->wake[0]);
    close(s->wake[1]);
    for (int i = 0; i < 8; i++) free(s->strings[i]);
    pthread_mutex_destroy(&s->mu);
    pthread_cond_destroy(&s->cv);
    free(s);
}

const char *tx_version(void) { return "libssh2 " LIBSSH2_VERSION; }
