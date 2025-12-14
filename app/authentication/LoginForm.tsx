import {
  View,
  TouchableOpacity,
  Text,
  Alert,
  ActivityIndicator,
  Platform,
} from "react-native";
import { useAppContext } from "../AppContext";
import { useState, useEffect, useRef } from "react";
import {
  setCookie,
  getCurrentServerUrl,
  initializeServerConfig,
} from "../main-axios";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ArrowLeft, RefreshCw } from "lucide-react-native";
import { WebView, WebViewNavigation } from "react-native-webview";
import { WebViewSource } from "react-native-webview/lib/WebViewTypes";
import AsyncStorage from "@react-native-async-storage/async-storage";

export default function LoginForm() {
  const {
    setAuthenticated,
    setShowLoginForm,
    setShowServerManager,
    selectedServer,
  } = useAppContext();
  const insets = useSafeAreaInsets();
  const webViewRef = useRef<WebView>(null);
  const [url, setUrl] = useState("");
  const [canGoBack, setCanGoBack] = useState(false);
  const [loading, setLoading] = useState(true);
  const [source, setSource] = useState<WebViewSource>({ uri: "" });
  const [webViewKey, setWebViewKey] = useState(() => String(Date.now()));
  const [hasNavigated, setHasNavigated] = useState(false);

  useEffect(() => {
    const initializeLogin = async () => {
      const existingToken = await AsyncStorage.getItem("jwt");
      if (existingToken) {
        try {
          const { getUserInfo } = await import("../main-axios");
          const userInfo = await getUserInfo();

          if (userInfo && userInfo.username) {
            if (userInfo.data_unlocked === false) {
            } else {
              setAuthenticated(true);
              setShowLoginForm(false);
              return;
            }
          }
        } catch (error) {}
      }

      setWebViewKey(String(Date.now()));

      const serverUrl = getCurrentServerUrl();
      if (serverUrl) {
        setSource({ uri: serverUrl });
        setUrl(serverUrl);
      } else if (selectedServer?.ip) {
        setSource({ uri: selectedServer.ip });
        setUrl(selectedServer.ip);
      }
    };

    initializeLogin();
  }, [selectedServer]);

  const handleBackToServerConfig = () => {
    setShowLoginForm(false);
    setShowServerManager(true);
  };

  const handleRefresh = () => {
    webViewRef.current?.reload();
  };

  const handleNavigationStateChange = (navState: WebViewNavigation) => {
    setCanGoBack(navState.canGoBack);
    setLoading(navState.loading);
    setHasNavigated(true);
    if (!navState.loading) {
      setUrl(navState.url);
    }
  };

  const handleError = (syntheticEvent: any) => {
    const { nativeEvent } = syntheticEvent;
    console.error("[LoginForm] WebView error:", nativeEvent);

    if (
      nativeEvent.description?.includes("SSL") ||
      nativeEvent.description?.includes("certificate") ||
      nativeEvent.description?.includes("ERR_CERT")
    ) {
      Alert.alert(
        "SSL Certificate Error",
        "Unable to verify the server's SSL certificate. Please ensure:\n\n" +
          "1. Your self-signed certificate's root CA is installed in Android Settings > Security > Encryption & Credentials > Install a certificate\n" +
          "2. The certificate is installed as a 'CA certificate'\n" +
          "3. You've rebuilt the app after installing the certificate\n\n" +
          "Error: " +
          (nativeEvent.description || "Unknown SSL error"),
        [{ text: "OK" }],
      );
    }
  };

  const handleHttpError = (syntheticEvent: any) => {
    const { nativeEvent } = syntheticEvent;
    console.warn(
      "[LoginForm] HTTP error:",
      nativeEvent.statusCode,
      nativeEvent.url,
    );
  };

  const [isAuthenticating, setIsAuthenticating] = useState(false);

  const onMessage = async (event: any) => {
    if (isAuthenticating) {
      return;
    }

    try {
      const data = JSON.parse(event.nativeEvent.data);

      if (data.type === "AUTH_SUCCESS" && data.token) {
        setIsAuthenticating(true);

        try {
          const tokenParts = data.token.split(".");
          if (tokenParts.length === 3) {
            const payload = JSON.parse(atob(tokenParts[1]));
            if (payload.exp) {
              const expirationDate = new Date(payload.exp * 1000);
              const now = new Date();
              const daysUntilExpiration = Math.floor(
                (expirationDate.getTime() - now.getTime()) /
                  (1000 * 60 * 60 * 24),
              );
            }
          }
        } catch (jwtParseError) {
          console.error(
            "[LoginForm] Failed to parse JWT for diagnostics:",
            jwtParseError,
          );
        }

        await setCookie("jwt", data.token);

        const savedToken = await AsyncStorage.getItem("jwt");
        if (!savedToken) {
          setIsAuthenticating(false);
          Alert.alert(
            "Error",
            "Failed to save authentication token. Please try again.",
          );
          return;
        }

        await initializeServerConfig();

        await new Promise((resolve) => setTimeout(resolve, 200));

        setAuthenticated(true);
        setShowLoginForm(false);
      }
    } catch (error) {
      console.error("[LoginForm] Error processing auth token:", error);
      setIsAuthenticating(false);
      Alert.alert("Error", "Failed to process authentication token.");
    }
  };

  const injectedJavaScript = `
    (function() {
      const isOIDCCallback = window.location.href.includes('/oidc/callback') ||
                            window.location.href.includes('?success=') ||
                            window.location.href.includes('?error=');

      if (!isOIDCCallback) {
        try {
          if (typeof localStorage !== 'undefined') {
            localStorage.removeItem('jwt');
          }
          if (typeof sessionStorage !== 'undefined') {
            sessionStorage.removeItem('jwt');
          }

          const cookies = document.cookie.split(";");
          cookies.forEach(function(c) {
            const cookieName = c.split("=")[0].trim();
            if (cookieName === 'jwt') {
              document.cookie = cookieName + "=;expires=Thu, 01 Jan 1970 00:00:00 UTC;path=/;";
              document.cookie = cookieName + "=;expires=Thu, 01 Jan 1970 00:00:00 UTC;path=/;domain=" + window.location.hostname;
            }
          });
        } catch(e) {
          console.error('[LoginForm] Error clearing JWT from WebView:', e);
        }
      }

      const style = document.createElement('style');
      style.textContent = \`
        button:has-text("Install Mobile App"),
        [class*="mobile-app"],
        [class*="install-app"],
        [id*="mobile-app"],
        [id*="install-app"],
        a[href*="app-store"],
        a[href*="play-store"],
        a[href*="google.com/store"],
        a[href*="apple.com/app"],
        button[aria-label*="Install"],
        button[aria-label*="Mobile App"],
        button[aria-label*="Download App"],
        a[aria-label*="Install"],
        a[aria-label*="Mobile App"],
        a[aria-label*="Download App"] {
          display: none !important;
        }
      \`;
      document.head.appendChild(style);

      const hideByText = () => {
        const buttons = document.querySelectorAll('button, a');
        buttons.forEach(btn => {
          const text = btn.textContent?.toLowerCase() || '';
          if (text.includes('install') && text.includes('mobile')) {
            btn.style.display = 'none';
          }
          if (text.includes('download') && text.includes('app')) {
            btn.style.display = 'none';
          }
          if (text.includes('get') && text.includes('app')) {
            btn.style.display = 'none';
          }
        });
      };

      hideByText();
      setTimeout(hideByText, 500);
      setTimeout(hideByText, 1000);
      setTimeout(hideByText, 2000);

      const observer = new MutationObserver(hideByText);
      observer.observe(document.body, { childList: true, subtree: true });

      let hasNotified = false;
      let lastCheckedToken = null;
      let initialCheckComplete = false;

      const notifyAuth = (token, source) => {
        if (hasNotified || !token || token === lastCheckedToken) {
          return;
        }

        if (isOIDCCallback) {
          hasNotified = true;
          lastCheckedToken = token;
        }
        else if (initialCheckComplete) {
          hasNotified = true;
          lastCheckedToken = token;
        } else {
          return;
        }

        if (!hasNotified) return;

        try {
          const message = JSON.stringify({
            type: 'AUTH_SUCCESS',
            token: token,
            source: source,
            timestamp: Date.now()
          });

          if (window.ReactNativeWebView && window.ReactNativeWebView.postMessage) {
            window.ReactNativeWebView.postMessage(message);
          } else {
            console.error('[WebView] ReactNativeWebView.postMessage not available!');
          }
        } catch (e) {
          console.error('[WebView] Error sending message:', e);
        }
      };

      const checkAuth = () => {
        try {
          const localToken = localStorage.getItem('jwt');
          if (localToken && localToken.length > 20) {
            notifyAuth(localToken, 'localStorage');
            return true;
          }

          const sessionToken = sessionStorage.getItem('jwt');
          if (sessionToken && sessionToken.length > 20) {
            notifyAuth(sessionToken, 'sessionStorage');
            return true;
          }

          const cookies = document.cookie;
          if (cookies && cookies.length > 0) {
            const cookieArray = cookies.split('; ');
            const tokenCookie = cookieArray.find(row => row.startsWith('jwt='));

            if (tokenCookie) {
              const token = tokenCookie.split('=')[1];
              if (token && token.length > 20) {
                notifyAuth(token, 'cookie');
                return true;
              }
            }
          }
        } catch (error) {
          console.error('[WebView] Error in checkAuth:', error);
        }
        return false;
      };

      const originalSetItem = localStorage.setItem;
      localStorage.setItem = function(key, value) {
        originalSetItem.apply(this, arguments);
        if (key === 'jwt' && value && value.length > 20 && !hasNotified) {
          checkAuth();
        }
      };

      const originalSessionSetItem = sessionStorage.setItem;
      sessionStorage.setItem = function(key, value) {
        originalSessionSetItem.apply(this, arguments);
        if (key === 'jwt' && value && value.length > 20 && !hasNotified) {
          checkAuth();
        }
      };

      const intervalId = setInterval(() => {
        if (hasNotified) {
          clearInterval(intervalId);
          return;
        }
        if (checkAuth()) {
          clearInterval(intervalId);
        }
      }, 500);

      checkAuth();

      setTimeout(() => {
        initialCheckComplete = true;
      }, 1000);

      window.addEventListener('message', (event) => {
        try {
          if (event.data && typeof event.data === 'object') {
            const data = event.data;
            if (data.type === 'AUTH_SUCCESS' && data.token && data.source === 'explicit') {
              notifyAuth(data.token, 'explicit-message');
            }
          }
        } catch (e) {
          console.error('[WebView] Error processing message event:', e);
        }
      });

      document.addEventListener('visibilitychange', () => {
        if (!document.hidden && !hasNotified) {
          checkAuth();
        }
      });

      setTimeout(() => {
        clearInterval(intervalId);
      }, 120000);
    })();
  `;

  if (!source.uri) {
    return (
      <View className="flex-1 justify-center items-center bg-dark-bg">
        <ActivityIndicator size="large" color="#22C55E" />
        <Text className="text-white mt-4">Loading server configuration...</Text>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-dark-bg" style={{ paddingTop: insets.top }}>
      <View className="flex-row items-center justify-between p-4 bg-dark-bg">
        <TouchableOpacity
          onPress={handleBackToServerConfig}
          className="flex-row items-center"
        >
          <ArrowLeft size={20} color="#ffffff" />
          <Text className="text-white text-lg ml-2">Server</Text>
        </TouchableOpacity>
        <View className="flex-1 mx-4">
          <Text className="text-gray-400 text-center" numberOfLines={1}>
            {url.replace(/^https?:\/\//, "")}
          </Text>
        </View>
        <TouchableOpacity onPress={handleRefresh}>
          <RefreshCw size={20} color="#ffffff" />
        </TouchableOpacity>
      </View>

      <WebView
        key={webViewKey}
        ref={webViewRef}
        source={source}
        userAgent={
          Platform.OS === "android"
            ? "Termix-Mobile/Android"
            : "Termix-Mobile/iOS"
        }
        style={{ flex: 1, backgroundColor: "#18181b" }}
        containerStyle={{ backgroundColor: "#18181b" }}
        onNavigationStateChange={handleNavigationStateChange}
        onMessage={onMessage}
        onError={handleError}
        onHttpError={handleHttpError}
        injectedJavaScript={injectedJavaScript}
        injectedJavaScriptBeforeContentLoaded={`
          document.body.style.backgroundColor = '#18181b';
          document.documentElement.style.backgroundColor = '#18181b';
        `}
        incognito={false}
        cacheEnabled={false}
        cacheMode="LOAD_NO_CACHE"
        javaScriptEnabled={true}
        domStorageEnabled={true}
        startInLoadingState={true}
        sharedCookiesEnabled={false}
        thirdPartyCookiesEnabled={true}
        opaque={false}
        {...(Platform.OS === "android" && {
          mixedContentMode: "always",
          allowFileAccess: false,
        })}
        {...(Platform.OS === "ios" && {
          allowsBackForwardNavigationGestures: false,
        })}
        renderLoading={() => (
          <View
            style={{
              backgroundColor: "#18181b",
              position: "absolute",
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              justifyContent: "center",
              alignItems: "center",
            }}
          >
            <ActivityIndicator size="large" color="#22C55E" />
          </View>
        )}
      />
    </View>
  );
}
