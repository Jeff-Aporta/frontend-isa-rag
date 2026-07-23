declare namespace JSX {
  interface IntrinsicElements {
    "iconify-icon": React.DetailedHTMLProps<
      React.HTMLAttributes<HTMLElement> & {
        icon?: string;
        width?: string | number;
        height?: string | number;
      },
      HTMLElement
    >;
    "wa-button": React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement> & {
      variant?: string;
      size?: string;
      disabled?: boolean;
    };
    "wa-input": React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement> & {
      value?: string;
      placeholder?: string;
      size?: string;
    };
    "wa-textarea": React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement> & {
      value?: string;
      placeholder?: string;
      rows?: number;
    };
    "wa-details": React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement> & {
      open?: boolean;
    };
    "wa-badge": React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement> & {
      variant?: string;
    };
    "wa-divider": React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement>;
    "wa-spinner": React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement>;
  }
}

interface ImportMeta {
  readonly env?: Record<string, string>;
}
