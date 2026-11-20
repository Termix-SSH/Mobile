import { WebView as Base } from "react-native-webview";

export type {
  WebViewMessageEvent,
  WebViewNavigation,
} from "react-native-webview";

// The package defaults its props generic to undefined, which types every prop as never.
export const WebView = Base as unknown as typeof Base<object>;
export type WebViewHandle = Base<object>;
