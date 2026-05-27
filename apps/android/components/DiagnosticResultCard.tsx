import React from "react";
import { StyleSheet, Text, View } from "react-native";

interface DiagnosticResultCardProps {
  title: string;
  value: string;
}

export function DiagnosticResultCard({ title, value }: DiagnosticResultCardProps) {
  return (
    <View style={styles.card}>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.value}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    width: "100%",
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#D7E1EA",
  },
  title: {
    fontSize: 14,
    color: "#0B3C5D",
    fontWeight: "700",
    marginBottom: 8,
  },
  value: {
    fontSize: 15,
    color: "#111827",
    lineHeight: 21,
  },
});
