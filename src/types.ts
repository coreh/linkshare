export interface ItemConfig {
  title: string;
  type?:
    | "link"
    | "text"
    | "image"
    | "file"
    | "video"
    | "audio"
    | "code"
    | "embed";
  url?: string;
  description?: string;
  icon?: string;
  content?: string;
  file?: string;
  filename?: string;
  language?: string;
  height?: number;
  class?: string;
}

export interface CdnConfig {
  js: "cdnjs" | "jsdelivr" | "unpkg";
  fonts: "google" | "bunny" | "none";
  font_weights: number[];
  hljs_theme: string;
  hljs_theme_dark: string;
}

export interface SectionConfig {
  title: string;
  description?: string;
  password?: string;
  theme?: string;
  dark?: boolean | "auto";
  color?: string;
  background?: string;
  background_color?: string;
  logo?: string;
  font?: string;
  accent_color?: string;
  locale?: string;
  inherit?: boolean;
  hidden?: boolean;
  cdn?: Partial<CdnConfig>;
  items?: ItemConfig[];
}

export interface ResolvedStyle {
  theme: string;
  color: string;
  dark: boolean | "auto";
  font: string;
  background?: string;
  background_color: string;
  background_color_dark?: string;
  background_color_light?: string;
  logo?: string;
  accent_color: string;
  locale: string;
  cdn: CdnConfig;
}

export interface Section {
  slug: string;
  path: string;
  dirPath: string;
  config: SectionConfig;
  children: Section[];
  parent: Section | null;
  style: ResolvedStyle;
  protected: boolean; // true if this section or any ancestor requires a password
  hidden: boolean;
}

export interface ScanResult {
  root: Section;
  sections: Map<string, Section>;
}
