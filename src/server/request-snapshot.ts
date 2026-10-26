import "server-only";
import { cache } from "react";
import { loadSnapshot } from "./data";

export const getRequestSnapshot = cache(() => loadSnapshot());
