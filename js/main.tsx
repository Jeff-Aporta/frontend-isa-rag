import { createRoot } from "react-dom/client";
import { App } from "./App.tsx";
import { applyTheme, readTheme } from "./theme.ts";

applyTheme(readTheme());

const root = document.getElementById("root");
if (!root) throw new Error("#root missing");
createRoot(root).render(<App />);
