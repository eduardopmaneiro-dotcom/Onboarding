import { apiRoute } from "@/modules/shared/api";

export const GET = apiRoute(null, async (u) => ({
  id: u.id,
  name: u.name,
  email: u.email,
  role: u.role,
  unitId: u.unitId,
  managerId: u.managerId,
  permissions: [...u.permissions].sort(),
}));
