import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

// Always unmount rendered components, including hooks and tests that throw.
// Tests with ordered teardown can still call cleanup before restoring timers
// or browser mocks; a second cleanup here is harmless.
afterEach(cleanup);
