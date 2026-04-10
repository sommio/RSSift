/** @type {import('tailwindcss').Config} */
const config = {
  theme: {
    extend: {
      boxShadow: {
        reader: "0 18px 50px rgba(15, 23, 42, 0.05)",
      },
      borderRadius: {
        shell: "1.5rem",
      },
      fontSize: {
        "reader-title": [
          "1.75rem",
          {
            lineHeight: "1.12",
            letterSpacing: "-0.03em",
            fontWeight: "600",
          },
        ],
        "reader-title-lg": [
          "2rem",
          {
            lineHeight: "1.1",
            letterSpacing: "-0.03em",
            fontWeight: "600",
          },
        ],
        "reader-body": [
          "1.125rem",
          {
            lineHeight: "2rem",
          },
        ],
        "reader-meta": [
          "0.875rem",
          {
            lineHeight: "1.25rem",
          },
        ],
        "reader-eyebrow": [
          "0.75rem",
          {
            lineHeight: "1rem",
            letterSpacing: "0.2em",
            fontWeight: "600",
          },
        ],
      },
    },
  },
};

export default config;
