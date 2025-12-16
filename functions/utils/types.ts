// Shared TypeScript types and interfaces

// D1Database type - Cloudflare Workers provides this at runtime
// Using a more permissive type to match actual D1 API
export type D1Database = {
  prepare(query: string): {
    all(): Promise<{ results: any[] }>;
    first(): Promise<any>;
    bind(...args: any[]): {
      run(): Promise<{ success: boolean; meta: { changes: number } }>;
      all(): Promise<{ results: any[] }>;
      first(): Promise<any>;
    };
  } & {
    bind(...args: any[]): {
      run(): Promise<{ success: boolean; meta: { changes: number } }>;
      all(): Promise<{ results: any[] }>;
      first(): Promise<any>;
    };
  };
};

// R2Bucket type - Cloudflare Workers provides this at runtime
export type R2Bucket = {
  put(key: string, value: ReadableStream | ArrayBuffer | ArrayBufferView | string | null | Blob, options?: R2PutOptions): Promise<R2Object>;
  get(key: string, options?: R2GetOptions): Promise<R2ObjectBody | null>;
  delete(keys: string | string[]): Promise<void>;
  list(options?: R2ListOptions): Promise<R2Objects>;
};

export interface R2PutOptions {
  httpMetadata?: {
    contentType?: string;
    cacheControl?: string;
  };
  customMetadata?: Record<string, string>;
}

export interface R2GetOptions {
  onlyIf?: R2Conditional;
}

export interface R2ListOptions {
  prefix?: string;
  limit?: number;
  cursor?: string;
}

export interface R2Object {
  key: string;
  size: number;
  etag: string;
  uploaded: Date;
  httpMetadata?: {
    contentType?: string;
    cacheControl?: string;
  };
  customMetadata?: Record<string, string>;
}

export interface R2ObjectBody extends R2Object {
  body: ReadableStream;
  bodyUsed: boolean;
  arrayBuffer(): Promise<ArrayBuffer>;
  text(): Promise<string>;
  json<T = any>(): Promise<T>;
  blob(): Promise<Blob>;
}

export interface R2Objects {
  objects: R2Object[];
  truncated: boolean;
  cursor?: string;
}

export interface R2Conditional {
  etagMatches?: string;
  etagDoesNotMatch?: string;
  uploadedBefore?: Date;
  uploadedAfter?: Date;
}

export interface Env {
  IDEAS_DB: D1Database;
  IMAGES_BUCKET: R2Bucket;
  ANTHROPIC_API_KEY: string;
  PRODUCT_HUNT_API_TOKEN?: string;
  CLERK_SECRET_KEY?: string; // For future auth
}

export interface ProductHuntPost {
  node: {
    id: string;
    name: string;
    tagline: string;
    description: string;
    url: string;
    votesCount: number;
    thumbnail?: {
      url: string;
    };
  };
}

export interface ProductHuntResponse {
  data?: {
    posts: {
      edges: ProductHuntPost[];
    };
  };
  errors?: Array<{
    message: string;
    locations?: Array<{ line: number; column: number }>;
    path?: string[];
  }>;
}

export interface Idea {
  date: string;
  ph_name: string;
  ph_tagline: string;
  ph_description: string;
  ph_url: string;
  ph_upvotes: number;
  ph_image?: string;
  mini_ideas: string[];
  title_summaries: string[]; // Array of title summaries (max 6 words each) matching mini_ideas order
}

export interface IdeaRow {
  id: number;
  date: string;
  ph_name: string;
  ph_tagline: string;
  ph_url: string;
  ph_upvotes: number;
  ph_image?: string;
  mini_idea: string; // JSON string
  title_summaries?: string; // JSON string array of title summaries
  created_at: string;
}

export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  [key: string]: any;
}

export interface PagesFunctionContext {
  request: Request;
  env: Env;
  params?: Record<string, string>;
}

export interface Recipe {
  id: number;
  name: string;
  description?: string;
  prompt_style?: string;
  exclusions: string[]; // Parsed from JSON
  is_default: boolean;
  background_image_url?: string;
  created_at: string;
  updated_at: string;
}

export interface RecipeRow {
  id: number;
  name: string;
  description?: string;
  prompt_style?: string;
  exclusions?: string; // JSON string
  is_default: number; // SQLite stores as 0/1
  background_image_url?: string;
  created_at: string;
  updated_at: string;
}

