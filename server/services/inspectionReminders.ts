export type MissedInspectionReminderCandidate = {
  vehicleId: string;
  unit: string;
  assignedDriverId: number | null;
  assignedDriverName: string | null;
  inspectedToday: boolean;
  mostRecentInspectionAt: Date | null;
};

export type MissedInspectionReminderAlert = {
  fleetId: number;
  userId: number | null;
  vehicleId: string;
  alertType: "daily_inspection_missed";
  severity: "warning";
  title: string;
  message: string;
  status: "open";
};

function formatLastInspection(date: Date | null) {
  if (!date) return "No previous inspection is on file.";
  return `Last inspection on file: ${date.toISOString().slice(0, 10)}.`;
}

export function buildMissedInspectionReminderAlerts(input: {
  fleetId: number;
  managerUserId: number;
  vehicles: MissedInspectionReminderCandidate[];
}): MissedInspectionReminderAlert[] {
  const alerts: MissedInspectionReminderAlert[] = [];

  for (const vehicle of input.vehicles) {
    if (vehicle.inspectedToday) continue;

    const driverName = vehicle.assignedDriverName?.trim() || "the assigned driver";
    const baseMessage = `${vehicle.unit} has not had a daily inspection submitted today. ${formatLastInspection(vehicle.mostRecentInspectionAt)}`;

    alerts.push({
      fleetId: input.fleetId,
      userId: input.managerUserId,
      vehicleId: vehicle.vehicleId,
      alertType: "daily_inspection_missed",
      severity: "warning",
      title: `Daily inspection missing for ${vehicle.unit}`,
      message: `${baseMessage} Follow up with ${driverName} before dispatch.`,
      status: "open",
    });

    if (vehicle.assignedDriverId != null) {
      alerts.push({
        fleetId: input.fleetId,
        userId: vehicle.assignedDriverId,
        vehicleId: vehicle.vehicleId,
        alertType: "daily_inspection_missed",
        severity: "warning",
        title: `Daily inspection due for ${vehicle.unit}`,
        message: `${baseMessage} Complete the daily inspection before operating the vehicle.`,
        status: "open",
      });
    }
  }

  return alerts;
}
