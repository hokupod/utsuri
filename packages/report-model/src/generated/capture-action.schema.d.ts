/* Generated from schemas/capture-action.schema.json. Do not edit directly. */

export type CaptureAction =
  Click | Hover | Focus | Fill | Press | SelectOption | Check | Uncheck | WaitFor | AssertVisible | AssertText;
export type Locator = {
  [k: string]: any;
} & Locator1 & {
    by?: "role" | "label" | "testId" | "text" | "css";
    role?: string;
    name?: string;
    label?: string;
    testId?: string;
    text?: string;
    selector?: string;
    exact?: boolean;
  };
export type Locator1 = {
  [k: string]: any;
};

export interface Click {
  click: LocatorPayload;
}
export interface LocatorPayload {
  locator: Locator;
  timeoutMs?: number;
}
export interface Hover {
  hover: LocatorPayload;
}
export interface Focus {
  focus: LocatorPayload;
}
export interface Fill {
  fill: FillPayload;
}
export interface FillPayload {
  locator: Locator;
  value: string;
  timeoutMs?: number;
}
export interface Press {
  press: PressPayload;
}
export interface PressPayload {
  locator: Locator;
  key: string;
  timeoutMs?: number;
}
export interface SelectOption {
  selectOption: SelectPayload;
}
export interface SelectPayload {
  locator: Locator;
  /**
   * @minItems 1
   * @maxItems 20
   */
  values:
    | [string]
    | [string, string]
    | [string, string, string]
    | [string, string, string, string]
    | [string, string, string, string, string]
    | [string, string, string, string, string, string]
    | [string, string, string, string, string, string, string]
    | [string, string, string, string, string, string, string, string]
    | [string, string, string, string, string, string, string, string, string]
    | [string, string, string, string, string, string, string, string, string, string]
    | [string, string, string, string, string, string, string, string, string, string, string]
    | [string, string, string, string, string, string, string, string, string, string, string, string]
    | [string, string, string, string, string, string, string, string, string, string, string, string, string]
    | [string, string, string, string, string, string, string, string, string, string, string, string, string, string]
    | [
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string
      ]
    | [
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string
      ]
    | [
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string
      ]
    | [
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string
      ]
    | [
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string
      ]
    | [
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string
      ];
  timeoutMs?: number;
}
export interface Check {
  check: LocatorPayload;
}
export interface Uncheck {
  uncheck: LocatorPayload;
}
export interface WaitFor {
  waitFor: WaitPayload;
}
export interface WaitPayload {
  locator: Locator;
  state?: "visible" | "hidden" | "attached" | "detached";
  timeoutMs?: number;
}
export interface AssertVisible {
  assertVisible: LocatorPayload;
}
export interface AssertText {
  assertText: AssertTextPayload;
}
export interface AssertTextPayload {
  locator: Locator;
  expected: string;
  exact?: boolean;
  timeoutMs?: number;
}
