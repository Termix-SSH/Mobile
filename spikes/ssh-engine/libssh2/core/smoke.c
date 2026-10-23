/* Quick checks for the C core against the test servers. The full scenario
 * suite runs through the Kotlin and Swift harnesses. */
#include "termix_ssh2.h"

#include <arpa/inet.h>
#include <netinet/in.h>
#include <pthread.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/socket.h>
#include <time.h>
#include <unistd.h>

static const char *host = "target";
static const char *keys = "/out";
static int failures = 0;

#define CHECK(cond, ...)                                  \
    do {                                                  \
        if (!(cond)) {                                    \
            failures++;                                   \
            printf("FAIL %s:%d ", __FILE__, __LINE__);    \
            printf(__VA_ARGS__);                          \
            printf("\n");                                 \
        }                                                 \
    } while (0)

static char *slurp(const char *name) {
    char path[512];
    snprintf(path, sizeof path, "%s/%s", keys, name);
    FILE *f = fopen(path, "rb");
    if (!f) { perror(path); exit(2); }
    fseek(f, 0, SEEK_END);
    long n = ftell(f);
    rewind(f);
    char *b = malloc(n + 1);
    fread(b, 1, n, f);
    b[n] = 0;
    fclose(f);
    return b;
}

static int accept_key(void *ctx, const tx_host_key *k) { (void)ctx; (void)k; return 1; }

static int rounds = 0;
static int kbd(void *ctx, const char *name, const char *ins, int n, const char **prompts, const int *echo, char **answers, int round) {
    (void)ctx; (void)name; (void)ins; (void)echo; (void)round;
    rounds++;
    for (int i = 0; i < n; i++) {
        if (strstr(prompts[i], "erification")) {
            /* code from the helper in the container */
            FILE *p = popen("oathtool --totp -b \"$(cat /out/totp_secret)\"", "r");
            char code[16] = {0};
            fgets(code, sizeof code, p);
            pclose(p);
            code[strcspn(code, "\n")] = 0;
            answers[i] = strdup(code);
        } else {
            answers[i] = strdup("termix-pass");
        }
    }
    return 0;
}

static int disconnected = 0;
static void on_disc(void *ctx, const char *r) { (void)ctx; printf("  disconnect: %s\n", r); disconnected = 1; }

static tx_callbacks cbs = {NULL, accept_key, kbd, NULL, on_disc};

static tx_config cfg(const char *user, int port) {
    tx_config c = {0};
    c.host = host;
    c.port = port;
    c.username = user;
    c.connect_timeout_secs = 10;
    c.keepalive_interval_secs = 30;
    c.keepalive_count_max = 5;
    return c;
}

static char shell_buf[65536];
static size_t shell_len = 0;
static pthread_mutex_t shell_mu = PTHREAD_MUTEX_INITIALIZER;
static void on_data(void *ctx, const char *d, size_t n) {
    (void)ctx;
    pthread_mutex_lock(&shell_mu);
    if (shell_len + n < sizeof shell_buf - 1) { memcpy(shell_buf + shell_len, d, n); shell_len += n; shell_buf[shell_len] = 0; }
    pthread_mutex_unlock(&shell_mu);
}
static int exited = -1;
static void on_exit_cb(void *ctx, int has, int code) { (void)ctx; exited = has ? code : -2; }

static int wait_for(const char *needle, int secs) {
    for (int i = 0; i < secs * 20; i++) {
        pthread_mutex_lock(&shell_mu);
        int hit = strstr(shell_buf, needle) != NULL;
        pthread_mutex_unlock(&shell_mu);
        if (hit) return 1;
        usleep(50000);
    }
    return 0;
}

static double secs_since(struct timespec *a) {
    struct timespec b;
    clock_gettime(CLOCK_MONOTONIC, &b);
    return (b.tv_sec - a->tv_sec) + (b.tv_nsec - a->tv_nsec) / 1e9;
}

int main(int argc, char **argv) {
    if (argc > 1) host = argv[1];
    tx_error err;
    printf("%s\n", tx_version());

    /* password */
    tx_config c = cfg("pw", 22);
    c.password = "termix-pass";
    tx_session *s = tx_connect(&c, &cbs, &err);
    CHECK(s, "password: %s", err.message);
    if (s) {
        tx_host_key k;
        tx_host_key_info(s, &k);
        printf("  host key %s cert=%d %s ca=%s principals=%s\n", k.key_type, k.is_certificate, k.sha256, k.ca_sha256, k.principals);
        tx_algorithms a;
        tx_algorithms_info(s, &a);
        printf("  algos %s %s %s %s\n", a.kex, a.host_key, a.cipher, a.mac);
        char *o, *e;
        size_t ol, el;
        int code;
        CHECK(tx_exec(s, "echo out; echo err >&2; exit 3", &o, &ol, &e, &el, &code, &err) == 0, "exec %s", err.message);
        CHECK(code == 3 && !strcmp(o, "out\n") && !strcmp(e, "err\n"), "exec result %d [%s] [%s]", code, o, e);
        free(o); free(e);
        tx_free(s);
    }
    c.password = "nope";
    s = tx_connect(&c, &cbs, &err);
    CHECK(!s && err.code == TX_ERR_AUTH, "wrong password gave %d %s", err.code, err.message);

    /* keys */
    const char *names[] = {"id_ed25519", "id_rsa", "id_ecdsa256", "id_ecdsa384", "id_ecdsa521", "id_rsa.ppk"};
    for (int i = 0; i < 6; i++) {
        c = cfg("key", 22);
        c.private_key = slurp(names[i]);
        s = tx_connect(&c, &cbs, &err);
        printf("  key %s: %s\n", names[i], s ? "ok" : err.message);
        if (i < 5) CHECK(s, "key %s", names[i]);
        if (s) tx_free(s);
        free((void *)c.private_key);
    }
    c = cfg("key", 22);
    c.private_key = slurp("id_ed25519_pass");
    s = tx_connect(&c, &cbs, &err);
    CHECK(!s && err.code == TX_ERR_PASSPHRASE_REQUIRED, "missing passphrase gave %d", err.code);
    c.passphrase = "wrong";
    s = tx_connect(&c, &cbs, &err);
    CHECK(!s && err.code == TX_ERR_BAD_PASSPHRASE, "wrong passphrase gave %d %s", err.code, err.message);
    c.passphrase = "termix-key";
    s = tx_connect(&c, &cbs, &err);
    CHECK(s, "passphrase key %s", err.message);
    if (s) tx_free(s);

    c = cfg("kp", 22);
    c.private_key = slurp("id_ed25519");
    c.password = "termix-pass";
    s = tx_connect(&c, &cbs, &err);
    CHECK(s, "key+password %s", err.message);
    if (s) tx_free(s);

    rounds = 0;
    c = cfg("kbd", 22);
    s = tx_connect(&c, &cbs, &err);
    CHECK(s && rounds == 2, "kbd rounds=%d %s", rounds, err.message);
    if (s) tx_free(s);

    c = cfg("cert", 22);
    c.private_key = slurp("id_cert");
    c.certificate = slurp("id_cert-cert.pub");
    s = tx_connect(&c, &cbs, &err);
    CHECK(s, "cert %s", err.message);
    if (s) tx_free(s);

    /* shell */
    c = cfg("key", 22);
    c.private_key = slurp("id_ed25519");
    s = tx_connect(&c, &cbs, &err);
    CHECK(s, "key session %s", err.message);
    if (!s) return 1;
    tx_shell_callbacks scb = {NULL, on_data, on_exit_cb};
    const char *en[] = {"LANG"}, *ev[] = {"C.UTF-8"};
    tx_shell *sh = tx_shell_open(s, "xterm-256color", 80, 24, en, ev, 1, &scb, &err);
    CHECK(sh, "shell %s", err.message);
    if (sh) {
        tx_shell_write(sh, "stty size\n", 10);
        CHECK(wait_for("24 80", 10), "stty 24 80: %s", shell_buf);
        tx_shell_resize(sh, 120, 40);
        usleep(200000);
        tx_shell_write(sh, "stty size\n", 10);
        CHECK(wait_for("40 120", 10), "stty 40 120");
        tx_shell_write(sh, "exit 0\n", 7);
        for (int i = 0; i < 100 && exited == -1; i++) usleep(50000);
        CHECK(exited == 0, "exit code %d", exited);
        tx_shell_free(sh);
    }

    /* sftp */
    tx_file_entry *ents;
    int count;
    CHECK(tx_sftp_list(s, "/data", &ents, &count, &err) == 0 && count >= 2, "list %s", err.message);
    if (!err.code) tx_free_entries(ents, count);
    uint64_t bytes, ms;
    struct timespec t0;
    clock_gettime(CLOCK_MONOTONIC, &t0);
    CHECK(tx_sftp_download(s, "/data/big.bin", "/tmp/big.bin", NULL, NULL, &bytes, &ms, &err) == 0, "download %s", err.message);
    printf("  download %.1f MB in %llu ms (%.1f MB/s)\n", bytes / 1048576.0, (unsigned long long)ms, bytes / 1048576.0 / (ms / 1000.0));
    CHECK(tx_sftp_upload(s, "/tmp/big.bin", "/home/key/up.bin", NULL, NULL, &bytes, &ms, &err) == 0, "upload %s", err.message);
    printf("  upload %.1f MB in %llu ms (%.1f MB/s)\n", bytes / 1048576.0, (unsigned long long)ms, bytes / 1048576.0 / (ms / 1000.0));
    char *o, *e;
    size_t ol, el;
    int code;
    tx_exec(s, "sha256sum /home/key/up.bin | cut -d' ' -f1; cat /data/big.sha256", &o, &ol, &e, &el, &code, &err);
    char a1[80] = {0}, a2[80] = {0};
    sscanf(o, "%79s %79s", a1, a2);
    CHECK(!strcmp(a1, a2) && a1[0], "sha mismatch %s %s", a1, a2);
    free(o); free(e);
    tx_sftp_remove(s, "/home/key/up.bin", &err);
    unlink("/tmp/big.bin");

    /* forwards */
    tx_forward *f = tx_forward_local(s, "127.0.0.1", 0, "127.0.0.1", 7000, &err);
    CHECK(f, "forward %s", err.message);
    if (f) {
        int fd = socket(AF_INET, SOCK_STREAM, 0);
        struct sockaddr_in ad = {0};
        ad.sin_family = AF_INET;
        ad.sin_port = htons(tx_forward_port(f));
        inet_pton(AF_INET, "127.0.0.1", &ad.sin_addr);
        connect(fd, (struct sockaddr *)&ad, sizeof ad);
        send(fd, "ping\n", 5, 0);
        char buf[8] = {0};
        recv(fd, buf, 5, MSG_WAITALL);
        CHECK(!strcmp(buf, "ping\n"), "echo got [%s]", buf);
        close(fd);
        tx_forward_close(f);
    }
    f = tx_forward_dynamic(s, "127.0.0.1", 0, &err);
    CHECK(f, "socks %s", err.message);
    if (f) {
        int fd = socket(AF_INET, SOCK_STREAM, 0);
        struct sockaddr_in ad = {0};
        ad.sin_family = AF_INET;
        ad.sin_port = htons(tx_forward_port(f));
        inet_pton(AF_INET, "127.0.0.1", &ad.sin_addr);
        connect(fd, (struct sockaddr *)&ad, sizeof ad);
        send(fd, "\x05\x01\x00", 3, 0);
        unsigned char r2[2];
        recv(fd, r2, 2, MSG_WAITALL);
        unsigned char req[] = {5, 1, 0, 3, 9, 'l', 'o', 'c', 'a', 'l', 'h', 'o', 's', 't', 0x1f, 0x90};
        send(fd, req, sizeof req, 0);
        unsigned char rep[10];
        recv(fd, rep, 10, MSG_WAITALL);
        CHECK(rep[1] == 0, "socks reply %d", rep[1]);
        const char *get = "GET /hello.txt HTTP/1.0\r\nHost: localhost\r\n\r\n";
        send(fd, get, strlen(get), 0);
        char body[2048] = {0};
        size_t got = 0;
        ssize_t n;
        while ((n = recv(fd, body + got, sizeof body - 1 - got, 0)) > 0) got += n;
        CHECK(strstr(body, "hello from termix"), "socks body [%s]", body);
        close(fd);
        tx_forward_close(f);
    }
    tx_free(s);

    /* jump */
    c = cfg("key", 22);
    c.host = "jump";
    c.private_key = slurp("id_ed25519");
    tx_session *j = tx_connect(&c, &cbs, &err);
    CHECK(j, "jump %s", err.message);
    if (j) {
        tx_config t = cfg("pw", 22);
        t.password = "termix-pass";
        tx_session *ts = tx_connect_via(j, &t, &cbs, &err);
        CHECK(ts, "via %s", err.message);
        if (ts) {
            tx_exec(ts, "test -f /data/big.bin && echo yes", &o, &ol, &e, &el, &code, &err);
            CHECK(o && !strcmp(o, "yes\n"), "via exec [%s] %s", o ? o : "", err.message);
            free(o); free(e);
            tx_free(ts);
        }
        tx_free(j);
    }

    /* dropped network: needs docker on this box */
    if (getenv("SSH_TEST_DOCKER")) {
        c = cfg("key", 22);
        c.private_key = slurp("id_ed25519");
        c.keepalive_interval_secs = 2;
        c.keepalive_count_max = 2;
        disconnected = 0;
        s = tx_connect(&c, &cbs, &err);
        CHECK(s, "drop session %s", err.message);
        system("docker pause termix-ssh-test-target-1 >/dev/null");
        struct timespec d0;
        clock_gettime(CLOCK_MONOTONIC, &d0);
        while (!disconnected && secs_since(&d0) < 30) usleep(100000);
        printf("  drop detected after %.1fs\n", secs_since(&d0));
        system("docker unpause termix-ssh-test-target-1 >/dev/null");
        CHECK(disconnected && tx_is_closed(s), "no disconnect seen");
        tx_free(s);
    }

    printf(failures ? "%d FAILED\n" : "all ok\n", failures);
    return failures ? 1 : 0;
}
