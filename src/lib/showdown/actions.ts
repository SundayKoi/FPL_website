"use server";

import { act, createTable, sitDown, standUp, syncTable } from "./server";

/** Thin Next.js adapters; validation and transitions stay in server.ts. */
export async function createShowdownTableAction(input: unknown) {
  return createTable(input);
}

export async function sitDownAction(input: unknown) {
  return sitDown(input);
}

export async function standUpAction(input: unknown) {
  return standUp(input);
}

export async function showdownActAction(input: unknown) {
  return act(input);
}

export async function syncShowdownTableAction(input: unknown) {
  return syncTable(input);
}
