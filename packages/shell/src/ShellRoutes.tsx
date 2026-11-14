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
const StackPage = lazy(() => import("./StackPage").then((m) => ({ default: m.StackPage })));
const FormPage = lazy(() => import("./FormPage").then((m) => ({ default: m.FormPage })));

/**
 * URL scheme (deep-linkable, survives reload):
 *   /                          app launcher
 *   /apps/:appId               opens the app's first action
 *   /action/:actionId?menu=ID  an action, with the menu that opened it (sidebar + breadcrumbs)
 *   /action/12/42[/action/30…] an action stack: action 12's record 42, then what it opened (P2.10.12)
 *   /action/12/new             a new record in action 12's form
 *   /record/:model/:id         one record without an action (search), in the model's default form
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
          path="/action/*"
          element={
            <Suspense fallback={<Skeleton className="m-6 h-8 w-48" />}>
              <StackPage />
            </Suspense>
          }
        />
        <Route
          path="/record/:model/:id"
          element={
            <Suspense fallback={<Skeleton className="m-6 h-8 w-48" />}>
              <RecordRoute />
            </Suspense>
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AppShell>
  );
}

function RecordRoute() {
  const { model, id } = useParams();
  return (
    <FormPage
      key={`${model}/${id}`}
      model={model}
      resId={id === "new" ? "new" : Number(id)}
      trail={[]}
      base={`/record/${model}`}
    />
  );
}

function OpenApp() {
  const appId = Number(useParams().appId);
  const menus = useMenus();
  if (!menus.data) return <Skeleton className="m-6 h-8 w-48" />;
  const app = menus.data.byId.get(appId);
  return <Navigate to={(app && menuUrl(app)) || "/"} replace />;
}
