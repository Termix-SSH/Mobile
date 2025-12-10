import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, Modal, ScrollView } from 'react-native';
import { BORDERS, BORDER_COLORS, RADIUS } from '@/app/constants/designTokens';

interface SSHAuthDialogProps {
  visible: boolean;
  onSubmit: (credentials: {
    password?: string;
    sshKey?: string;
    keyPassword?: string;
  }) => void;
  onCancel: () => void;
  hostInfo: {
    name?: string;
    ip: string;
    port: number;
    username: string;
  };
  reason: 'no_keyboard' | 'auth_failed' | 'timeout';
}

export const SSHAuthDialog: React.FC<SSHAuthDialogProps> = ({
  visible,
  onSubmit,
  onCancel,
  hostInfo,
  reason,
}) => {
  const [authMethod, setAuthMethod] = useState<'password' | 'key'>('password');
  const [password, setPassword] = useState('');
  const [sshKey, setSshKey] = useState('');
  const [keyPassword, setKeyPassword] = useState('');

  // Clear inputs when dialog closes
  useEffect(() => {
    if (!visible) {
      setPassword('');
      setSshKey('');
      setKeyPassword('');
      setAuthMethod('password');
    }
  }, [visible]);

  const getReasonMessage = () => {
    switch (reason) {
      case 'no_keyboard':
        return 'Keyboard-interactive authentication is not supported on mobile. Please provide credentials directly.';
      case 'auth_failed':
        return 'Authentication failed. Please re-enter your credentials.';
      case 'timeout':
        return 'Connection timed out. Please try again with your credentials.';
      default:
        return 'Please provide your credentials to connect.';
    }
  };

  const handleSubmit = () => {
    if (authMethod === 'password' && password.trim()) {
      onSubmit({ password });
      setPassword('');
    } else if (authMethod === 'key' && sshKey.trim()) {
      onSubmit({
        sshKey,
        keyPassword: keyPassword.trim() || undefined,
      });
      setSshKey('');
      setKeyPassword('');
    }
  };

  const handleCancel = () => {
    setPassword('');
    setSshKey('');
    setKeyPassword('');
    onCancel();
  };

  const isValid = authMethod === 'password' ? password.trim() : sshKey.trim();

  return (
    <Modal visible={visible} transparent animationType="fade">
      <View className="flex-1 bg-black/50 items-center justify-center p-4">
        <ScrollView
          contentContainerStyle={{
            flexGrow: 1,
            justifyContent: 'center',
            alignItems: 'center',
          }}
          keyboardShouldPersistTaps="handled"
        >
          <View
            className="bg-dark-bg-button p-6 w-full max-w-md"
            style={{
              borderWidth: BORDERS.MAJOR,
              borderColor: BORDER_COLORS.PRIMARY,
              borderRadius: RADIUS.LARGE,
            }}
          >
            <Text className="text-white text-lg font-semibold mb-2">
              SSH Authentication Required
            </Text>

            {/* Host Info */}
            <View className="mb-4 p-3 bg-dark-bg-darker rounded">
              <Text className="text-gray-400 text-sm">
                {hostInfo.name && (
                  <Text className="text-white font-medium">{hostInfo.name}</Text>
                )}
                {hostInfo.name && '\n'}
                <Text className="text-gray-400">
                  {hostInfo.username}@{hostInfo.ip}:{hostInfo.port}
                </Text>
              </Text>
            </View>

            {/* Reason Message */}
            <View className="mb-4 p-3 bg-yellow-900/20 rounded">
              <Text className="text-yellow-200 text-sm">
                {getReasonMessage()}
              </Text>
            </View>

            {/* Auth Method Selector */}
            <View className="flex-row gap-2 mb-4">
              <TouchableOpacity
                onPress={() => setAuthMethod('password')}
                className={`flex-1 py-2 ${
                  authMethod === 'password' ? 'bg-blue-500' : 'bg-dark-bg-darker'
                }`}
                style={{
                  borderWidth: BORDERS.STANDARD,
                  borderColor: authMethod === 'password' ? '#2563EB' : BORDER_COLORS.BUTTON,
                  borderRadius: RADIUS.BUTTON,
                }}
                activeOpacity={0.7}
              >
                <Text className="text-white text-center font-medium">
                  Password
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => setAuthMethod('key')}
                className={`flex-1 py-2 ${
                  authMethod === 'key' ? 'bg-blue-500' : 'bg-dark-bg-darker'
                }`}
                style={{
                  borderWidth: BORDERS.STANDARD,
                  borderColor: authMethod === 'key' ? '#2563EB' : BORDER_COLORS.BUTTON,
                  borderRadius: RADIUS.BUTTON,
                }}
                activeOpacity={0.7}
              >
                <Text className="text-white text-center font-medium">
                  SSH Key
                </Text>
              </TouchableOpacity>
            </View>

            {/* Password Input */}
            {authMethod === 'password' && (
              <View className="mb-4">
                <Text className="text-gray-300 text-sm mb-2">Password</Text>
                <TextInput
                  className="bg-dark-bg-darker px-4 py-3 text-white"
                  style={{
                    borderWidth: BORDERS.STANDARD,
                    borderColor: BORDER_COLORS.BUTTON,
                    borderRadius: RADIUS.BUTTON,
                  }}
                  value={password}
                  onChangeText={setPassword}
                  placeholder="Enter password"
                  placeholderTextColor="#6B7280"
                  secureTextEntry
                  autoFocus
                  onSubmitEditing={handleSubmit}
                />
              </View>
            )}

            {/* SSH Key Inputs */}
            {authMethod === 'key' && (
              <>
                <View className="mb-4">
                  <Text className="text-gray-300 text-sm mb-2">Private SSH Key</Text>
                  <TextInput
                    className="bg-dark-bg-darker px-4 py-3 text-white"
                    style={{
                      borderWidth: BORDERS.STANDARD,
                      borderColor: BORDER_COLORS.BUTTON,
                      borderRadius: RADIUS.BUTTON,
                      minHeight: 100,
                    }}
                    value={sshKey}
                    onChangeText={setSshKey}
                    placeholder="-----BEGIN OPENSSH PRIVATE KEY-----"
                    placeholderTextColor="#6B7280"
                    multiline
                    numberOfLines={4}
                    autoFocus
                  />
                </View>
                <View className="mb-4">
                  <Text className="text-gray-300 text-sm mb-2">
                    Key Password (optional)
                  </Text>
                  <TextInput
                    className="bg-dark-bg-darker px-4 py-3 text-white"
                    style={{
                      borderWidth: BORDERS.STANDARD,
                      borderColor: BORDER_COLORS.BUTTON,
                      borderRadius: RADIUS.BUTTON,
                    }}
                    value={keyPassword}
                    onChangeText={setKeyPassword}
                    placeholder="Key password (if encrypted)"
                    placeholderTextColor="#6B7280"
                    secureTextEntry
                    onSubmitEditing={handleSubmit}
                  />
                </View>
              </>
            )}

            {/* Action Buttons */}
            <View className="flex-row gap-2">
              <TouchableOpacity
                onPress={handleCancel}
                className="flex-1 bg-dark-bg-darker py-3"
                style={{
                  borderWidth: BORDERS.STANDARD,
                  borderColor: BORDER_COLORS.BUTTON,
                  borderRadius: RADIUS.BUTTON,
                }}
                activeOpacity={0.7}
              >
                <Text className="text-white text-center font-medium">
                  Cancel
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleSubmit}
                className="flex-1 bg-blue-500 py-3"
                style={{
                  borderWidth: BORDERS.STANDARD,
                  borderColor: '#2563EB',
                  borderRadius: RADIUS.BUTTON,
                  opacity: isValid ? 1 : 0.5,
                }}
                activeOpacity={0.7}
                disabled={!isValid}
              >
                <Text className="text-white text-center font-medium">
                  Connect
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </ScrollView>
      </View>
    </Modal>
  );
};
