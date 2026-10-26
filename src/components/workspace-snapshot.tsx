"use client";

import { createContext, useContext } from "react";
import type { Snapshot } from "@/lib/types";

export const WorkspaceSnapshot = createContext<Snapshot | null>(null);
export const useWorkspaceSnapshot = () => useContext(WorkspaceSnapshot);
