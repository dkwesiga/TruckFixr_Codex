import { User, UserRole } from '../../types/auth';

export const canViewVehicle = (user: User, vehicle: any): boolean => {
  if (user.role === 'owner_operator' || user.role === 'owner' || user.role === 'manager') {
    return vehicle.fleetId === user.fleetId;
  }
  if (user.role === 'driver') {
    return vehicle.assignedDriverId === user.id && vehicle.fleetId === user.fleetId;
  }
  return false;
};

export const canCreateVehicle = (user: User, fleetId: string): boolean => {
  // Owner operators and fleet owners/managers can create assets
  return (user.role === 'owner_operator' || user.role === 'owner' || user.role === 'manager') 
    && user.fleetId === fleetId;
};

export const canInspectVehicle = (user: User, vehicle: any): boolean => {
  return canViewVehicle(user, vehicle);
};

export const canDiagnoseVehicle = (user: User, vehicle: any): boolean => {
  // AI Diagnostics allowed for owners, managers, and owner-operators
  return canViewVehicle(user, vehicle);
};

export const canManageBilling = (user: User, fleetId: string): boolean => {
  return (user.role === 'owner_operator' || user.role === 'owner') 
    && user.fleetId === fleetId;
};

export const canInviteDriver = (user: User, fleetId: string): boolean => {
  // Owner Operators cannot invite drivers by default (must convert to Fleet first)
  return (user.role === 'owner' || user.role === 'manager') && user.fleetId === fleetId;
};

export const canManageVehicleAccess = (user: User, fleetId: string): boolean => {
  return (user.role === 'owner' || user.role === 'manager') && user.fleetId === fleetId;
};

export const canEditVehicle = (user: User, vehicle: any): boolean => {
  return (user.role === 'owner_operator' || user.role === 'owner' || user.role === 'manager') 
    && vehicle.fleetId === user.fleetId;
};