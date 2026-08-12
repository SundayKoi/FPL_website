import "@vitest/expect";

declare module "@vitest/expect" {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars, @typescript-eslint/no-explicit-any
  interface Matchers<T = any> {
    toHaveClass(...classNames: string[]): void;
  }
}
