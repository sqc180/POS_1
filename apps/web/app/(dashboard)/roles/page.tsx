"use client"

import { Alert, AlertDescription, AlertTitle, Card, CardContent, CardHeader, CardTitle, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@repo/ui"
import Link from "next/link"
import { Permission, ROLE_PERMISSIONS, type PermissionId } from "@repo/permissions"
import type { UserRole } from "@repo/types"

const roles: UserRole[] = [
  "owner",
  "admin",
  "manager",
  "cashier",
  "billing_staff",
  "inventory_staff",
  "accountant",
  "viewer",
]

const allPerms = Object.values(Permission) as PermissionId[]

export default function RolesPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Roles & permissions</h1>
        <p className="text-sm text-muted-foreground">Read-only matrix from the shared permission registry.</p>
      </div>
      <Alert>
        <AlertTitle>Reference only</AlertTitle>
        <AlertDescription className="space-y-2 text-muted-foreground">
          <p>
            You cannot edit roles on this screen — it shows which permissions each role has in code. To add staff or change someone&apos;s role, use{" "}
            <Link href="/users" className="font-medium text-foreground underline-offset-4 hover:underline">
              Users
            </Link>
            . For a guided tour of settings, open the{" "}
            <Link href="/settings/guide" className="font-medium text-foreground underline-offset-4 hover:underline">
              settings guide
            </Link>
            .
          </p>
        </AlertDescription>
      </Alert>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Role matrix</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Permission</TableHead>
                {roles.map((r) => (
                  <TableHead key={r} className="text-center capitalize">
                    {r.replaceAll("_", " ")}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {allPerms.map((p) => (
                <TableRow key={p}>
                  <TableCell className="font-mono text-xs">{p}</TableCell>
                  {roles.map((r) => (
                    <TableCell key={r} className="text-center text-sm">
                      {ROLE_PERMISSIONS[r].includes(p) ? "✓" : "—"}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}
