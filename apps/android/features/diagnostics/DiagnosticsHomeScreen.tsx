import React, { useMemo, useState } from "react";
import {
  ActivityIndicator,
  Button,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import {
  DiagnosticIssueInput,
  DiagnosticResult,
  DiagnosticUIState,
  VehicleOption,
} from "../../../../packages/types/diagnostics";
import { DiagnosticsResultCards } from "../../components/DiagnosticsResultCards";

interface DiagnosticsHomeScreenProps {
  availableVehicles: VehicleOption[];
  selectedVehicleId?: string;
  uiState: DiagnosticUIState;
  clarifyingQuestion?: string;
  result?: DiagnosticResult;
  onAddVehicle: () => void;
  onSelectVehicle: (vehicleId: string) => void;
  onStartDiagnostics: (issueInput: DiagnosticIssueInput) => Promise<void>;
  onSubmitClarification: (answer: string) => Promise<void>;
}

export function DiagnosticsHomeScreen({
  availableVehicles,
  selectedVehicleId,
  uiState,
  clarifyingQuestion,
  result,
  onAddVehicle,
  onSelectVehicle,
  onStartDiagnostics,
  onSubmitClarification,
}: DiagnosticsHomeScreenProps) {
  const [description, setDescription] = useState("");
  const [photoUri, setPhotoUri] = useState("");
  const [audioUri, setAudioUri] = useState("");
  const [faultCodesText, setFaultCodesText] = useState("");
  const [clarificationAnswer, setClarificationAnswer] = useState("");

  const hasVehicle = Boolean(selectedVehicleId);
  const selectedVehicle = useMemo(
    () => availableVehicles.find((vehicle) => vehicle.id === selectedVehicleId),
    [availableVehicles, selectedVehicleId],
  );

  const canSubmitIssue = hasVehicle && description.trim().length > 0 && uiState === "idle";

  const handleSubmitIssue = async () => {
    const faultCodes = faultCodesText
      .split(",")
      .map((code) => code.trim().toUpperCase())
      .filter(Boolean);

    await onStartDiagnostics({
      description: description.trim(),
      photoUri: photoUri.trim() || undefined,
      audioUri: audioUri.trim() || undefined,
      audioPlaceholderEnabled: true,
      faultCodes: faultCodes.length ? faultCodes : undefined,
    });
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.header}>Diagnostics</Text>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Vehicle</Text>
        <TouchableOpacity style={styles.addVehicleButton} onPress={onAddVehicle}>
          <Text style={styles.addVehicleText}>+ Add New Vehicle</Text>
        </TouchableOpacity>

        {availableVehicles.map((vehicle) => (
          <TouchableOpacity
            key={vehicle.id}
            style={[styles.vehicleRow, selectedVehicleId === vehicle.id && styles.vehicleRowSelected]}
            onPress={() => onSelectVehicle(vehicle.id)}
          >
            <Text style={styles.vehicleText}>{vehicle.label}</Text>
          </TouchableOpacity>
        ))}

        {!hasVehicle && (
          <Text style={styles.warningText}>Select a vehicle before running diagnostics.</Text>
        )}
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Issue Input</Text>
        <TextInput
          value={description}
          style={styles.input}
          multiline
          placeholder="Describe the issue"
          onChangeText={setDescription}
        />
        <TextInput
          value={photoUri}
          style={styles.input}
          placeholder="Optional photo URI"
          onChangeText={setPhotoUri}
        />
        <TextInput
          value={audioUri}
          style={styles.input}
          placeholder="Optional audio URI (placeholder)"
          onChangeText={setAudioUri}
        />
        <TextInput
          value={faultCodesText}
          style={styles.input}
          placeholder="Optional fault codes (comma-separated)"
          onChangeText={setFaultCodesText}
        />
        <Button title="Start Diagnostics" onPress={handleSubmitIssue} disabled={!canSubmitIssue} />
      </View>

      {uiState === "analyzing" && (
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Analyzing</Text>
          <ActivityIndicator color="#F37021" />
        </View>
      )}

      {uiState === "clarifying_question" && (
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Clarifying Question</Text>
          <Text style={styles.bodyText}>{clarifyingQuestion}</Text>
          <TextInput
            value={clarificationAnswer}
            style={styles.input}
            placeholder="Enter your answer"
            onChangeText={setClarificationAnswer}
          />
          <Button
            title="Submit Answer"
            onPress={() => onSubmitClarification(clarificationAnswer)}
            disabled={!clarificationAnswer.trim().length}
          />
        </View>
      )}

      {uiState === "processing_answer" && (
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Processing Answer</Text>
          <ActivityIndicator color="#F37021" />
        </View>
      )}

      {uiState === "final_result" && result && (
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Diagnostic Result</Text>
          <Text style={styles.bodyText}>Vehicle: {selectedVehicle?.label}</Text>
          <DiagnosticsResultCards result={result} />
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 16,
    backgroundColor: "#F3F8FC",
    paddingBottom: 28,
  },
  header: {
    fontSize: 26,
    fontWeight: "700",
    color: "#0B3C5D",
    marginBottom: 12,
  },
  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    padding: 14,
    marginBottom: 14,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#0B3C5D",
    marginBottom: 10,
  },
  vehicleRow: {
    borderWidth: 1,
    borderColor: "#D7E1EA",
    borderRadius: 10,
    padding: 10,
    marginBottom: 8,
  },
  vehicleRowSelected: {
    borderColor: "#F37021",
    backgroundColor: "#FFF7F2",
  },
  vehicleText: {
    fontSize: 14,
    color: "#0F172A",
  },
  addVehicleButton: {
    paddingVertical: 8,
  },
  addVehicleText: {
    color: "#F37021",
    fontWeight: "700",
  },
  warningText: {
    color: "#B91C1C",
    fontSize: 13,
    marginTop: 4,
  },
  input: {
    borderWidth: 1,
    borderColor: "#D7E1EA",
    borderRadius: 8,
    padding: 10,
    marginBottom: 10,
    minHeight: 40,
    textAlignVertical: "top",
  },
  bodyText: {
    color: "#1F2937",
    marginBottom: 10,
  },
});
