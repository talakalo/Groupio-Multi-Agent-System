import type { Message } from "@groupio/types";
import React, { useEffect, useMemo } from "react";
import { StyleSheet, View, Animated, Easing } from "react-native";
import { Text, useTheme } from "react-native-paper";
import Icon from "react-native-vector-icons/MaterialCommunityIcons";

interface ChatBubbleProps {
  message: Message;
  isLoading?: boolean;
}

function LoadingDots() {
  // Use useMemo to create stable Animated.Value instances
  const dots = useMemo(() => ({
    dot1: new Animated.Value(0),
    dot2: new Animated.Value(0),
    dot3: new Animated.Value(0),
  }), []);

  useEffect(() => {
    const createAnimation = (dot: Animated.Value, delay: number) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(dot, {
            toValue: 1,
            duration: 300,
            easing: Easing.ease,
            useNativeDriver: true,
          }),
          Animated.timing(dot, {
            toValue: 0,
            duration: 300,
            easing: Easing.ease,
            useNativeDriver: true,
          }),
          Animated.delay(600 - delay),
        ]),
      );

    const animation = Animated.parallel([
      createAnimation(dots.dot1, 0),
      createAnimation(dots.dot2, 200),
      createAnimation(dots.dot3, 400),
    ]);

    animation.start();

    return () => {
      animation.stop();
    };
  }, [dots]);

  const dotStyle = (animValue: Animated.Value) => ({
    opacity: animValue.interpolate({
      inputRange: [0, 1],
      outputRange: [0.3, 1],
    }),
    transform: [
      {
        translateY: animValue.interpolate({
          inputRange: [0, 1],
          outputRange: [0, -4],
        }),
      },
    ],
  });

  return (
    <View style={styles.loadingDotsContainer}>
      <Animated.View style={[styles.loadingDot, dotStyle(dots.dot1)]} />
      <Animated.View style={[styles.loadingDot, dotStyle(dots.dot2)]} />
      <Animated.View style={[styles.loadingDot, dotStyle(dots.dot3)]} />
    </View>
  );
}

function formatTime(date: Date): string {
  const d = date instanceof Date ? date : new Date(date);
  const hours = d.getHours().toString().padStart(2, "0");
  const minutes = d.getMinutes().toString().padStart(2, "0");
  return `${hours}:${minutes}`;
}

export function ChatBubble({ message, isLoading = false }: ChatBubbleProps) {
  const theme = useTheme();
  const isUser = message.role === "user";
  const isSystem = message.role === "system";

  if (isSystem) {
    return (
      <View style={styles.systemContainer}>
        <Text
          variant="bodySmall"
          style={[styles.systemText, { color: theme.colors.onSurfaceVariant }]}
        >
          {message.content}
        </Text>
      </View>
    );
  }

  const bubbleBackgroundColor = isUser
    ? theme.colors.primary
    : theme.colors.surfaceVariant;

  const textColor = isUser
    ? theme.colors.onPrimary
    : theme.colors.onSurface;

  const timestampColor = isUser
    ? "rgba(255, 255, 255, 0.7)"
    : theme.colors.onSurfaceVariant;

  return (
    <View
      style={[
        styles.bubbleRow,
        isUser ? styles.bubbleRowUser : styles.bubbleRowAssistant,
      ]}
    >
      {/* Avatar for assistant */}
      {!isUser && (
        <View
          style={[
            styles.avatarContainer,
            { backgroundColor: theme.colors.primaryContainer },
          ]}
        >
          <Icon name="robot" size={18} color={theme.colors.primary} />
        </View>
      )}

      <View
        style={[
          styles.bubble,
          isUser ? styles.bubbleUser : styles.bubbleAssistant,
          { backgroundColor: bubbleBackgroundColor },
        ]}
      >
        {isLoading ? (
          <LoadingDots />
        ) : (
          <>
            <Text style={[styles.messageText, { color: textColor }]}>
              {message.content}
            </Text>
            <Text style={[styles.timestamp, { color: timestampColor }]}>
              {formatTime(message.timestamp)}
            </Text>
          </>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bubbleRow: {
    flexDirection: "row",
    marginVertical: 4,
    marginHorizontal: 12,
    alignItems: "flex-end",
  },
  bubbleRowUser: {
    justifyContent: "flex-end",
  },
  bubbleRowAssistant: {
    justifyContent: "flex-start",
  },
  avatarContainer: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    marginEnd: 8,
    marginBottom: 2,
  },
  bubble: {
    maxWidth: "78%",
    paddingHorizontal: 14,
    paddingVertical: 10,
    elevation: 1,
  },
  bubbleUser: {
    borderRadius: 18,
    borderBottomEndRadius: 4,
  },
  bubbleAssistant: {
    borderRadius: 18,
    borderBottomStartRadius: 4,
  },
  messageText: {
    fontSize: 15,
    lineHeight: 21,
    writingDirection: "rtl",
    textAlign: "right",
  },
  timestamp: {
    fontSize: 11,
    marginTop: 4,
    textAlign: "left",
  },
  systemContainer: {
    alignItems: "center",
    marginVertical: 8,
    paddingHorizontal: 24,
  },
  systemText: {
    fontSize: 12,
    fontStyle: "italic",
    textAlign: "center",
  },
  loadingDotsContainer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 4,
    paddingHorizontal: 8,
    gap: 6,
  },
  loadingDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#757575",
  },
});

export default ChatBubble;
