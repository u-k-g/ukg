import "../printer-boot.js";
import { render } from "solid-js/web";
import App from "./App.tsx";
import "./style.css";

render(() => <App />, document.getElementById("root")!);

if (import.meta.env.PROD && navigator.serviceWorker) {
  void navigator.serviceWorker
    .register("/sw.js")
    .catch((error) => console.error("Offline cache registration failed", error));
}
