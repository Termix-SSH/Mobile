import { requireOptionalNativeModule } from "expo-modules-core";

// Spike only: lets CI build the app with the russh engine linked in and measure it.
type SpikeModule = {
  version(): string;
  probe(
    host: string,
    port: number,
    user: string,
    password: string,
  ): Promise<string>;
};

export default requireOptionalNativeModule<SpikeModule>("TermixSshRussh");
