import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { ComingSoonPage } from "./pages/coming-soon.tsx";
import "./styles.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ComingSoonPage />
  </StrictMode>,
);
