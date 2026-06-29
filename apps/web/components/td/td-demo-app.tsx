"use client";

import { useState } from "react";
import { SessionTdPort } from "./lib/session-port";
import { TdProvider } from "./lib/td-context";
import { TdShell } from "./td-shell";

/** Public, no-login demo entry — wires the sessionStorage-backed adapter. */
export function TdDemoApp() {
  // One port per mount; reads/writes sessionStorage on the client only.
  const [port] = useState(() => new SessionTdPort());
  return (
    <TdProvider port={port}>
      <TdShell />
    </TdProvider>
  );
}
