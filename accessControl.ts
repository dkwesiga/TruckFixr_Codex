import { User, Vehicle } from '../types';

/**
 * Only Fleet Managers/Admins and Company Owners can manage vehicle access.
 */
export const canManageVehicleAccess = (user: User, fleetId: string): boolean => {
  const allowedRoles = new Set([
    'FLEET_MANAGER',
    'ADMIN',
    'OWNER',
    'manager',
    'owner',
    'admin',
  ]);
  const normalizedUserRole = String(user.role ?? '').trim();
  const userFleetId = String(user.fleetId ?? '').trim();
  const targetFleetId = String(fleetId ?? '').trim();

  return userFleetId.length > 0 && userFleetId === targetFleetId && allowedRoles.has(normalizedUserRole);
};

/**
 * Manager can only assign assets and drivers within their own fleet.
 * Asset must be active and not archived.
 */
export const canAssignAssetToDriver = (user: User, asset: Vehicle, driverFleetId: string): boolean => {
  const assetFleetId = String(asset.fleetId ?? '').trim();
  const targetDriverFleetId = String(driverFleetId ?? '').trim();
  const assetStatus = String(asset.status ?? '').trim().toLowerCase();
  const isArchived = Boolean((asset as any).archived);

  if (!canManageVehicleAccess(user, assetFleetId)) return false;
  if (assetFleetId.length === 0 || targetDriverFleetId.length === 0) return false;
  if (assetFleetId !== targetDriverFleetId) return false;
  if (assetStatus === 'retired' || isArchived) return false;
  return true;
};

/**
 * Checks if a driver has an active, non-expired, non-revoked assignment for an asset.
 */
export const hasActiveAssetAssignment = async (driverUserId: string, vehicleId: string): Promise<boolean> => {
  // Note: This logic should ideally be a DB query. 
  // Mock implementation of the rule:
  // status = active AND revoked_at IS NULL AND (access_type = permanent OR expires_at > now())
  const assignment = await getActiveAssignmentForAsset(vehicleId); 
  return !!assignment && assignment.driver_user_id === driverUserId;
};

export const canInspectVehicle = async (user: User, vehicleId: string): Promise<boolean> => {
  if (user.role === 'DRIVER') {
    return await hasActiveAssetAssignment(user.id, vehicleId);
  }
  // Managers/Owners can inspect any vehicle in their fleet
  return user.fleetId === (await getVehicleFleetId(vehicleId));
};

export const canDiagnoseVehicle = async (user: User, vehicleId: string): Promise<boolean> => {
  return canInspectVehicle(user, vehicleId);
};

/**
 * Placeholder for DB interaction to find the current active primary assignment.
 */
async function getActiveAssignmentForAsset(vehicleId: string): Promise<any> {
  // Logic to find active primary driver assignment based on rules:
  // status = active, revoked_at IS NULL, not expired
  return null; 
}

/**
 * Placeholder for DB interaction to get vehicle fleet ID.
 */
async function getVehicleFleetId(vehicleId: string): Promise<string> {
  return 'fleet_id';
}