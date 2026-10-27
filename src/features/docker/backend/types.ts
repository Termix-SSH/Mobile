import type {
  ContainerCounts,
  StackService,
  StackSummary,
} from "@termix-ssh/plugin-sdk/host-scripts";
import type { ExecRunner } from "@/core/exec";
import type {
  DockerContainer,
  DockerContainerAction,
  DockerContainerStats,
  SSHHost,
} from "@/types";

export interface DockerCheck {
  available: boolean;
  version?: string;
  runtime?: "docker" | "podman";
  /** NOT_INSTALLED, DAEMON_NOT_RUNNING, PERMISSION_DENIED or DOCKER_ERROR. */
  code?: string;
  error?: string;
}

export interface StackDetail {
  name: string;
  composeFile: string | null;
  compose: string | null;
  services: StackService[];
  running: number;
  total: number;
}

/** Where the container console runs. */
export type DockerConsoleTarget =
  | {
      kind: "local";
      runner: ExecRunner;
      runtime: "docker" | "podman";
      sudo: boolean;
    }
  | { kind: "relay"; host: SSHHost };

/** Docker on one host, over the phone's SSH or the server's Docker plugin. */
export interface DockerBackend {
  via: "local" | "relay";
  check(): Promise<DockerCheck>;
  containers(signal?: AbortSignal): Promise<DockerContainer[]>;
  action(id: string, action: DockerContainerAction): Promise<void>;
  stats(id: string, signal?: AbortSignal): Promise<DockerContainerStats>;
  logs(id: string, tail: number, signal?: AbortSignal): Promise<string>;
  /** Stacks show only when the host turns them on (and the server admin, over the relay). */
  stacksEnabled(): Promise<boolean>;
  stacks(signal?: AbortSignal): Promise<StackSummary[]>;
  stack(stack: StackSummary): Promise<StackDetail>;
  console(): DockerConsoleTarget;
}

export type { ContainerCounts, StackService, StackSummary };
