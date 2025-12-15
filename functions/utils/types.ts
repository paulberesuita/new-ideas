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

export interface Env {
  IDEAS_DB: D1Database;
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

