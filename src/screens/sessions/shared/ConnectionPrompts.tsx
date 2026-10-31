import type { ConnectionStatus, HostConnection } from "@/core/transport";
import {
  HostKeyVerificationDialog,
  PassphraseDialog,
  SSHAuthDialog,
  TOTPDialog,
  WarpgateDialog,
} from "@/screens/dialogs";
import { TailscaleCheckDialog } from "@/screens/dialogs/TailscaleCheckDialog";

/** The dialog for whatever the connection is waiting on. */
export function ConnectionPrompts({
  conn,
  state,
  hostInfo,
  visible = true,
}: {
  conn: HostConnection;
  state: ConnectionStatus;
  hostInfo: { name?: string; ip: string; port: number; username: string };
  /** A hidden tab keeps its prompt until it is shown. */
  visible?: boolean;
}) {
  const prompt = visible && state.status === "prompt" ? state.prompt : null;
  const cancel = () => conn.cancel();

  return (
    <>
      <TOTPDialog
        visible={prompt?.kind === "totp"}
        onSubmit={(code) => conn.answerTotp(code)}
        onCancel={cancel}
        prompt={prompt?.kind === "totp" ? prompt.prompt : ""}
        isPasswordPrompt={prompt?.kind === "totp" && prompt.isPassword}
      />
      <SSHAuthDialog
        visible={prompt?.kind === "auth"}
        onSubmit={(credentials) => conn.answerAuth(credentials)}
        onCancel={cancel}
        hostInfo={hostInfo}
        reason={prompt?.kind === "auth" ? prompt.reason : "auth_failed"}
      />
      <HostKeyVerificationDialog
        visible={prompt?.kind === "hostKey"}
        scenario={prompt?.kind === "hostKey" ? prompt.scenario : "new"}
        data={prompt?.kind === "hostKey" ? prompt.data : null}
        onAccept={() => conn.answerHostKey(true)}
        onReject={() => conn.answerHostKey(false)}
      />
      <PassphraseDialog
        visible={prompt?.kind === "passphrase"}
        onSubmit={(passphrase) => conn.answerPassphrase(passphrase)}
        onCancel={cancel}
        hostInfo={hostInfo}
      />
      <WarpgateDialog
        visible={prompt?.kind === "warpgate"}
        url={prompt?.kind === "warpgate" ? prompt.url : ""}
        securityKey={prompt?.kind === "warpgate" ? prompt.securityKey : ""}
        onContinue={() => conn.continueBrowserSignIn()}
        onCancel={cancel}
      />
      <TailscaleCheckDialog
        visible={prompt?.kind === "browserCheck"}
        url={prompt?.kind === "browserCheck" ? prompt.url : ""}
        message={prompt?.kind === "browserCheck" ? prompt.message : ""}
        title={prompt?.kind === "browserCheck" ? prompt.title : undefined}
        onCancel={cancel}
      />
    </>
  );
}
