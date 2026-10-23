/* Termix SSH engine on libssh2. One event loop thread per session. */
#ifndef TERMIX_SSH2_H
#define TERMIX_SSH2_H

#include <stddef.h>
#include <stdint.h>

#ifdef __cplusplus
extern "C" {
#endif

enum {
    TX_OK = 0,
    TX_ERR_CONNECT = 1,
    TX_ERR_HOSTKEY_REJECTED = 2,
    TX_ERR_PASSPHRASE_REQUIRED = 3,
    TX_ERR_BAD_PASSPHRASE = 4,
    TX_ERR_INVALID_KEY = 5,
    TX_ERR_AUTH = 6,
    TX_ERR_AUTH_CANCELLED = 7,
    TX_ERR_CHANNEL = 8,
    TX_ERR_SFTP = 9,
    TX_ERR_IO = 10,
    TX_ERR_DISCONNECTED = 11
};

typedef struct tx_session tx_session;
typedef struct tx_shell tx_shell;
typedef struct tx_forward tx_forward;

typedef struct {
    int code;
    char message[512];
} tx_error;

typedef struct {
    const char *host;
    int port;
    const char *username;
    const char *password;
    const char *private_key;
    const char *passphrase;
    const char *certificate;
    int force_keyboard_interactive;
    int allow_legacy_algorithms;
    int connect_timeout_secs;
    int keepalive_interval_secs;
    int keepalive_count_max;
} tx_config;

typedef struct {
    char key_type[96];
    char blob_hex[4096];
    char sha256[64];
    int is_certificate;
    char ca_sha256[64];
    char principals[512]; /* comma separated */
} tx_host_key;

typedef struct {
    char kex[96];
    char host_key[96];
    char cipher[96];
    char mac[96];
} tx_algorithms;

/* Called on the session thread. Blocking is fine, it just pauses that session. */
typedef struct {
    void *ctx;
    int (*verify_host_key)(void *ctx, const tx_host_key *info);
    /* Fill answers[i] with malloc'd strings. Return 0, or -1 to cancel. */
    int (*keyboard_interactive)(void *ctx, const char *name, const char *instructions,
                                int count, const char **prompts, const int *echo,
                                char **answers, int round);
    void (*on_banner)(void *ctx, const char *banner);
    void (*on_disconnect)(void *ctx, const char *reason);
} tx_callbacks;

typedef struct {
    void *ctx;
    void (*on_data)(void *ctx, const char *data, size_t len);
    void (*on_exit)(void *ctx, int has_code, int code);
} tx_shell_callbacks;

typedef void (*tx_progress_fn)(void *ctx, uint64_t done, uint64_t total);

typedef struct {
    char *name;
    uint64_t size;
    int is_dir;
    int is_symlink;
    uint32_t permissions;
    uint32_t mtime;
} tx_file_entry;

tx_session *tx_connect(const tx_config *cfg, const tx_callbacks *cb, tx_error *err);
tx_session *tx_connect_via(tx_session *parent, const tx_config *cfg, const tx_callbacks *cb,
                           tx_error *err);
void tx_host_key_info(tx_session *s, tx_host_key *out);
void tx_algorithms_info(tx_session *s, tx_algorithms *out);
int tx_is_closed(tx_session *s);
void tx_disconnect(tx_session *s);
/* Disconnects if needed, waits for the thread and frees everything. */
void tx_free(tx_session *s);

int tx_exec(tx_session *s, const char *command, char **out, size_t *out_len, char **err_out,
            size_t *err_len, int *exit_code, tx_error *err);

tx_shell *tx_shell_open(tx_session *s, const char *term, int cols, int rows,
                        const char **env_names, const char **env_values, int env_count,
                        const tx_shell_callbacks *cb, tx_error *err);
int tx_shell_write(tx_shell *sh, const char *data, size_t len);
int tx_shell_resize(tx_shell *sh, int cols, int rows);
void tx_shell_close(tx_shell *sh);
void tx_shell_free(tx_shell *sh);

int tx_sftp_list(tx_session *s, const char *path, tx_file_entry **entries, int *count,
                 tx_error *err);
void tx_free_entries(tx_file_entry *entries, int count);
int tx_sftp_size(tx_session *s, const char *path, uint64_t *size, tx_error *err);
int tx_sftp_download(tx_session *s, const char *remote, const char *local, tx_progress_fn fn,
                     void *ctx, uint64_t *bytes, uint64_t *millis, tx_error *err);
int tx_sftp_upload(tx_session *s, const char *local, const char *remote, tx_progress_fn fn,
                   void *ctx, uint64_t *bytes, uint64_t *millis, tx_error *err);
int tx_sftp_remove(tx_session *s, const char *path, tx_error *err);

tx_forward *tx_forward_local(tx_session *s, const char *bind_host, int bind_port,
                             const char *remote_host, int remote_port, tx_error *err);
tx_forward *tx_forward_dynamic(tx_session *s, const char *bind_host, int bind_port,
                               tx_error *err);
int tx_forward_port(tx_forward *f);
void tx_forward_close(tx_forward *f);

const char *tx_version(void);

#ifdef __cplusplus
}
#endif

#endif
