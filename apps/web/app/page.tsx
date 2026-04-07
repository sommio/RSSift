const capabilities = [
  'Next.js App Router web template',
  'NestJS API template',
  'Strict TypeScript, ESLint, Prettier, Jest, and Playwright',
] as const;

export default function Home() {
  return (
    <main>
      <p className="eyebrow">Template baseline</p>
      <h1>Strict monorepo template</h1>
      <p>
        Start from a minimal workspace that keeps web and API concerns separate
        while enforcing a strict TypeScript and linting baseline.
      </p>
      <ul>
        {capabilities.map((capability) => (
          <li key={capability}>{capability}</li>
        ))}
      </ul>
    </main>
  );
}
