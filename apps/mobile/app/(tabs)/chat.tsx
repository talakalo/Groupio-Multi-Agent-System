import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  View,
  FlatList,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  Keyboard,
  I18nManager,
  Pressable,
} from "react-native";
import { Text, TextInput, useTheme, IconButton, Chip } from "react-native-paper";
import { SafeAreaView } from "react-native-safe-area-context";
import Icon from "react-native-vector-icons/MaterialCommunityIcons";
import type { Message } from "@groupio/types";

import { ChatBubble } from "../../components/ChatBubble";
import { useChat, useProfile } from "../../lib/hooks";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

interface QuickSuggestion {
  key: string;
  label: string;
  message: string;
}

const QUICK_SUGGESTIONS: QuickSuggestion[] = [
  {
    key: "find_ac",
    label: "\u05DE\u05E6\u05D0 \u05D8\u05DB\u05E0\u05D0\u05D9 \u05DE\u05D6\u05D2\u05E0\u05D9\u05DD",
    message: "\u05D0\u05E0\u05D9 \u05DE\u05D7\u05E4\u05E9 \u05D8\u05DB\u05E0\u05D0\u05D9 \u05DE\u05D6\u05D2\u05E0\u05D9\u05DD \u05DC\u05D1\u05E0\u05D9\u05D9\u05DF \u05E9\u05DC\u05D9",
  },
  {
    key: "active_offers",
    label: "\u05D4\u05E6\u05E2\u05D5\u05EA \u05E4\u05E2\u05D9\u05DC\u05D5\u05EA",
    message: "\u05D0\u05D9\u05DC\u05D5 \u05D4\u05E6\u05E2\u05D5\u05EA \u05E7\u05D1\u05D5\u05E6\u05D9\u05D5\u05EA \u05E4\u05E2\u05D9\u05DC\u05D5\u05EA \u05D9\u05E9 \u05DB\u05E8\u05D2\u05E2?",
  },
  {
    key: "price_check",
    label: "\u05D1\u05D3\u05D9\u05E7\u05EA \u05DE\u05D7\u05D9\u05E8\u05D9\u05DD",
    message: "\u05DE\u05D4 \u05D4\u05DE\u05D7\u05D9\u05E8 \u05D4\u05DE\u05DE\u05D5\u05E6\u05E2 \u05DC\u05D4\u05EA\u05E7\u05E0\u05EA \u05DE\u05D6\u05D2\u05DF \u05D1\u05D0\u05D6\u05D5\u05E8 \u05E9\u05DC\u05D9?",
  },
  {
    key: "how_it_works",
    label: "\u05D0\u05D9\u05DA \u05D6\u05D4 \u05E2\u05D5\u05D1\u05D3?",
    message: "\u05D0\u05D9\u05DA \u05E2\u05D5\u05D1\u05D3 \u05DE\u05E2\u05E8\u05DB\u05EA \u05D4\u05D4\u05E6\u05E2\u05D5\u05EA \u05D4\u05E7\u05D1\u05D5\u05E6\u05D9\u05D5\u05EA \u05D1-Groupio?",
  },
];

// ---------------------------------------------------------------------------
// Typing indicator
// ---------------------------------------------------------------------------

function TypingIndicator() {
  const theme = useTheme();

  return (
    <View style={styles.typingRow}>
      <View
        style={[
          styles.typingAvatarWrap,
          { backgroundColor: theme.colors.primaryContainer },
        ]}
      >
        <Icon name="robot" size={16} color={theme.colors.primary} />
      </View>
      <View
        style={[
          styles.typingBubble,
          { backgroundColor: theme.colors.surfaceVariant },
        ]}
      >
        <View style={styles.typingDotsRow}>
          {[0, 1, 2].map((i) => (
            <TypingDot key={i} delay={i * 200} />
          ))}
        </View>
      </View>
    </View>
  );
}

function TypingDot({ delay }: { delay: number }) {
  const theme = useTheme();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const interval = setInterval(() => {
      setVisible((v) => !v);
    }, 500);
    const timeout = setTimeout(() => {
      setVisible(true);
    }, delay);
    return () => {
      clearInterval(interval);
      clearTimeout(timeout);
    };
  }, [delay]);

  return (
    <View
      style={[
        styles.typingDot,
        {
          backgroundColor: theme.colors.onSurfaceVariant,
          opacity: visible ? 1 : 0.3,
        },
      ]}
    />
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function ChatScreen() {
  const theme = useTheme();
  const flatListRef = useRef<FlatList<Message>>(null);
  const [inputText, setInputText] = useState("");
  const [keyboardVisible, setKeyboardVisible] = useState(false);

  // Profile for user ID
  const { data: profile } = useProfile();
  const userId = profile?.id ?? "anonymous";
  const buildingId = profile?.buildingId;

  // Chat hook
  const { messages, isLoading, isStreaming, send, clearMessages } = useChat({
    userId,
    buildingId,
    onError: () => {
      // Error is handled inside the hook with a fallback message
    },
  });

  // Keyboard listeners
  useEffect(() => {
    const showSub = Keyboard.addListener("keyboardDidShow", () =>
      setKeyboardVisible(true),
    );
    const hideSub = Keyboard.addListener("keyboardDidHide", () =>
      setKeyboardVisible(false),
    );
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    if (messages.length > 0) {
      setTimeout(() => {
        flatListRef.current?.scrollToEnd({ animated: true });
      }, 100);
    }
  }, [messages.length, isStreaming]);

  // Handlers
  const handleSend = useCallback(() => {
    const text = inputText.trim();
    if (!text) return;
    setInputText("");
    send(text);
  }, [inputText, send]);

  const handleSuggestion = useCallback(
    (suggestion: QuickSuggestion) => {
      send(suggestion.message);
    },
    [send],
  );

  // Render
  const renderMessage = useCallback(
    ({ item, index }: { item: Message; index: number }) => {
      // Show loading dots on last assistant message if streaming
      const isLastAssistant =
        item.role === "assistant" &&
        index === messages.length - 1 &&
        isStreaming &&
        !item.content;

      return <ChatBubble message={item} isLoading={isLastAssistant} />;
    },
    [messages.length, isStreaming],
  );

  const keyExtractor = useCallback(
    (_item: Message, index: number) => `msg-${index}`,
    [],
  );

  const showSuggestions = messages.length <= 1 && !isLoading;

  return (
    <SafeAreaView
      edges={["bottom"]}
      style={[styles.container, { backgroundColor: theme.colors.background }]}
    >
      <KeyboardAvoidingView
        style={styles.keyboardAvoid}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={Platform.OS === "ios" ? 90 : 0}
      >
        {/* ---- Message List ---- */}
        <FlatList
          ref={flatListRef}
          data={messages}
          renderItem={renderMessage}
          keyExtractor={keyExtractor}
          contentContainerStyle={styles.messageList}
          showsVerticalScrollIndicator={false}
          ListFooterComponent={
            <>
              {/* Typing indicator */}
              {isLoading && !isStreaming && <TypingIndicator />}

              {/* Quick suggestions */}
              {showSuggestions && (
                <View style={styles.suggestionsSection}>
                  <Text
                    variant="labelMedium"
                    style={[
                      styles.suggestionsTitle,
                      { color: theme.colors.onSurfaceVariant },
                    ]}
                  >
                    {"\u05D4\u05E6\u05E2\u05D5\u05EA \u05DE\u05D4\u05D9\u05E8\u05D5\u05EA:"}
                  </Text>
                  <View style={styles.suggestionsGrid}>
                    {QUICK_SUGGESTIONS.map((suggestion) => (
                      <Pressable
                        key={suggestion.key}
                        style={({ pressed }) => [
                          styles.suggestionChip,
                          {
                            backgroundColor: theme.colors.surfaceVariant,
                            borderColor: theme.colors.outlineVariant,
                            opacity: pressed ? 0.7 : 1,
                          },
                        ]}
                        onPress={() => handleSuggestion(suggestion)}
                      >
                        <Text
                          variant="bodySmall"
                          style={[
                            styles.suggestionText,
                            { color: theme.colors.onSurface },
                          ]}
                        >
                          {suggestion.label}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                </View>
              )}
            </>
          }
        />

        {/* ---- Input Area ---- */}
        <View
          style={[
            styles.inputArea,
            {
              backgroundColor: theme.colors.surface,
              borderTopColor: theme.colors.outlineVariant,
            },
          ]}
        >
          {/* Clear chat button */}
          <IconButton
            icon="delete-outline"
            size={22}
            iconColor={theme.colors.onSurfaceVariant}
            onPress={clearMessages}
            style={styles.clearButton}
          />

          <View
            style={[
              styles.inputWrapper,
              {
                backgroundColor: theme.colors.surfaceVariant,
                borderColor: theme.colors.outlineVariant,
              },
            ]}
          >
            <TextInput
              value={inputText}
              onChangeText={setInputText}
              placeholder={"\u05DB\u05EA\u05D1\u05D5 \u05D4\u05D5\u05D3\u05E2\u05D4..."}
              placeholderTextColor={theme.colors.onSurfaceVariant}
              style={[
                styles.textInput,
                { color: theme.colors.onSurface },
              ]}
              mode="flat"
              underlineStyle={{ display: "none" }}
              dense
              multiline
              maxLength={1000}
              returnKeyType="send"
              onSubmitEditing={handleSend}
              editable={!isLoading}
              textAlign={I18nManager.isRTL ? "right" : "left"}
            />
          </View>

          {/* Send button */}
          <Pressable
            style={({ pressed }) => [
              styles.sendButton,
              {
                backgroundColor:
                  inputText.trim() && !isLoading
                    ? theme.colors.primary
                    : theme.colors.surfaceVariant,
                opacity: pressed ? 0.7 : 1,
              },
            ]}
            onPress={handleSend}
            disabled={!inputText.trim() || isLoading}
          >
            <Icon
              name="send"
              size={20}
              color={
                inputText.trim() && !isLoading
                  ? theme.colors.onPrimary
                  : theme.colors.onSurfaceVariant
              }
              style={I18nManager.isRTL ? { transform: [{ scaleX: -1 }] } : undefined}
            />
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  keyboardAvoid: {
    flex: 1,
  },

  // Messages
  messageList: {
    paddingVertical: 12,
    paddingBottom: 8,
  },

  // Typing indicator
  typingRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    marginHorizontal: 12,
    marginVertical: 4,
  },
  typingAvatarWrap: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    marginEnd: 8,
    marginBottom: 2,
  },
  typingBubble: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 18,
    borderBottomStartRadius: 4,
  },
  typingDotsRow: {
    flexDirection: "row",
    gap: 6,
  },
  typingDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },

  // Suggestions
  suggestionsSection: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 8,
  },
  suggestionsTitle: {
    fontWeight: "600",
    marginBottom: 10,
    textAlign: "center",
  },
  suggestionsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    justifyContent: "center",
  },
  suggestionChip: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    borderWidth: 1,
  },
  suggestionText: {
    fontWeight: "600",
    fontSize: 13,
    textAlign: "center",
  },

  // Input area
  inputArea: {
    flexDirection: "row",
    alignItems: "flex-end",
    paddingHorizontal: 8,
    paddingVertical: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: 4,
  },
  clearButton: {
    marginBottom: 2,
  },
  inputWrapper: {
    flex: 1,
    borderRadius: 24,
    borderWidth: 1,
    overflow: "hidden",
    minHeight: 44,
    maxHeight: 120,
    justifyContent: "center",
  },
  textInput: {
    fontSize: 15,
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: "transparent",
    writingDirection: I18nManager.isRTL ? "rtl" : "ltr",
  },
  sendButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 2,
  },
});
