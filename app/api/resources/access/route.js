import { NextResponse } from "next/server";
import { logAccessEvent, requestAuditContext } from "@/lib/audit";
import { createOrUpdateIncidentForDeniedAccess } from "@/lib/incidents";
import { authenticateRequest, evaluateResourceAccess } from "@/lib/zeroTrust";

export const runtime = "nodejs";

export async function POST(request) {
  try {
    const auditContext = requestAuditContext(request);
    const auth = await authenticateRequest(request);
    if (!auth.ok) {
      return NextResponse.json({ message: auth.message }, { status: auth.status });
    }

    const body = await request.json().catch(() => ({}));
    const resourceId =
      typeof body.resourceId === "number"
        ? body.resourceId
        : typeof body.resourceId === "string"
          ? Number(body.resourceId)
          : NaN;

    if (!Number.isFinite(resourceId) || resourceId < 1) {
      return NextResponse.json({ message: "resourceId is required" }, { status: 400 });
    }

    const decision = await evaluateResourceAccess(auth, resourceId);
    if (decision.status === 404) {
      return NextResponse.json({ message: decision.reason }, { status: 404 });
    }

    const eventId = await logAccessEvent({
      ...auditContext,
      category: "resource",
      eventType: "resource_access",
      decision: decision.allowed ? "allow" : "deny",
      severity: decision.allowed
        ? "low"
        : decision.resource?.sensitivity === "critical"
          ? "critical"
          : decision.resource?.sensitivity === "high"
            ? "high"
            : "medium",
      userId: decision.userId,
      sessionId: decision.sessionId,
      deviceId: decision.deviceId,
      resourceId: decision.resource?.id ?? null,
      message: decision.reason,
      metadata: {
        roles: decision.roles,
        segment: decision.resource?.segment,
        policyId: decision.policy?.id,
      },
    });

    if (!decision.allowed) {
      await createOrUpdateIncidentForDeniedAccess({
        decision,
        eventId,
        ...auditContext,
      });
    }

    return NextResponse.json(
      {
        allowed: decision.allowed,
        reason: decision.reason,
        resource: decision.resource,
      },
      { status: decision.allowed ? 200 : 403 }
    );
  } catch (error) {
    console.error("resources/access:", error);
    return NextResponse.json({ message: "Server error" }, { status: 500 });
  }
}
