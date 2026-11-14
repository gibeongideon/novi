import { useActionManager } from "@novi/engine";
import { useEffect } from "react";

import { useActionRunner } from "./useActionRunner";

/**
 * The user's preferences (P2.10.9): Odoo's own preferences form (language, timezone, signature,
 * password, API keys…) in the generic form dialog. Saving reloads the app in the new language.
 */
export function Preferences() {
  const am = useActionManager();
  const runner = useActionRunner(() => undefined);
  useEffect(() => {
    void runner.guard(() => am.preferences());
    // eslint-disable-next-line react-hooks/exhaustive-deps -- opened once per mount
  }, []);
  return <>{runner.ui}</>;
}
