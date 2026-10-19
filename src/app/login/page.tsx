import LoginForm from "@/components/login-form";
import { apsV3Enabled } from "@/lib/aps-policy";
import { runtimeMode } from "@/lib/runtime-mode";

export const dynamic = "force-dynamic";

export default function LoginPage() {
  // Public presentation only: authorization remains in the existing auth flow.
  const mode = runtimeMode();
  const modern = mode !== "unconfigured" && apsV3Enabled({
    demo: mode === "demo",
    environment: process.env.SGC_ENVIRONMENT,
    vercelEnvironment: process.env.VERCEL_ENV,
    organizationId: process.env.SGC_STAGING_ORGANIZATION_ID ?? "",
    enabled: true,
    override: process.env.SGC_UX_APS_V3,
  });
  return <LoginForm modern={modern} />;
}
