export type AccountType = 'driver' | 'owner_operator' | 'fleet';

export type UserRole = 
  | 'driver' 
  | 'owner_operator' 
  | 'manager' 
  | 'owner';

export interface User {
  id: string;
  email: string;
  accountType: AccountType;
  role: UserRole;
  fleetId: string; // Every user belongs to a fleet/workspace
  firstName: string;
  lastName: string;
  // ... other fields
}