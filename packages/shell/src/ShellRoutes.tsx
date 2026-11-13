import { useMenus, useSession } from "@novi/engine";
import { Skeleton } from "@novi/ui";
import { lazy, Suspense } from "react";
import { Navigate, Route, Routes, useLocation, useParams } from "react-router-dom";

import { AppLauncher } from "./AppLauncher";
import { AppShell } from "./AppShell";
import { LoginPage } from "./LoginPage";
import { menuUrl } from "./urls";

const SignupPage = lazy(() => import("./SignupPage").then((m) => ({ default: m.SignupPage })));
const ResetPasswordPage = lazy(() =>
  import("./ResetPasswordPage").then((m) => ({ default: m.ResetPasswordPage })),
);
const SignupStatusPage = lazy(() =>
  import("./SignupStatusPage").then((m) => ({ default: m.SignupStatusPage })),
);
const ActionPage = lazy(() => import("./ActionPage").then((m) => ({ default: m.ActionPage })));
const RecordPage = lazy(() => import("./RecordPage").then((m) => ({ default: m.RecordPage })));

/**
 * URL scheme (deep-linkable, survives reload):
 *   /                          app launcher
 *   /apps/:appId               opens the app's first action
 *   /action/:actionId?menu=ID  an action, with the menu that opened it (sidebar + breadcrumbs)
 *   /record/:model/:id         one record (from search; native form view in P2)
 *   /signup, /signup/status/:id   self-service sign-up and provisioning progress (public)
 *   /reset-password[?token=…]     password reset by email (public)
 */
export function ShellRoutes({ productName }: { productName?: string }) {
  const { status } = useSession();
  const { pathname } = useLocation();
  // public platform pages: sign-up works without a session
  if (pathname.startsWith("/signup") || pathname === "/reset-password") {
    return (
      <Suspense fallback={<Skeleton className="m-6 h-8 w-48" />}>
        <Routes>
          <Route path="/signup" element={<SignupPage productName={productName} />} />
          <Route path="/signup/status/:id" element={<SignupStatusPage />} />
          <Route path="/reset-password" element={<ResetPasswordPage productName={productName} />} />
        </Routes>
      </Suspense>
    );
  }
  if (status === "loading") return <Skeleton className="m-6 h-8 w-48" />;
  if (status === "anonymous") return <LoginPage productName={productName} />;
  return (
    <AppShell productName={productName}>
      <Routes>
        <Route path="/" element={<AppLauncher />} />
        <Route path="/apps/:appId" element={<OpenApp />} />
        <Route
          path="/action/:actionId"
          element={
            <Suspense fallback={<Skeleton className="m-6 h-8 w-48" />}>
              <ActionPage />
            </Suspense>
          }
        />
        <Route
          path="/record/:model/:id"
          element={
            <Suspense fallback={<Skeleton className="m-6 h-8 w-48" />}>
              <RecordPage />
            </Suspense>
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AppShell>
  );
}

function OpenApp() {
  const appId = Number(useParams().appId);
  const menus = useMenus();
  if (!menus.data) return <Skeleton className="m-6 h-8 w-48" />;
  const app = menus.data.byId.get(appId);
  return <Navigate to={(app && menuUrl(app)) || "/"} replace />;
}
