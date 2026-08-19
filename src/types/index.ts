export interface Site {
  id: string;
  userId: string;
  name: string;
  domain: string;
  widgetId: string;
  createdAt: number;
  primaryColor: string;
  allowedOrigin: string;
}

export interface Comment {
  id: string;
  siteId: string;
  pageId: string;
  parentId: string | null;
  name: string;
  email: string;
  text: string;
  createdAt: number;
  replies?: Comment[];
}

// ── Popup types ──

export type BlockType = "image" | "title" | "text" | "button" | "countdown" | "email-input";
export type TriggerType = "delay" | "scroll" | "exit";
export type ColumnLayout = 1 | 2 | 3;

export interface BlockBase {
  id: string;
  type: BlockType;
  marginTop?: string;
  marginBottom?: string;
  marginLeft?: string;
  marginRight?: string;
}

export interface ImageBlock extends BlockBase {
  type: "image";
  src: string;
  alt: string;
  width: string; // e.g. "100%"
  borderRadius: string;
  linkUrl?: string;
  linkNewTab?: boolean;
}

export interface TitleBlock extends BlockBase {
  type: "title";
  text: string;
  fontSize: string;
  color: string;
  align: "left" | "center" | "right";
  fontWeight: "400" | "600" | "700";
}

export interface TextBlock extends BlockBase {
  type: "text";
  text: string;
  fontSize: string;
  color: string;
  align: "left" | "center" | "right";
}

export interface ButtonBlock extends BlockBase {
  type: "button";
  label: string;
  url: string;
  openInNewTab: boolean;
  backgroundColor: string;
  color: string;
  fontSize: string;
  borderRadius: string;
  align: "left" | "center" | "right";
  fullWidth: boolean;
}

export interface CountdownBlock extends BlockBase {
  type: "countdown";
  targetDate: string; // ISO string
  expiredText: string;
  color: string;
  fontSize: string;
  align: "left" | "center" | "right";
}

export interface EmailInputBlock extends BlockBase {
  type: "email-input";
  placeholder: string;
  buttonLabel: string;
  buttonColor: string;
  buttonTextColor: string;
  successMessage: string;
  webhookUrl: string;
}

export type Block = ImageBlock | TitleBlock | TextBlock | ButtonBlock | CountdownBlock | EmailInputBlock;

export interface PopupColumn {
  id: string;
  blocks: Block[];
  justifyContent?: "flex-start" | "center" | "flex-end" | "space-between";
  alignItems?: "flex-start" | "center" | "flex-end";
}

export interface PopupRow {
  id: string;
  layout: ColumnLayout;
  columns: PopupColumn[];
}

export interface PopupTrigger {
  type: TriggerType;
  delaySeconds?: number;
  scrollPercent?: number;
}

export type ConditionType =
  | "url_contains" | "url_equals" | "url_starts_with" | "url_not_contains"
  | "cookie_equals" | "cookie_contains" | "cookie_exists" | "cookie_not_exists"
  | "utm_source" | "utm_medium" | "utm_campaign"
  | "device_is";

export type ConditionOperator = "and" | "or";

export interface PopupCondition {
  id: string;
  type: ConditionType;
  key?: string;   // for cookie conditions: cookie name
  value: string;  // the value to match
}

export interface PopupSegmentation {
  operator: ConditionOperator; // "and" | "or" between conditions
  conditions: PopupCondition[];
}

export interface Popup {
  id: string;
  siteId: string;
  name: string;
  active: boolean;
  rows: PopupRow[];
  trigger: PopupTrigger;
  segmentation?: PopupSegmentation;
  // Style
  overlayColor: string;
  backgroundColor: string;
  maxWidth: string;
  padding: string;
  borderRadius: string;
  showCloseButton: boolean;
  // Frequency
  showOncePerSession: boolean;
  createdAt: number;
  updatedAt: number;
}
