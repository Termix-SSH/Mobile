import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, Modal } from 'react-native';
import { BORDERS, BORDER_COLORS, RADIUS } from '@/app/constants/designTokens';

interface TOTPDialogProps {
  visible: boolean;
  onSubmit: (code: string) => void;
  onCancel: () => void;
  prompt?: string;
  isPasswordPrompt?: boolean;
}

export const TOTPDialog: React.FC<TOTPDialogProps> = ({
  visible,
  onSubmit,
  onCancel,
  prompt = 'Two-Factor Authentication',
  isPasswordPrompt = false,
}) => {
  const [code, setCode] = useState('');

  // Clear code when dialog closes
  useEffect(() => {
    if (!visible) {
      setCode('');
    }
  }, [visible]);

  const handleSubmit = () => {
    if (code.trim()) {
      onSubmit(code);
      setCode('');
    }
  };

  const handleCancel = () => {
    setCode('');
    onCancel();
  };

  return (
    <Modal visible={visible} transparent animationType="fade">
      <View className="flex-1 bg-black/50 items-center justify-center p-4">
        <View
          className="bg-dark-bg-button p-6 w-full max-w-sm"
          style={{
            borderWidth: BORDERS.MAJOR,
            borderColor: BORDER_COLORS.PRIMARY,
            borderRadius: RADIUS.LARGE,
          }}
        >
          <Text className="text-white text-lg font-semibold mb-4">
            {prompt}
          </Text>
          <Text className="text-gray-400 mb-4">
            {isPasswordPrompt
              ? 'Enter your password to continue'
              : 'Enter your TOTP verification code'}
          </Text>
          <TextInput
            className="bg-dark-bg-darker px-4 py-3 text-white mb-4"
            style={{
              borderWidth: BORDERS.STANDARD,
              borderColor: BORDER_COLORS.BUTTON,
              borderRadius: RADIUS.BUTTON,
            }}
            value={code}
            onChangeText={setCode}
            placeholder={isPasswordPrompt ? 'Password' : '000000'}
            placeholderTextColor="#6B7280"
            keyboardType={isPasswordPrompt ? 'default' : 'number-pad'}
            secureTextEntry={isPasswordPrompt}
            maxLength={isPasswordPrompt ? undefined : 6}
            autoFocus
            onSubmitEditing={handleSubmit}
          />
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
              }}
              activeOpacity={0.7}
              disabled={!code.trim()}
            >
              <Text className="text-white text-center font-medium">
                {isPasswordPrompt ? 'Submit' : 'Verify'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
};
