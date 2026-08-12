import { capabilityId, roleId, type CapabilityId, type RoleBundle } from "./contracts";

export const DEMO_CAPABILITIES = {
  appUse: capabilityId("app:use"),
  tasksManage: capabilityId("tasks:manage"),
  usersManage: capabilityId("users:manage"),
} as const;

export const DEMO_ROLES = {
  member: roleId("demo:member"),
  admin: roleId("demo:admin"),
} as const;

export const DEMO_KNOWN_CAPABILITIES: readonly CapabilityId[] = [
  DEMO_CAPABILITIES.appUse,
  DEMO_CAPABILITIES.tasksManage,
  DEMO_CAPABILITIES.usersManage,
];

export const DEMO_ROLE_BUNDLES: readonly RoleBundle[] = [
  {
    roleId: DEMO_ROLES.member,
    capabilities: [DEMO_CAPABILITIES.appUse, DEMO_CAPABILITIES.tasksManage],
  },
  {
    roleId: DEMO_ROLES.admin,
    capabilities: DEMO_KNOWN_CAPABILITIES,
  },
];
