import { AccountType, UserRole } from '../types/auth';

interface OnboardingData {
  userId: string;
  name: string;
  type: AccountType;
}

export const setupOwnerOperatorWorkspace = async (data: OnboardingData) => {
  // 1. Create the Fleet/Workspace record
  const fleet = await db.fleets.create({
    name: `${data.name}'s Operations`,
    isPersonalWorkspace: true,
    plan: 'free'
  });

  // 2. Update User record with workspace ID and specific role
  await db.users.update(data.userId, {
    fleetId: fleet.id,
    accountType: 'owner_operator',
    role: 'owner_operator'
  });

  return { fleetId: fleet.id };
};

export const convertToFleetAccount = async (userId: string, fleetId: string) => {
  // Preservation of data: assets, history, and billing remain linked to fleetId
  await db.users.update(userId, {
    accountType: 'fleet',
    role: 'owner' // Elevate to Company Owner
  });

  await db.fleets.update(fleetId, {
    isPersonalWorkspace: false
  });
};