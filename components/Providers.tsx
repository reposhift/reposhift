"use client";

import { ReactNode } from "react";
import { ApiKeyProvider } from "@/lib/api-key-context";
import { AuthProvider } from "@/lib/auth-context";
import { ScanProvider } from "@/lib/scan-context";
import { Header } from "@/components/Header";

export function Providers({ children }: { children: ReactNode }) {
  return (
    <ApiKeyProvider>
      <AuthProvider>
        <ScanProvider>
          <Header />
          {children}
        </ScanProvider>
      </AuthProvider>
    </ApiKeyProvider>
  );
}
