#import "TermixTSBridge.h"
#import "termix_ts.h"

static NSString *TermixTSLastErrorString(void) {
  char *msg = TermixTS_LastError();
  if (!msg) {
    return @"unknown error";
  }
  NSString *text = [NSString stringWithUTF8String:msg];
  TermixTS_FreeString(msg);
  if (text.length == 0) {
    return @"unknown error";
  }
  return text;
}

@implementation TermixTSBridge

+ (BOOL)isAvailable {
  return TermixTS_IsAvailable() == 1;
}

+ (NSString *)configureWithAuthKey:(NSString *)authKey
                          hostname:(NSString *)hostname
                          stateDir:(NSString *)stateDir
                         ephemeral:(BOOL)ephemeral {
  int rc = TermixTS_Configure(authKey.UTF8String ?: "",
                              hostname.UTF8String ?: "termix-mobile",
                              stateDir.UTF8String ?: "",
                              ephemeral ? 1 : 0);
  if (rc != 0) {
    return TermixTSLastErrorString();
  }
  return nil;
}

+ (NSString *)up {
  int rc = TermixTS_Up();
  if (rc != 0) {
    return TermixTSLastErrorString();
  }
  return nil;
}

+ (NSDictionary *)startForwardWithProtocol:(NSString *)protocol
                                      host:(NSString *)remoteHost
                                      port:(int)remotePort {
  int localPort = 0;
  int rc = TermixTS_StartForward(protocol.UTF8String ?: "http:",
                                 remoteHost.UTF8String ?: "", remotePort,
                                 &localPort);
  if (rc != 0) {
    return @{@"error" : TermixTSLastErrorString()};
  }
  return @{@"localPort" : @(localPort)};
}

+ (NSString *)stopForwardWithProtocol:(NSString *)protocol
                                 host:(NSString *)remoteHost
                                 port:(int)remotePort
                            localPort:(int)localPort {
  int rc = TermixTS_StopForward(protocol.UTF8String ?: "http:",
                                remoteHost.UTF8String ?: "", remotePort,
                                localPort);
  if (rc != 0) {
    return TermixTSLastErrorString();
  }
  return nil;
}

+ (void)stopAllForwards {
  TermixTS_StopAllForwards();
}

+ (BOOL)isForwardActiveWithProtocol:(NSString *)protocol
                               host:(NSString *)remoteHost
                               port:(int)remotePort
                          localPort:(int)localPort {
  return TermixTS_IsForwardActive(protocol.UTF8String ?: "http:",
                                  remoteHost.UTF8String ?: "", remotePort,
                                  localPort) == 1;
}

+ (BOOL)isUp {
  return TermixTS_IsUp() == 1;
}

+ (NSString *)ips {
  char *raw = TermixTS_GetIPs();
  NSString *s = raw ? [NSString stringWithUTF8String:raw] : @"";
  if (raw) {
    TermixTS_FreeString(raw);
  }
  return s ?: @"";
}

+ (NSString * _Nullable)close {
  int rc = TermixTS_Close();
  if (rc != 0) {
    return TermixTSLastErrorString();
  }
  return nil;
}

+ (NSString *)defaultStateDir {
  NSArray<NSString *> *paths = NSSearchPathForDirectoriesInDomains(
      NSApplicationSupportDirectory, NSUserDomainMask, YES);
  NSString *base = paths.firstObject ?: NSTemporaryDirectory();
  NSString *dir = [base stringByAppendingPathComponent:@"TermixTailscale"];
  [[NSFileManager defaultManager] createDirectoryAtPath:dir
                            withIntermediateDirectories:YES
                                             attributes:nil
                                                  error:nil];
  return dir;
}

@end
