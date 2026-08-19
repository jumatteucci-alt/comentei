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
