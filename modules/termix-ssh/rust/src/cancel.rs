use std::future::Future;

use tokio_util::sync::CancellationToken;

use crate::SshError;

/// Passed into long calls; `cancel()` from any thread stops them with `SshError::Cancelled`.
#[derive(uniffi::Object, Default)]
pub struct CancelToken {
    pub(crate) inner: CancellationToken,
}

#[uniffi::export]
impl CancelToken {
    #[uniffi::constructor]
    pub fn new() -> Self {
        Self::default()
    }

    pub fn cancel(&self) {
        self.inner.cancel();
    }

    pub fn is_cancelled(&self) -> bool {
        self.inner.is_cancelled()
    }
}

/// Runs `f` until it ends or the token fires. Dropping `f` closes whatever it had open.
pub(crate) async fn cancellable<T>(
    token: Option<&CancelToken>,
    f: impl Future<Output = Result<T, SshError>>,
) -> Result<T, SshError> {
    match token {
        None => f.await,
        Some(t) => tokio::select! {
            biased;
            _ = t.inner.cancelled() => Err(SshError::Cancelled),
            r = f => r,
        },
    }
}
