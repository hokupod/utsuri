import { ExitCode, UtsuriError } from "@utsu-ri/core";
import type { CaptureAction } from "@utsu-ri/report-model";
import type { Locator, Page } from "playwright-core";

type LocatorSpec = {
  by?: "role" | "label" | "testId" | "text" | "css";
  role?: string;
  name?: string;
  label?: string;
  testId?: string;
  text?: string;
  selector?: string;
  exact?: boolean;
};

type ActionPayload = {
  locator: LocatorSpec;
  timeoutMs?: number;
  value?: string;
  key?: string;
  values?: string[];
  state?: "visible" | "hidden" | "attached" | "detached";
  expected?: string;
  exact?: boolean;
};

function actionError(id: string, message: string): never {
  throw new UtsuriError(id, message, ExitCode.Incomplete);
}

export function resolveLocator(page: Page, spec: LocatorSpec): Locator {
  const by = spec.by;
  if (by === "role" || (!by && spec.role && spec.name)) {
    if (!spec.role || !spec.name) return actionError("ACTION_LOCATOR_ROLE", "role needs a name");
    return page.getByRole(spec.role as never, { name: spec.name, exact: spec.exact });
  }
  if (by === "label" || (!by && spec.label)) {
    if (!spec.label) return actionError("ACTION_LOCATOR_LABEL", "label is missing");
    return page.getByLabel(spec.label, { exact: spec.exact });
  }
  if (by === "testId" || (!by && spec.testId)) {
    if (!spec.testId) return actionError("ACTION_LOCATOR_TEST_ID", "testId is missing");
    return page.getByTestId(spec.testId);
  }
  if (by === "text" || (!by && spec.text)) {
    if (!spec.text) return actionError("ACTION_LOCATOR_TEXT", "text is missing");
    return page.getByText(spec.text, { exact: spec.exact });
  }
  if (by === "css" || spec.selector) {
    if (!spec.selector) return actionError("ACTION_LOCATOR_CSS", "selector is missing");
    return page.locator(spec.selector);
  }
  return actionError("ACTION_LOCATOR_MISSING", "No supported locator was supplied");
}

async function assertText(locator: Locator, payload: ActionPayload): Promise<void> {
  const expected = payload.expected ?? "";
  const timeout = payload.timeoutMs ?? 5000;
  const deadline = Date.now() + timeout;
  let actual = "";
  do {
    actual = (await locator.textContent({ timeout: Math.min(1000, timeout) })) ?? "";
    if (payload.exact ? actual === expected : actual.includes(expected)) return;
    await new Promise((resolve) => setTimeout(resolve, 50));
  } while (Date.now() < deadline);
  actionError(
    "ACTION_ASSERT_TEXT",
    `Expected ${JSON.stringify(expected)} but received ${JSON.stringify(actual)}`
  );
}

async function executeOne(page: Page, action: CaptureAction): Promise<void> {
  const [operation, rawPayload] = Object.entries(action)[0] as [string, ActionPayload];
  const payload = rawPayload;
  const locator = resolveLocator(page, payload.locator);
  const timeout = payload.timeoutMs ?? 5000;
  switch (operation) {
    case "click":
      await locator.click({ timeout });
      return;
    case "hover":
      await locator.hover({ timeout });
      return;
    case "focus":
      await locator.focus({ timeout });
      return;
    case "fill":
      await locator.fill(payload.value ?? "", { timeout });
      return;
    case "press":
      await locator.press(payload.key ?? "", { timeout });
      return;
    case "selectOption":
      await locator.selectOption(payload.values ?? [], { timeout });
      return;
    case "check":
      await locator.check({ timeout });
      return;
    case "uncheck":
      await locator.uncheck({ timeout });
      return;
    case "waitFor":
      await locator.waitFor({ state: payload.state ?? "visible", timeout });
      return;
    case "assertVisible":
      await locator.waitFor({ state: "visible", timeout });
      return;
    case "assertText":
      await assertText(locator, payload);
      return;
    default:
      return actionError("ACTION_UNSUPPORTED", `Unsupported capture action: ${operation}`);
  }
}

export async function executeCaptureActions(page: Page, actions: CaptureAction[]): Promise<void> {
  let forbiddenEvent: string | null = null;
  const onPopup = (popup: Page) => {
    forbiddenEvent = "popup";
    void popup.close();
  };
  const onDownload = () => {
    forbiddenEvent = "download";
  };
  page.on("popup", onPopup);
  page.on("download", onDownload);
  try {
    for (const action of actions) {
      await executeOne(page, action);
      if (forbiddenEvent) {
        actionError(
          "ACTION_FORBIDDEN_BROWSER_EVENT",
          `Capture action triggered a forbidden ${forbiddenEvent}`
        );
      }
    }
  } finally {
    page.off("popup", onPopup);
    page.off("download", onDownload);
  }
}
