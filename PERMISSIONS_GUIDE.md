# SavvyOS Admin Permissions System — Developer Guide

## Overview

SavvyOS has a page-level permission system for admin users. Each admin user has a row in the `admin_permissions` table that controls which nav links they can see and access.

**Key rules:**
- Tyler (`tyler@savvy.realty`) always has full access — her permissions cannot be modified.
- Only Tyler, Elana (`elana@savvy.realty`), and Dyl (`dyl@savvy.realty`) can manage admin permissions.
- New admin users default to having most pages ON, except the "Projects & Plans" group (Projects, Smart Plans, Email Notifications) which default to OFF.

---

## Adding a New Nav Link (REQUIRED PROCESS)

When adding a new navigation link to the **admin sidebar**, you MUST follow these steps:

### Step 1 — Ask Tyler

Before implementing, ask Tyler:
> "Should all existing admins automatically get access to [new page name]? (Default ON or OFF?)"

### Step 2 — Add the DB column

In `drizzle/schema.ts`, add a new boolean column to the `adminPermissions` table:

```ts
canView<PageName>: boolean("canView<PageName>").default(true /* or false */).notNull(),
```

Run the migration:
```bash
DATABASE_URL="mysql://root:..." ./node_modules/.bin/drizzle-kit push
```

### Step 3 — Add to the permissions router

In `server/routers/permissions.ts`, add to `ADMIN_NAV_PERMISSIONS`:

```ts
{ key: "canView<PageName>", label: "<Display Label>", group: "<Group Name>" },
```

### Step 4 — Add to the path map in AppLayout

In `client/src/components/AppLayout.tsx`, add to `PERM_PATH_MAP`:

```ts
canView<PageName>: "/<route-path>",
```

### Step 5 — Add the nav item to `buildAdminNav`

Add the nav item to the appropriate group in `buildAdminNav()`.

### Step 6 — Done

The permission system will automatically:
- Show the checkbox in the Admin Permissions dialog
- Filter the nav for each admin based on their setting
- Default new admins to the value you set in Step 2

---

## Permission Groups

| Group | Default |
|---|---|
| Overview | ON |
| CRM | ON |
| Transactions | ON |
| Operations | ON |
| Admin | ON |
| Dev Tools | ON |
| Resources | ON |
| Projects & Plans | **OFF** |

---

## Who Can Manage Permissions

Defined in `server/routers/permissions.ts`:

```ts
const PERMISSION_MANAGERS = [
  "tyler@savvy.realty",
  "elana@savvy.realty",
  "dyl@savvy.realty",
];
```

To add more permission managers, update this array.
